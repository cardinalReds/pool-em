import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResult, scoreCustomPrediction, fetchFixtureEvents, fetchFixtureStats, type MatchFacts, type PoolRule } from '@/lib/soccerScoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!
const WC_LEAGUE_ID = 1
const WC_SEASON = 2026

async function fetchFinished() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&status=FT-AET-PEN`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response || []
}

async function fetchLive() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&live=all`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response || []
}

async function fetchAndSeedSquad(teamId: number, teamName: string): Promise<void> {
  // Check if we already have players for this team
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tournament_id', 'wc_2026')

  if (count && count > 0) return // already seeded

  const res = await fetch(
    `https://v3.football.api-sports.io/players/squads?team=${teamId}`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  const squad = data.response?.[0]?.players || []

  if (squad.length === 0) return

  const rows = squad.map((p: any) => ({
    id: p.id,
    name: p.name,
    team_id: teamId,
    team_name: teamName,
    position: p.position || null,
    shirt_number: p.number || null,
    tournament_id: 'wc_2026',
  }))

  await supabase.from('players').upsert(rows, { onConflict: 'id' })
  console.log(`Seeded ${rows.length} players for ${teamName}`)
}

// ── Round specials scoring ────────────────────────────────────────────────
// Matchday round definitions
const MATCHDAY_ROUNDS = [
  { id: 'round_1', start: '2026-06-11', end: '2026-06-17' },
  { id: 'round_2', start: '2026-06-18', end: '2026-06-23' },
  { id: 'round_3', start: '2026-06-24', end: '2026-06-27' },
  { id: 'round_of_32', start: '2026-06-28', end: '2026-07-03' },
  { id: 'round_of_16', start: '2026-07-04', end: '2026-07-07' },
  { id: 'quarter_final', start: '2026-07-09', end: '2026-07-11' },
  { id: 'semi_final', start: '2026-07-14', end: '2026-07-15' },
  { id: 'bronze_final', start: '2026-07-18', end: '2026-07-18' },
  { id: 'final', start: '2026-07-19', end: '2026-07-19' },
]

async function scoreRoundSpecials(allFixtures: any[]) {
  // Get all custom pools
  const { data: pools } = await supabase
    .from('pools')
    .select('id')
    .eq('tournament_id', 'wc_2026')
    .eq('package_id', 'CUSTOM')

  if (!pools?.length) return

  for (const round of MATCHDAY_ROUNDS) {
    // Get all fixtures in this round
    const roundFixtures = allFixtures.filter(f => {
      const iso = f.date?.slice(0, 10) ?? ''
      return iso >= round.start && iso <= round.end
    })

    if (!roundFixtures.length) continue

    // Only score if ALL fixtures in round are finished
    const allFinished = roundFixtures.every(f => f.status === 'FT' || f.scored)
    if (!allFinished) continue

    // Build round facts from all fixtures
    // Teams with clean sheets (conceded 0 goals)
    const cleanSheetTeams = new Set<string>()
    // Teams that scored a penalty
    const penaltyTeams = new Set<string>()
    // Teams that got a red card
    const redCardTeams = new Set<string>()
    // Players who scored a brace (2+ goals)
    const bracePlayers = new Set<string>()

    for (const f of roundFixtures) {
      if (f.home_score === 0) cleanSheetTeams.add(f.away_team)
      if (f.away_score === 0) cleanSheetTeams.add(f.home_team)

      // Get events for this fixture to find penalties, red cards, braces
      if (!f.api_fixture_id) continue
      
      const evRes = await fetch(
        `https://v3.football.api-sports.io/fixtures/events?fixture=${f.api_fixture_id}`,
        { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
      )
      const evData = await evRes.json()
      const events = evData.response || []

      // Penalty goals
      const penGoals = events.filter((e: any) => e.type === 'Goal' && e.detail === 'Penalty')
      penGoals.forEach((e: any) => {
        penaltyTeams.add(e.team.name)
      })

      // Red cards
      const reds = events.filter((e: any) => e.type === 'Card' && (e.detail === 'Red Card' || e.detail === 'Second Yellow Card'))
      reds.forEach((e: any) => {
        redCardTeams.add(e.team.name)
      })

      // Brace scorers (count goals per player)
      const goalsByPlayer: Record<string, number> = {}
      events.filter((e: any) => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.player?.name)
        .forEach((e: any) => {
          const name = e.player.name
          goalsByPlayer[name] = (goalsByPlayer[name] || 0) + 1
        })
      Object.entries(goalsByPlayer).forEach(([name, count]) => {
        if (count >= 2) bracePlayers.add(name)
      })

      await new Promise(r => setTimeout(r, 200)) // rate limit
    }

    // Store round facts for display in UI
    await supabase.from('round_facts').upsert({
      tournament_id: 'wc_2026',
      round_id: round.id,
      clean_sheet_teams: [...cleanSheetTeams],
      penalty_teams: [...penaltyTeams],
      red_card_teams: [...redCardTeams],
      brace_players: [...bracePlayers],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,round_id' })

    // Now score all round special predictions for this round across all pools
    for (const pool of pools) {
      const { data: roundPreds } = await supabase
        .from('predictions_v2')
        .select('id, user_id, category_id, value_text, matchday')
        .eq('pool_id', pool.id)
        .is('fixture_id', null)
        .eq('matchday', round.id)

      for (const pred of roundPreds || []) {
        let points = 0
        let isCorrect = false

        const { data: rule } = await supabase
          .from('pool_rules')
          .select('points')
          .eq('pool_id', pool.id)
          .eq('category_id', pred.category_id)
          .maybeSingle()

        if (!rule) continue
        const pts = rule.points

        switch (pred.category_id) {
          case 'soccer_clean_sheet_round':
            if (pred.value_text && cleanSheetTeams.has(pred.value_text)) {
              points = pts; isCorrect = true
            }
            break
          case 'soccer_penalty_round':
            if (pred.value_text && penaltyTeams.has(pred.value_text)) {
              points = pts; isCorrect = true
            }
            break
          case 'soccer_red_card_round':
            if (pred.value_text && redCardTeams.has(pred.value_text)) {
              points = pts; isCorrect = true
            }
            break
          case 'soccer_brace_round':
            if (pred.value_text && bracePlayers.has(pred.value_text)) {
              points = pts; isCorrect = true
            }
            break
        }

        await supabase
          .from('predictions_v2')
          .update({ points_earned: points, is_correct: isCorrect })
          .eq('id', pred.id)
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
    // Early exit: only call the API if there are live fixtures or unscored finished fixtures
    const { data: pendingFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('tournament_id', 'wc_2026')
      .or('status.eq.live,and(status.eq.FT,scored.eq.false)')
      .limit(1)

    if (!pendingFixtures?.length) {
      return NextResponse.json({ ok: true, fixtures_scored: 0, skipped: true })
    }

    const finishedMatches = await fetchFinished()
    const liveMatches = await fetchLive()
    // Combine: finished first, then live. Use a flag to track which are live-only
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

      // Find our internal fixture by api_fixture_id
      const { data: ourFixture } = await supabase
        .from('fixtures')
        .select('id, scored, status, round, line_total_goals, line_total_corners, line_card_points, line_asian_handicap_home, line_asian_handicap_away, penalty_winner, odds_home, odds_draw, odds_away, closing_odds_home')
        .eq('api_fixture_id', apiFixtureId)
        .maybeSingle()

      if (!ourFixture) continue
      if (ourFixture.scored && !isLiveMatch) continue // skip already-scored finished games; always re-score live games

      const internalFixtureId = ourFixture.id

      // Fetch events (goals, cards) and stats (corners) in parallel
      const homeTeamId: number = match.teams.home.id
      const awayTeamId: number = match.teams.away.id
      const homeTeamName: string = match.teams.home.name
      const awayTeamName: string = match.teams.away.name

      const [eventFacts, cornerFacts] = await Promise.all([
        fetchFixtureEvents(API_FOOTBALL_KEY, apiFixtureId, homeTeamId),
        fetchFixtureStats(API_FOOTBALL_KEY, apiFixtureId),
      ])

      // Seed squads in background (non-blocking)
      fetchAndSeedSquad(homeTeamId, homeTeamName).catch(console.error)
      fetchAndSeedSquad(awayTeamId, awayTeamName).catch(console.error)

      const { firstScorerName, allScorerNames, firstTeamScore, firstYellow, homeCardPts, awayCardPts, htHomeCardPts, htAwayCardPts } = eventFacts
      const actualResult = getResult(homeScore, awayScore)

      // Use odds lines from fixture row
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

      // Update our fixture row — only mark scored=true for finished games
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
      }).eq('id', internalFixtureId)

      // Get all pools using this tournament
      const { data: pools, error: poolsErr } = await supabase
        .from('pools')
        .select('id, package_id')
        .eq('tournament_id', 'wc_2026')

      console.log(`Pools found: ${pools?.length ?? 0}, error: ${poolsErr?.message}`)

      for (const pool of pools || []) {

        // ── CUSTOM pools → predictions_v2 ──────────────────────────────
        if (pool.package_id === 'CUSTOM') {

          // Load this pool's rules
          const { data: rulesData } = await supabase
            .from('pool_rules')
            .select('category_id, points, bonus_points')
            .eq('pool_id', pool.id)

          const ruleMap: Record<string, PoolRule> = {}
          ;(rulesData || []).forEach((r: any) => { ruleMap[r.category_id] = r })

          // Load all predictions_v2 for this fixture in this pool
          const { data: v2preds, error: v2err } = await supabase
            .from('predictions_v2')
            .select('*')
            .eq('pool_id', pool.id)
            .eq('fixture_id', internalFixtureId)

          console.log(`Pool ${pool.id}: ${v2preds?.length ?? 0} preds, rules: ${Object.keys(ruleMap).length}, error: ${v2err?.message}`)

          for (const pred of v2preds || []) {
            const rule = ruleMap[pred.category_id]
            if (!rule) { console.log(`No rule for ${pred.category_id}`); continue }

            const points = scoreCustomPrediction(pred.category_id, pred, facts, rule, fixtureRow)
            const isCorrect = points > 0
            console.log(`${pred.category_id}: ${points} pts`)

            const { error: updateErr } = await supabase
              .from('predictions_v2')
              .update({ points_earned: points, is_correct: isCorrect })
              .eq('id', pred.id)
            if (updateErr) console.log(`Update error: ${updateErr.message}`)
          }

        // ── Legacy pools → predictions ──────────────────────────────────
        } else {
          const { data: predictions } = await supabase
            .from('predictions')
            .select('*')
            .eq('pool_id', pool.id)
            .eq('fixture_id', internalFixtureId)

          for (const pred of predictions || []) {
            let points = 0

            if (pool.package_id === 'WLD' || pool.package_id === 'WLD_1TS') {
              if (pred.predicted_result === actualResult) points += 1
            }
            if (pool.package_id === 'WLD_1TS' || pool.package_id === 'EXACT_1TS') {
              if (firstScorerName && pred.predicted_first_scorer_name &&
                  pred.predicted_first_scorer_name.toLowerCase().trim() ===
                  firstScorerName.toLowerCase().trim()) {
                points += 3
              }
            }
            if (pool.package_id === 'EXACT_SCORE' || pool.package_id === 'EXACT_1TS') {
              if (pred.predicted_home_score === homeScore &&
                  pred.predicted_away_score === awayScore) {
                points += 3
              } else if (pred.predicted_result === actualResult) {
                points += 1
              }
            }

            await supabase
              .from('predictions')
              .update({ points_earned: points })
              .eq('id', pred.id)
          }
        }
      }

      // All predictions scored — mark finished fixtures as done (not live ones)
      if (!isLiveMatch) {
        await supabase.from('fixtures').update({ scored: true }).eq('id', internalFixtureId)
      }
      fixturesScored++
    }

    // ── Score bracket pools ──────────────────────────────────────────────
    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('tournament_id', 'wc_2026')

    // ── Score round specials ─────────────────────────────────────────────
    await scoreRoundSpecials(allFixtures || [])

    return NextResponse.json({ ok: true, fixtures_scored: fixturesScored })
  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
