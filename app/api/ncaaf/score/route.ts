import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreNFLPrediction, type NFLPoolRule, type NFLMatchFacts } from '@/lib/nflScoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const LEAGUE = 2 // NCAA
const SEASON = 2026
const TOURNAMENT_ID = 'ncaaf_2026'

// See app/api/nfl/score/route.ts — same API, same caveat: no reliable server-side status
// filter, so this re-fetches the whole season and filters client-side.
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
    // Early exit — only hit the API if something's actually pending
    const { data: pendingFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('tournament_id', TOURNAMENT_ID)
      .or('status.eq.live,and(status.eq.FT,scored.eq.false)')
      .limit(1)

    if (!pendingFixtures?.length) {
      return NextResponse.json({ ok: true, fixtures_scored: 0, skipped: true })
    }

    const res = await fetch(
      `https://v1.american-football.api-sports.io/games?league=${LEAGUE}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const games = (data.response || []).filter((g: any) => g.game.stage === 'FBS (Division I-A)')

    let fixturesScored = 0

    for (const g of games) {
      const homeTotal = g.scores?.home?.total
      const awayTotal = g.scores?.away?.total
      if (homeTotal == null || awayTotal == null) continue // not started or no score yet

      const { data: ourFixture } = await supabase
        .from('fixtures')
        .select('id, scored, status, odds_home, odds_draw, odds_away, closing_odds_home, closing_odds_draw, closing_odds_away, line_asian_handicap_home, line_total_goals, line_ht_asian_handicap_home, line_ht_total_points')
        .eq('id', g.game.id)
        .maybeSingle()

      if (!ourFixture) continue

      const finished = isFinished(g.game.status.short)
      if (ourFixture.scored && finished) continue // already scored, not live — skip

      const homeQ1 = g.scores?.home?.quarter_1
      const homeQ2 = g.scores?.home?.quarter_2
      const awayQ1 = g.scores?.away?.quarter_1
      const awayQ2 = g.scores?.away?.quarter_2
      const htHomeScore = homeQ1 != null && homeQ2 != null ? homeQ1 + homeQ2 : null
      const htAwayScore = awayQ1 != null && awayQ2 != null ? awayQ1 + awayQ2 : null

      // First time this fixture is seen live — freeze whatever odds are on it right now
      // as the closing line, same as app/api/nfl/score/route.ts's odds cron never touches
      // a fixture again once it leaves 'NS', except here that freeze has to happen
      // explicitly since this route (not the odds cron) is what flips status to live.
      const justWentLive = ourFixture.status !== 'live' && !finished
      const closingOddsUpdate = justWentLive && ourFixture.closing_odds_home == null
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

      const { data: pools } = await supabase.from('pools').select('id').eq('tournament_id', TOURNAMENT_ID)

      for (const pool of pools || []) {
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
    console.error('NCAAF scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
