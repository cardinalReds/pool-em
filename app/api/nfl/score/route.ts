import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreNFLPrediction, type NFLPoolRule, type NFLMatchFacts } from '@/lib/nflScoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const LEAGUE = 1
const SEASON = 2026
const TOURNAMENT_ID = 'nfl_2026'

// Unlike soccer's api-football, this API's `status` query param doesn't reliably filter
// server-side (confirmed empirically), and there's no separate events/stats fetch needed
// — the games list itself already has quarter-by-quarter scores. So this just re-fetches
// the whole season (a few hundred games, one call) and filters client-side.
function isFinished(statusShort: string) {
  return statusShort === 'FT' || statusShort === 'AOT'
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Early exit — only hit the API if something's actually pending, or a "stale"
    // fixture — already scored, but a prediction on it still has points_earned null
    // (a ghost pick edited after the game finished; see app/api/pl/score/route.ts).
    const { data: nflPools } = await supabase.from('pools').select('id').eq('tournament_id', TOURNAMENT_ID)
    const nflPoolIds = (nflPools || []).map(p => p.id)

    const [{ data: pendingFixtures }, { data: ungradedPicks }] = await Promise.all([
      supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', TOURNAMENT_ID)
        .or('status.eq.live,and(status.eq.FT,scored.eq.false)')
        .limit(1),
      nflPoolIds.length
        ? supabase.from('predictions_v2').select('fixture_id').in('pool_id', nflPoolIds).is('points_earned', null).not('fixture_id', 'is', null)
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Ungraded picks are normal for any not-yet-played fixture (scored=false), so only
    // fixtures that are ALREADY scored=true count as "stale" — cross-check against that
    // before trusting the set, otherwise this early-exit never actually exits.
    const nflCandidateFixtureIds = [...new Set((ungradedPicks || []).map((p: any) => p.fixture_id))]
    const { data: nflStaleFixtureRows } = nflCandidateFixtureIds.length
      ? await supabase.from('fixtures').select('id').eq('tournament_id', TOURNAMENT_ID).eq('scored', true).in('id', nflCandidateFixtureIds)
      : { data: [] as any[] }
    const staleFixtureIds = new Set((nflStaleFixtureRows || []).map((f: any) => f.id))

    if (!pendingFixtures?.length && staleFixtureIds.size === 0) {
      return NextResponse.json({ ok: true, fixtures_scored: 0, skipped: true })
    }

    const res = await fetch(
      `https://v1.american-football.api-sports.io/games?league=${LEAGUE}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const games = (data.response || []).filter((g: any) => g.game.stage === 'Regular Season')

    let fixturesScored = 0

    for (const g of games) {
      const homeTotal = g.scores?.home?.total
      const awayTotal = g.scores?.away?.total
      if (homeTotal == null || awayTotal == null) continue // not started or no score yet

      const { data: ourFixture } = await supabase
        .from('fixtures')
        .select('id, scored, status, odds_home, odds_draw, odds_away, closing_odds_home, line_asian_handicap_home, line_total_goals, line_ht_asian_handicap_home, line_ht_total_points')
        .eq('id', g.game.id)
        .maybeSingle()

      if (!ourFixture) continue

      const finished = isFinished(g.game.status.short)
      if (ourFixture.scored && finished && !staleFixtureIds.has(ourFixture.id)) continue // already scored, not live — skip (unless a ghost edit left an ungraded pick)

      const homeQ1 = g.scores?.home?.quarter_1
      const homeQ2 = g.scores?.home?.quarter_2
      const awayQ1 = g.scores?.away?.quarter_1
      const awayQ2 = g.scores?.away?.quarter_2
      const htHomeScore = homeQ1 != null && homeQ2 != null ? homeQ1 + homeQ2 : null
      const htAwayScore = awayQ1 != null && awayQ2 != null ? awayQ1 + awayQ2 : null

      // Freeze whatever odds are on the fixture right now as the closing line, the
      // instant it first goes live — see app/api/live/route.ts for the fuller comment.
      // Functionally redundant for NFL today (odds_home/away already never get touched
      // again once a fixture leaves 'NS' — see app/api/nfl/odds/route.ts), but keeping
      // the same closing_odds_* capture here means the stats page can read one
      // consistent field regardless of sport instead of special-casing NFL.
      const closingOddsUpdate = !finished && ourFixture.status !== 'live' && ourFixture.closing_odds_home == null
        ? { closing_odds_home: ourFixture.odds_home, closing_odds_draw: ourFixture.odds_draw, closing_odds_away: ourFixture.odds_away }
        : {}

      await supabase.from('fixtures').update({
        status: finished ? 'FT' : 'live',
        home_score: homeTotal,
        away_score: awayTotal,
        ht_home_score: htHomeScore,
        ht_away_score: htAwayScore,
        ...closingOddsUpdate,
      }).eq('id', ourFixture.id)

      const facts: NFLMatchFacts = {
        homeScore: homeTotal,
        awayScore: awayTotal,
        htHomeScore,
        htAwayScore,
        spreadLine: ourFixture.line_asian_handicap_home,
        totalLine: ourFixture.line_total_goals,
        htSpreadLine: ourFixture.line_ht_asian_handicap_home,
        htTotalLine: ourFixture.line_ht_total_points,
      }

      for (const pool of nflPools || []) {
        const { data: rulesData } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points')
          .eq('pool_id', pool.id)

        const ruleMap: Record<string, NFLPoolRule> = {}
        ;(rulesData || []).forEach((r: any) => { ruleMap[r.category_id] = r })

        const { data: v2preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', ourFixture.id)

        for (const pred of v2preds || []) {
          const rule = ruleMap[pred.category_id]
          if (!rule) continue

          const points = scoreNFLPrediction(pred.category_id, pred, facts, rule)
          const isCorrect = points > 0

          await supabase
            .from('predictions_v2')
            .update({ points_earned: points, is_correct: isCorrect })
            .eq('id', pred.id)
        }
      }

      if (finished) {
        await supabase.from('fixtures').update({ scored: true }).eq('id', ourFixture.id)
      }
      fixturesScored++
    }

    return NextResponse.json({ ok: true, fixtures_scored: fixturesScored })
  } catch (err) {
    console.error('NFL scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
