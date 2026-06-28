import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!
const WC_LEAGUE_ID = 1
const WC_SEASON = 2026

async function fetchFinished() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&status=FT`,
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

interface EventFacts {
  firstScorerName: string | null
  allScorerNames: string[]
  firstTeamScore: 'home' | 'away' | 'none'
  firstYellow: 'home' | 'away' | 'none'
  homeCardPts: number
  awayCardPts: number
  htHomeCardPts: number
  htAwayCardPts: number
}

async function fetchFixtureEvents(fixtureId: number, homeTeamId: number): Promise<EventFacts> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  const events: any[] = (data.response || []).sort((a: any, b: any) => {
    const aTime = a.time.elapsed + (a.time.extra || 0)
    const bTime = b.time.elapsed + (b.time.extra || 0)
    return aTime - bTime
  })

  let firstScorerName: string | null = null
  const allScorerNames: string[] = []
  let firstTeamScore: 'home' | 'away' | 'none' = 'none'
  let firstYellow: 'home' | 'away' | 'none' = 'none'
  let homeCardPts = 0
  let awayCardPts = 0
  let htHomeCardPts = 0
  let htAwayCardPts = 0

  for (const event of events) {
    const isHome = event.team.id === homeTeamId
    const side = isHome ? 'home' : 'away'
    const elapsed = event.time.elapsed + (event.time.extra || 0)
    const isFirstHalf = elapsed <= 45

    if (event.type === 'Goal' && event.detail !== 'Missed Penalty') {
      const scorerName = event.player?.name || null
      if (firstScorerName === null) {
        firstScorerName = scorerName
        firstTeamScore = side
      }
      if (scorerName) allScorerNames.push(scorerName)
    }

    if (event.type === 'Card') {
      if (event.detail === 'Yellow Card') {
        if (firstYellow === 'none') firstYellow = side
        if (isHome) { homeCardPts += 10; if (isFirstHalf) htHomeCardPts += 10 }
        else { awayCardPts += 10; if (isFirstHalf) htAwayCardPts += 10 }
      }
      if (event.detail === 'Red Card') {
        // Straight red = 25pts
        if (isHome) { homeCardPts += 25; if (isFirstHalf) htHomeCardPts += 25 }
        else { awayCardPts += 25; if (isFirstHalf) htAwayCardPts += 25 }
      }
      if (event.detail === 'Second Yellow Card') {
        // Second yellow = 35pts total (10 for yellow already counted + 25 for red)
        // The yellow was already counted above, so add 25 more
        if (isHome) { homeCardPts += 25; if (isFirstHalf) htHomeCardPts += 25 }
        else { awayCardPts += 25; if (isFirstHalf) htAwayCardPts += 25 }
      }
    }
  }

  return { firstScorerName, allScorerNames, firstTeamScore, firstYellow, homeCardPts, awayCardPts, htHomeCardPts, htAwayCardPts }
}

interface CornerFacts {
  homeCorners: number | null
  awayCorners: number | null
  htHomeCorners: number | null
  htAwayCorners: number | null
}

async function fetchFixtureStats(fixtureId: number): Promise<CornerFacts> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  const teams: any[] = data.response || []

  let homeCorners: number | null = null
  let awayCorners: number | null = null

  teams.forEach((team: any, idx: number) => {
    const cornerStat = team.statistics?.find((s: any) => s.type === 'Corner Kicks')
    const val = cornerStat ? parseInt(cornerStat.value) || 0 : null
    if (idx === 0) homeCorners = val
    else awayCorners = val
  })

  // Fetch HT stats
  let htHomeCorners: number | null = null
  let htAwayCorners: number | null = null
  try {
    const htRes = await fetch(
      `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}&half=true`,
      { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
    )
    const htData = await htRes.json()
    const htTeams: any[] = htData.response || []
    htTeams.forEach((team: any, idx: number) => {
      const stat = team.statistics?.find((s: any) => s.type === 'Corner Kicks')
      const val = stat ? parseInt(stat.value) || 0 : null
      if (idx === 0) htHomeCorners = val
      else htAwayCorners = val
    })
  } catch {}

  return { homeCorners, awayCorners, htHomeCorners, htAwayCorners }
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

function getResult(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

// ── Custom ruleset scoring ──────────────────────────────────────────────────
// Returns points earned for a single predictions_v2 row given match facts.
function scoreCustomPrediction(
  categoryId: string,
  pred: any,
  facts: MatchFacts,
  rule: PoolRule,
  fixtureRow?: any,
): number {
  const { homeScore, awayScore, htHome, htAway, firstScorerName } = facts
  const actual = getResult(homeScore, awayScore)
  const htActual = getResult(htHome ?? 0, htAway ?? 0)

  switch (categoryId) {

    // ── Win/Loss/Draw style ──────────────────────────────────────────────
    case 'soccer_result':
      return pred.value_wld === actual ? rule.points : 0

    case 'soccer_team_to_advance': {
      if (!pred.value_wld) return 0
      // Only applies to knockout rounds
      const round = fixtureRow?.round || ''
      const knockoutRounds = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
      if (!knockoutRounds.some(r => round.includes(r))) return 0
      // Determine who actually advanced — 90min result, then ET, then penalties
      let winner: 'home' | 'away' | null = null
      if (homeScore > awayScore) winner = 'home'
      else if (awayScore > homeScore) winner = 'away'
      else if (fixtureRow?.penalty_winner) {
        // penalty_winner stores the team name
        winner = fixtureRow.penalty_winner === facts.homeTeam ? 'home' : 'away'
      }
      if (!winner) return 0
      return pred.value_wld === winner ? rule.points : 0
    }

    case 'soccer_ht_result':
      return htHome !== null && pred.value_wld === htActual ? rule.points : 0

    case 'soccer_asian_handicap': {
      // handicap: home wins if (homeScore + handicapHome) > awayScore
      if (!fixtureRow?.line_asian_handicap_home) return 0
      const handicap = fixtureRow.line_asian_handicap_home
      const adjustedHome = homeScore + handicap
      const ahResult = adjustedHome > awayScore ? 'home' : adjustedHome < awayScore ? 'away' : 'draw'
      return pred.value_wld === ahResult ? rule.points : 0
    }

    case 'soccer_first_team_score':
      if (!pred.value_wld) return 0
      // 'none' means user predicted no goal — award points if no team scored first
      if (pred.value_wld === 'none') return facts.firstTeamScore === 'none' ? rule.points : 0
      if (facts.firstTeamScore === 'none') return 0
      return pred.value_wld === facts.firstTeamScore ? rule.points : 0

    case 'soccer_corners_winner': {
      if (facts.homeCorners === null || facts.awayCorners === null) return 0
      return pred.value_wld === getResult(facts.homeCorners, facts.awayCorners) ? rule.points : 0
    }

    case 'soccer_ht_corners_winner': {
      if (facts.htHomeCorners === null || facts.htAwayCorners === null) return 0
      return pred.value_wld === getResult(facts.htHomeCorners, facts.htAwayCorners) ? rule.points : 0
    }

    case 'soccer_cards_ht':
      return pred.value_wld === getResult(facts.htHomeCardPts, facts.htAwayCardPts) ? rule.points : 0

    case 'soccer_cards_home_away':
      return pred.value_wld === getResult(facts.homeCardPts, facts.awayCardPts) ? rule.points : 0

    case 'soccer_first_yellow_team':
      return pred.value_wld === facts.firstYellow ? rule.points : 0

    // ── Exact score ──────────────────────────────────────────────────────
    // Per-team scoring: +points per correct team score, +bonus_points if both correct
    case 'soccer_exact_score':
    case 'soccer_ht_exact_score': {
      const raw = pred.value_text || ''
      const parts = raw.split('-')
      if (parts.length !== 2) return 0
      const predHome = parseInt(parts[0])
      const predAway = parseInt(parts[1])
      if (isNaN(predHome) || isNaN(predAway)) return 0

      const actualHome = categoryId === 'soccer_exact_score' ? homeScore : (htHome ?? -1)
      const actualAway = categoryId === 'soccer_exact_score' ? awayScore : (htAway ?? -1)

      const homeCorrect = predHome === actualHome
      const awayCorrect = predAway === actualAway
      let pts = 0
      if (homeCorrect) pts += rule.points
      if (awayCorrect) pts += rule.points
      if (homeCorrect && awayCorrect) pts += rule.bonus_points
      return pts
    }

    // ── Yes/No ───────────────────────────────────────────────────────────
    case 'soccer_btts':
      return pred.value_yesno === (homeScore > 0 && awayScore > 0) ? rule.points : 0

    // ── Over/Under ───────────────────────────────────────────────────────
    case 'soccer_total_goals_ou': {
      const line = facts.goalsLine ?? 2.5
      const over = (homeScore + awayScore) > line
      return pred.value_ou === (over ? 'over' : 'under') ? rule.points : 0
    }

    case 'soccer_total_corners_ou': {
      if (facts.homeCorners === null) return 0
      const line = facts.cornersLine ?? 9.5
      const total = facts.homeCorners + facts.awayCorners!
      return pred.value_ou === (total > line ? 'over' : 'under') ? rule.points : 0
    }

    case 'soccer_card_points_ou': {
      const line = facts.cardPtsLine ?? 30
      const total = facts.homeCardPts + facts.awayCardPts
      return pred.value_ou === (total > line ? 'over' : 'under') ? rule.points : 0
    }

    // ── Player/text ───────────────────────────────────────────────────────
    case 'soccer_first_goalscorer': {
      // Handle 'no goal' pick (value_wld = 'none')
      if (pred.value_wld === 'none') {
        return (!firstScorerName || firstScorerName === 'no goal') ? rule.points : 0
      }
      if (!firstScorerName || !pred.value_text) return 0

      // Own goal matching — "Own Goal (Mexico)" matches "Own Goal (Mexico)"
      if (firstScorerName.startsWith('Own Goal') && pred.value_text.startsWith('Own Goal')) {
        return firstScorerName === pred.value_text ? rule.points : 0
      }
      // If actual was own goal but user picked a player (or vice versa), no match
      if (firstScorerName.startsWith('Own Goal') || pred.value_text.startsWith('Own Goal')) return 0

      const normalizeScorer = (name: string) => {
        name = name.replace(/\s+/g, ' ').trim()
        // Strip accents
        name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const parts = name.split(' ')
        if (parts.length >= 2 && !name.includes('.')) {
          return `${parts[0][0]}. ${parts.slice(1).join(' ')}`.toLowerCase()
        }
        return name.toLowerCase()
      }
      return normalizeScorer(pred.value_text) === normalizeScorer(firstScorerName) ? rule.points : 0
    }

    case 'soccer_anytime_goalscorer': {
      if (!pred.value_text || facts.allScorerNames.length === 0) return 0
      const normalizeA = (name: string) => {
        name = name.replace(/\s+/g, ' ').trim()
        name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const parts = name.split(' ')
        if (parts.length >= 2 && !name.includes('.')) {
          return `${parts[0][0]}. ${parts.slice(1).join(' ')}`.toLowerCase()
        }
        return name.toLowerCase()
      }
      return facts.allScorerNames.some(name =>
        normalizeA(name) === normalizeA(pred.value_text)
      ) ? rule.points : 0
    }

    default:
      return 0
  }
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

interface MatchFacts {
  homeScore: number
  awayScore: number
  homeTeam: string
  awayTeam: string
  htHome: number | null
  htAway: number | null
  firstScorerName: string | null
  allScorerNames: string[]
  firstTeamScore: 'home' | 'away' | 'none'
  firstYellow: 'home' | 'away' | 'none'
  homeCorners: number | null
  awayCorners: number | null
  htHomeCorners: number | null
  htAwayCorners: number | null
  homeCardPts: number
  awayCardPts: number
  htHomeCardPts: number
  htAwayCardPts: number
  goalsLine: number | null
  cornersLine: number | null
  cardPtsLine: number | null
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

// ── Bracket scoring ────────────────────────────────────────────────────────
// Groups: A-L, each team plays 3 games. Track wins/draws/losses/gd/gf.
// After each game finishes we recalculate standings + bracket scores.

interface TeamStanding {
  team: string
  pts: number
  gd: number
  gf: number
  played: number
}

function buildGroupStandings(fixtures: any[]): Record<string, TeamStanding[]> {
  const standings: Record<string, Record<string, TeamStanding>> = {}

  for (const f of fixtures) {
    if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
    const group = f.round?.replace('Group Stage - ', '').replace('Group ', '') || ''
    if (!group || group.length !== 1) continue

    if (!standings[group]) standings[group] = {}
    const s = standings[group]

    if (!s[f.home_team]) s[f.home_team] = { team: f.home_team, pts: 0, gd: 0, gf: 0, played: 0 }
    if (!s[f.away_team]) s[f.away_team] = { team: f.away_team, pts: 0, gd: 0, gf: 0, played: 0 }

    const h = f.home_score, a = f.away_score
    s[f.home_team].played++
    s[f.away_team].played++
    s[f.home_team].gf += h; s[f.home_team].gd += h - a
    s[f.away_team].gf += a; s[f.away_team].gd += a - h

    if (h > a) { s[f.home_team].pts += 3 }
    else if (h < a) { s[f.away_team].pts += 3 }
    else { s[f.home_team].pts += 1; s[f.away_team].pts += 1 }
  }

  const result: Record<string, TeamStanding[]> = {}
  for (const [group, teams] of Object.entries(standings)) {
    result[group] = Object.values(teams).sort((a, b) =>
      b.pts !== a.pts ? b.pts - a.pts :
      b.gd !== a.gd ? b.gd - a.gd :
      b.gf - a.gf
    )
  }
  return result
}

function buildKnockoutResults(fixtures: any[]): Record<string, string> {
  // Map: round name → winning team
  const results: Record<string, string> = {}
  for (const f of fixtures) {
    if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
    const round = f.round || ''
    if (!round.includes('Round of') && !round.includes('Quarter') &&
        !round.includes('Semi') && !round.includes('Final')) continue

    // Store which teams advanced (winner goes through)
    const winner = f.home_score > f.away_score ? f.home_team :
                   f.away_score > f.home_score ? f.away_team :
                   null // draw in group stage — no winner
    if (winner) results[`${round}:${f.home_team}vs${f.away_team}`] = winner
  }
  return results
}

async function scoreBracketPools(allFixtures: any[]) {
  // Get all bracket pools
  const { data: bracketPools } = await supabase
    .from('pools')
    .select('id')
    .eq('deadline_type', 'before_tournament')
    .eq('tournament_id', 'wc_2026')

  if (!bracketPools?.length) return

  const groupStandings = buildGroupStandings(allFixtures)

  // Build set of teams that have actually advanced to each round from real fixtures
  const advancedToRound: Record<string, Set<string>> = {
    'R32': new Set(), 'R16': new Set(), 'QF': new Set(), 'SF': new Set(), 'FINAL': new Set(), 'CHAMPION': new Set()
  }

  for (const f of allFixtures) {
    if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
    const r = f.round || ''

    // Teams appearing in a round have advanced to it
    if (r.includes('Round of 32')) {
      advancedToRound['R32'].add(f.home_team)
      advancedToRound['R32'].add(f.away_team)
      const winner = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
      if (winner) advancedToRound['R16'].add(winner)
    }
    if (r.includes('Round of 16')) {
      advancedToRound['R16'].add(f.home_team)
      advancedToRound['R16'].add(f.away_team)
      const winner = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
      if (winner) advancedToRound['QF'].add(winner)
    }
    if (r.includes('Quarter-finals')) {
      advancedToRound['QF'].add(f.home_team)
      advancedToRound['QF'].add(f.away_team)
      const winner = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
      if (winner) advancedToRound['SF'].add(winner)
    }
    if (r.includes('Semi-finals')) {
      advancedToRound['SF'].add(f.home_team)
      advancedToRound['SF'].add(f.away_team)
      const winner = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
      if (winner) advancedToRound['FINAL'].add(winner)
    }
    if (r === 'Final') {
      advancedToRound['FINAL'].add(f.home_team)
      advancedToRound['FINAL'].add(f.away_team)
      const winner = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
      if (winner) advancedToRound['CHAMPION'].add(winner)
    }
  }

  for (const pool of bracketPools) {
    // Load scoring rules
    const { data: rulesRow } = await supabase
      .from('bracket_scoring_rules')
      .select('*')
      .eq('pool_id', pool.id)
      .maybeSingle()

    if (!rulesRow) continue

    const rules = {
      groupFormat: rulesRow.group_format || 'standings',
      standingsFirst: rulesRow.standings_first ?? 3,
      standingsSecond: rulesRow.standings_second ?? 2,
      standingsThird: rulesRow.standings_third ?? 1,
      wldPts: rulesRow.wld_pts ?? 1,
      r32Pts: rulesRow.r32_pts ?? 1,
      r16Pts: rulesRow.r16_pts ?? 2,
      qfPts: rulesRow.qf_pts ?? 4,
      sfPts: rulesRow.sf_pts ?? 6,
      finalPts: rulesRow.final_pts ?? 12,
    }

    // Load all bracket picks for this pool
    const { data: allPicks } = await supabase
      .from('bracket_picks')
      .select('*')
      .eq('pool_id', pool.id)

    for (const pick of allPicks || []) {
      let totalPts = 0
      const breakdown: Record<string, number> = {}

      // ── Group stage scoring ───────────────────────────────────────────
      const groupPicks: Record<string, string[]> = pick.group_picks || {}

      for (const [group, predicted] of Object.entries(groupPicks)) {
        const actual = groupStandings[group]
        if (!actual || actual[0]?.played < 3) continue // group not finished yet

        if (rules.groupFormat === 'standings') {
          const actualFirst = actual[0]?.team
          const actualSecond = actual[1]?.team
          const actualThird = actual[2]?.team

          if (predicted[0] === actualFirst) { totalPts += rules.standingsFirst; breakdown[`group_${group}_1st`] = rules.standingsFirst }
          if (predicted[1] === actualSecond) { totalPts += rules.standingsSecond; breakdown[`group_${group}_2nd`] = rules.standingsSecond }
          if (predicted[2] === actualThird) { totalPts += rules.standingsThird; breakdown[`group_${group}_3rd`] = rules.standingsThird }
        } else if (rules.groupFormat === 'wld') {
          // Score each game pick — not implemented yet since WLD group picks
          // require a different data structure
        }
      }

      // ── Knockout scoring ──────────────────────────────────────────────
      const bracketPicksData: Record<string, string> = pick.bracket_picks || {}

      // R32 slots
      const r32Slots = Object.keys(bracketPicksData).filter(k => k.startsWith('R32_'))
      for (const slot of r32Slots) {
        const pickedTeam = bracketPicksData[slot]
        if (pickedTeam && advancedToRound['R32'].has(pickedTeam)) {
          totalPts += rules.r32Pts
          breakdown[slot] = rules.r32Pts
        }
      }

      // R16 slots
      const r16Slots = Object.keys(bracketPicksData).filter(k => k.startsWith('R16_'))
      for (const slot of r16Slots) {
        const pickedTeam = bracketPicksData[slot]
        if (pickedTeam && advancedToRound['R16'].has(pickedTeam)) {
          totalPts += rules.r16Pts
          breakdown[slot] = rules.r16Pts
        }
      }

      // QF slots
      const qfSlots = Object.keys(bracketPicksData).filter(k => k.startsWith('QF_'))
      for (const slot of qfSlots) {
        const pickedTeam = bracketPicksData[slot]
        if (pickedTeam && advancedToRound['QF'].has(pickedTeam)) {
          totalPts += rules.qfPts
          breakdown[slot] = rules.qfPts
        }
      }

      // SF slots
      const sfSlots = Object.keys(bracketPicksData).filter(k => k.startsWith('SF_'))
      for (const slot of sfSlots) {
        const pickedTeam = bracketPicksData[slot]
        if (pickedTeam && advancedToRound['SF'].has(pickedTeam)) {
          totalPts += rules.sfPts
          breakdown[slot] = rules.sfPts
        }
      }

      // Final — both finalists get finalPts
      const finalPick = bracketPicksData['FINAL']
      if (finalPick && advancedToRound['FINAL'].has(finalPick)) {
        totalPts += rules.finalPts
        breakdown['FINAL'] = rules.finalPts
      }

      // Champion
      const championPick = bracketPicksData['FINAL'] // champion = picked winner
      if (championPick && advancedToRound['CHAMPION'].has(championPick)) {
        totalPts += rules.finalPts // extra finalPts for correct champion
        breakdown['CHAMPION'] = rules.finalPts
      }

      // Save scores — merge with existing bracket_scores to avoid overwriting
      // group-stage points that were calculated from actual_standings by /api/score-bracket
      const existingScores = pick.bracket_scores || {}
      const existingBreakdown: Record<string, number> = existingScores.breakdown || {}
      const mergedBreakdown = { ...existingBreakdown, ...breakdown }
      const mergedTotal = Object.values(mergedBreakdown).reduce((a, b) => a + b, 0)

      await supabase
        .from('bracket_picks')
        .update({
          bracket_scores: { total: mergedTotal, breakdown: mergedBreakdown },
        })
        .eq('id', pick.id)
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
        .select('id, scored, round, line_total_goals, line_total_corners, line_card_points, line_asian_handicap_home, line_asian_handicap_away, penalty_winner')
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
        fetchFixtureEvents(apiFixtureId, homeTeamId),
        fetchFixtureStats(apiFixtureId),
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

    // Bracket scoring is handled by /api/score-bracket which reads actual_standings
    // Do not call scoreBracketPools here as it would overwrite those scores

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
