import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResult, scoreCustomPrediction, fetchFixtureEvents, fetchFixtureStats, type MatchFacts, type PoolRule } from '@/lib/soccerScoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!
const UCL_LEAGUE_ID = 2
const SEASON = 2026
const TOURNAMENT_ID = 'ucl_2026'

async function fetchFinished() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${UCL_LEAGUE_ID}&season=${SEASON}&status=FT-AET-PEN`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response || []
}

async function fetchLive() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${UCL_LEAGUE_ID}&season=${SEASON}&live=all`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response || []
}

function parseMatchday(round: string): number | null {
  const m = (round || '').match(/Matchday (\d+)/)
  return m ? parseInt(m[1]) : null
}

// Round specials (clean sheet / brace / red card / penalty "of the round") for the league
// phase only — mirrors app/api/pl/score/route.ts exactly, matchdays are named the same way.
// Knockout rounds (Round of 16 onward) are single games, not "of the round" pools of games,
// so they're excluded here the same way WC's version would need to be for its group stage.
async function scoreRoundSpecials(allFixtures: any[]) {
  const { data: pools } = await supabase
    .from('pools')
    .select('id')
    .eq('tournament_id', TOURNAMENT_ID)
    .eq('package_id', 'CUSTOM')

  if (!pools?.length) return

  const byMatchday: Record<number, any[]> = {}
  for (const f of allFixtures) {
    const md = parseMatchday(f.round)
    if (md === null) continue
    if (!byMatchday[md]) byMatchday[md] = []
    byMatchday[md].push(f)
  }

  for (const [mdStr, fixtures] of Object.entries(byMatchday)) {
    const matchday = parseInt(mdStr)
    const allFinished = fixtures.every(f => f.status === 'FT' || f.scored)
    if (!allFinished) continue

    const roundId = `matchday_${matchday}`

    const { data: existingFacts } = await supabase
      .from('round_facts')
      .select('clean_sheet_teams, penalty_teams, red_card_teams, brace_players')
      .eq('tournament_id', TOURNAMENT_ID)
      .eq('round_id', roundId)
      .maybeSingle()

    let cleanSheetTeams: Set<string>
    let penaltyTeams: Set<string>
    let redCardTeams: Set<string>
    let bracePlayers: Set<string>

    if (existingFacts) {
      cleanSheetTeams = new Set(existingFacts.clean_sheet_teams || [])
      penaltyTeams = new Set(existingFacts.penalty_teams || [])
      redCardTeams = new Set(existingFacts.red_card_teams || [])
      bracePlayers = new Set(existingFacts.brace_players || [])
    } else {
      cleanSheetTeams = new Set()
      penaltyTeams = new Set()
      redCardTeams = new Set()
      bracePlayers = new Set()

      for (const f of fixtures) {
        if (f.home_score === 0) cleanSheetTeams.add(f.away_team)
        if (f.away_score === 0) cleanSheetTeams.add(f.home_team)

        if (!f.api_fixture_id) continue
        const evRes = await fetch(
          `https://v3.football.api-sports.io/fixtures/events?fixture=${f.api_fixture_id}`,
          { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
        )
        const evData = await evRes.json()
        const events = evData.response || []

        const penGoals = events.filter((e: any) => e.type === 'Goal' && e.detail === 'Penalty')
        penGoals.forEach((e: any) => penaltyTeams.add(e.team.name))

        const reds = events.filter((e: any) => e.type === 'Card' && (e.detail === 'Red Card' || e.detail === 'Second Yellow Card'))
        reds.forEach((e: any) => redCardTeams.add(e.team.name))

        const goalsByPlayer: Record<string, number> = {}
        events.filter((e: any) => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.player?.name)
          .forEach((e: any) => { goalsByPlayer[e.player.name] = (goalsByPlayer[e.player.name] || 0) + 1 })
        Object.entries(goalsByPlayer).forEach(([name, count]) => { if (count >= 2) bracePlayers.add(name) })

        await new Promise(r => setTimeout(r, 200)) // rate limit
      }

      await supabase.from('round_facts').upsert({
        tournament_id: TOURNAMENT_ID,
        round_id: roundId,
        clean_sheet_teams: [...cleanSheetTeams],
        penalty_teams: [...penaltyTeams],
        red_card_teams: [...redCardTeams],
        brace_players: [...bracePlayers],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tournament_id,round_id' })
    }

    for (const pool of pools) {
      const { data: roundPreds } = await supabase
        .from('predictions_v2')
        .select('id, user_id, category_id, value_text, matchday')
        .eq('pool_id', pool.id)
        .is('fixture_id', null)
        .eq('matchday', matchday)

      for (const pred of roundPreds || []) {
        const { data: rule } = await supabase
          .from('pool_rules')
          .select('points')
          .eq('pool_id', pool.id)
          .eq('category_id', pred.category_id)
          .maybeSingle()
        if (!rule) continue

        let points = 0
        let isCorrect = false
        switch (pred.category_id) {
          case 'soccer_clean_sheet_round':
            if (pred.value_text && cleanSheetTeams.has(pred.value_text)) { points = rule.points; isCorrect = true }
            break
          case 'soccer_penalty_round':
            if (pred.value_text && penaltyTeams.has(pred.value_text)) { points = rule.points; isCorrect = true }
            break
          case 'soccer_red_card_round':
            if (pred.value_text && redCardTeams.has(pred.value_text)) { points = rule.points; isCorrect = true }
            break
          case 'soccer_brace_round':
            if (pred.value_text && bracePlayers.has(pred.value_text)) { points = rule.points; isCorrect = true }
            break
        }

        await supabase.from('predictions_v2').update({ points_earned: points, is_correct: isCorrect }).eq('id', pred.id)
      }
    }
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: pools } = await supabase.from('pools').select('id').eq('tournament_id', TOURNAMENT_ID)
    const poolIds = (pools || []).map(p => p.id)

    const [{ data: pendingFixtures }, { data: ungradedPicks }] = await Promise.all([
      supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', TOURNAMENT_ID)
        .or('status.eq.live,and(status.eq.FT,scored.eq.false)')
        .limit(1),
      poolIds.length
        ? supabase.from('predictions_v2').select('fixture_id').in('pool_id', poolIds).is('points_earned', null).not('fixture_id', 'is', null)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const candidateFixtureIds = [...new Set((ungradedPicks || []).map((p: any) => p.fixture_id))]
    const { data: staleFixtureRows } = candidateFixtureIds.length
      ? await supabase.from('fixtures').select('id').eq('tournament_id', TOURNAMENT_ID).eq('scored', true).in('id', candidateFixtureIds)
      : { data: [] as any[] }
    const staleFixtureIds = new Set((staleFixtureRows || []).map((f: any) => f.id))

    if (!pendingFixtures?.length && staleFixtureIds.size === 0) {
      return NextResponse.json({ ok: true, fixtures_scored: 0, skipped: true })
    }

    const finishedMatches = await fetchFinished()
    const liveMatches = await fetchLive()
    const allMatches = [
      ...finishedMatches.map((m: any) => ({ ...m, _isLive: false })),
      ...liveMatches.map((m: any) => ({ ...m, _isLive: true })),
    ]
    let fixturesScored = 0

    for (const match of allMatches) {
      const isLiveMatch = match._isLive
      const apiFixtureId: number = match.fixture.id
      const homeScore: number = match.goals.home
      const awayScore: number = match.goals.away

      if (homeScore === null || awayScore === null) continue

      const { data: ourFixture } = await supabase
        .from('fixtures')
        .select('id, scored, status, round, line_total_goals, line_total_corners, line_card_points, line_asian_handicap_home, line_asian_handicap_away, penalty_winner, odds_home, odds_draw, odds_away, closing_odds_home')
        .eq('api_fixture_id', apiFixtureId)
        .maybeSingle()

      if (!ourFixture) continue
      if (ourFixture.scored && !isLiveMatch && !staleFixtureIds.has(ourFixture.id)) continue

      const internalFixtureId = ourFixture.id

      const homeTeamId: number = match.teams.home.id
      const homeTeamName: string = match.teams.home.name
      const awayTeamName: string = match.teams.away.name

      const [eventFacts, cornerFacts] = await Promise.all([
        fetchFixtureEvents(API_FOOTBALL_KEY, apiFixtureId, homeTeamId),
        fetchFixtureStats(API_FOOTBALL_KEY, apiFixtureId),
      ])

      const { firstScorerName, allScorerNames, firstTeamScore, firstYellow, homeCardPts, awayCardPts, htHomeCardPts, htAwayCardPts } = eventFacts

      const fixtureRow = ourFixture
      const facts: MatchFacts = {
        homeScore, awayScore,
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        htHome: match.score?.halftime?.home ?? null,
        htAway: match.score?.halftime?.away ?? null,
        firstScorerName,
        allScorerNames,
        firstTeamScore,
        firstYellow,
        homeCorners: cornerFacts.homeCorners,
        awayCorners: cornerFacts.awayCorners,
        htHomeCorners: cornerFacts.htHomeCorners,
        htAwayCorners: cornerFacts.htAwayCorners,
        homeCardPts,
        awayCardPts,
        htHomeCardPts,
        htAwayCardPts,
        goalsLine: fixtureRow?.line_total_goals ?? null,
        cornersLine: fixtureRow?.line_total_corners ?? null,
        cardPtsLine: fixtureRow?.line_card_points ?? null,
      }

      const closingOddsUpdate = isLiveMatch && ourFixture.status !== 'live' && ourFixture.closing_odds_home == null
        ? { closing_odds_home: ourFixture.odds_home, closing_odds_draw: ourFixture.odds_draw, closing_odds_away: ourFixture.odds_away }
        : {}

      await supabase.from('fixtures').update({
        status: isLiveMatch ? 'live' : 'FT',
        home_score: homeScore,
        away_score: awayScore,
        first_scorer_name: firstScorerName,
        ht_home_score: facts.htHome,
        ht_away_score: facts.htAway,
        live_home_corners: cornerFacts.homeCorners,
        live_away_corners: cornerFacts.awayCorners,
        ht_home_corners: cornerFacts.htHomeCorners,
        ht_away_corners: cornerFacts.htAwayCorners,
        live_home_cards: homeCardPts,
        live_away_cards: awayCardPts,
        ht_home_card_pts: htHomeCardPts,
        ht_away_card_pts: htAwayCardPts,
        first_yellow_team: firstYellow === 'none' ? null : firstYellow,
        first_team_score: firstTeamScore === 'none' ? null : firstTeamScore,
        ...closingOddsUpdate,
      }).eq('id', internalFixtureId)

      for (const pool of pools || []) {
        const { data: rulesData } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points')
          .eq('pool_id', pool.id)

        const ruleMap: Record<string, PoolRule> = {}
        ;(rulesData || []).forEach((r: any) => { ruleMap[r.category_id] = r })

        const { data: v2preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', internalFixtureId)

        for (const pred of v2preds || []) {
          const rule = ruleMap[pred.category_id]
          if (!rule) continue

          // Unlike PL, UCL has real knockout rounds (Round of 16 onward) — leave
          // knockoutRoundNames at its default so soccer_team_to_advance etc. work once
          // those rounds are synced, instead of suppressing it like PL does.
          const points = scoreCustomPrediction(pred.category_id, pred, facts, rule, fixtureRow)
          const isCorrect = points > 0

          await supabase
            .from('predictions_v2')
            .update({ points_earned: points, is_correct: isCorrect })
            .eq('id', pred.id)
        }
      }

      if (!isLiveMatch) {
        await supabase.from('fixtures').update({ scored: true }).eq('id', internalFixtureId)
      }
      fixturesScored++
    }

    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('tournament_id', TOURNAMENT_ID)

    await scoreRoundSpecials(allFixtures || [])

    return NextResponse.json({ ok: true, fixtures_scored: fixturesScored })
  } catch (err) {
    console.error('UCL scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
