// Shared per-fixture scoring logic for CUSTOM soccer pools — tournament-agnostic.
// Used by both /api/score (World Cup) and /api/pl/score (Premier League).

export interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

export interface MatchFacts {
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

export interface EventFacts {
  firstScorerName: string | null
  allScorerNames: string[]
  firstTeamScore: 'home' | 'away' | 'none'
  firstYellow: 'home' | 'away' | 'none'
  homeCardPts: number
  awayCardPts: number
  htHomeCardPts: number
  htAwayCardPts: number
}

export interface CornerFacts {
  homeCorners: number | null
  awayCorners: number | null
  htHomeCorners: number | null
  htAwayCorners: number | null
}

export function getResult(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

export async function fetchFixtureEvents(apiKey: string, fixtureId: number, homeTeamId: number): Promise<EventFacts> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,
    { headers: { 'x-apisports-key': apiKey } }
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

    if (event.type === 'Goal' && event.detail !== 'Missed Penalty' && event.comments !== 'Penalty Shootout') {
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
        if (isHome) { homeCardPts += 25; if (isFirstHalf) htHomeCardPts += 25 }
        else { awayCardPts += 25; if (isFirstHalf) htAwayCardPts += 25 }
      }
      if (event.detail === 'Second Yellow Card') {
        if (isHome) { homeCardPts += 25; if (isFirstHalf) htHomeCardPts += 25 }
        else { awayCardPts += 25; if (isFirstHalf) htAwayCardPts += 25 }
      }
    }
  }

  return { firstScorerName, allScorerNames, firstTeamScore, firstYellow, homeCardPts, awayCardPts, htHomeCardPts, htAwayCardPts }
}

export async function fetchFixtureStats(apiKey: string, fixtureId: number): Promise<CornerFacts> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,
    { headers: { 'x-apisports-key': apiKey } }
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

  let htHomeCorners: number | null = null
  let htAwayCorners: number | null = null
  try {
    const htRes = await fetch(
      `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}&half=true`,
      { headers: { 'x-apisports-key': apiKey } }
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

// Returns points earned for a single predictions_v2 row given match facts.
// knockoutRoundNames lets callers flag which round strings count as "knockout" for
// soccer_result/soccer_team_to_advance — World Cup has them (Round of 32, Final, ...),
// Premier League never does (all rounds are regular "Matchday N" league play).
export function scoreCustomPrediction(
  categoryId: string,
  pred: any,
  facts: MatchFacts,
  rule: PoolRule,
  fixtureRow?: any,
  knockoutRoundNames: string[] = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'],
): number {
  const { homeScore, awayScore, htHome, htAway, firstScorerName } = facts
  const actual = getResult(homeScore, awayScore)
  const htActual = getResult(htHome ?? 0, htAway ?? 0)

  switch (categoryId) {

    case 'soccer_result': {
      const round = fixtureRow?.round || ''
      if (knockoutRoundNames.some(r => round.includes(r))) return 0
      return pred.value_wld === actual ? rule.points : 0
    }

    case 'soccer_team_to_advance': {
      if (!pred.value_wld) return 0
      const round = fixtureRow?.round || ''
      if (!knockoutRoundNames.some(r => round.includes(r))) return 0
      let winner: 'home' | 'away' | null = null
      if (homeScore > awayScore) winner = 'home'
      else if (awayScore > homeScore) winner = 'away'
      else if (fixtureRow?.penalty_winner) {
        winner = fixtureRow.penalty_winner === facts.homeTeam ? 'home' : 'away'
      }
      if (!winner) return 0
      if (pred.value_wld !== winner) return 0
      const roundBonus: Record<string, number> = {
        'Round of 32': 0, 'Round of 16': 2, 'Quarter-finals': 4, 'Semi-finals': 6, 'Final': 8,
      }
      const bonus = Object.entries(roundBonus).find(([r]) => round.includes(r))?.[1] ?? 0
      return rule.points + bonus
    }

    case 'soccer_ht_result':
      return htHome !== null && pred.value_wld === htActual ? rule.points : 0

    case 'soccer_asian_handicap': {
      if (!fixtureRow?.line_asian_handicap_home) return 0
      const handicap = fixtureRow.line_asian_handicap_home
      const adjustedHome = homeScore + handicap
      const ahResult = adjustedHome > awayScore ? 'home' : adjustedHome < awayScore ? 'away' : 'draw'
      return pred.value_wld === ahResult ? rule.points : 0
    }

    case 'soccer_first_team_score':
      if (!pred.value_wld) return 0
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

    case 'soccer_btts':
      return pred.value_yesno === (homeScore > 0 && awayScore > 0) ? rule.points : 0

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

    case 'soccer_first_goalscorer': {
      if (pred.value_wld === 'none') {
        return (!firstScorerName || firstScorerName === 'no goal') ? rule.points : 0
      }
      if (!firstScorerName || !pred.value_text) return 0

      if (firstScorerName.startsWith('Own Goal') && pred.value_text.startsWith('Own Goal')) {
        return firstScorerName === pred.value_text ? rule.points : 0
      }
      if (firstScorerName.startsWith('Own Goal') || pred.value_text.startsWith('Own Goal')) return 0

      const normalizeScorer = (name: string) => {
        name = name.replace(/\s+/g, ' ').trim()
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
