// ── WC 2026 Bracket Engine ────────────────────────────────────────────────
// All 12 groups: A-L
// Each group has 4 teams

export const WC_2026_GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'South Africa', 'Poland', 'Saudi Arabia'],
  B: ['Argentina', 'Chile', 'Peru', 'Canada'],
  C: ['USA', 'Panama', 'Haiti', 'Bosnia and Herzegovina'],
  D: ['Brazil', 'Norway', 'Morocco', 'Uruguay'],
  E: ['France', 'Algeria', 'Egypt', 'England'],
  F: ['Spain', 'Senegal', 'Japan', 'Netherlands'],
  G: ['Germany', 'Serbia', 'Colombia', 'Belgium'],
  H: ['Portugal', 'Croatia', 'Ivory Coast', 'Ecuador'],
  I: ['Sweden', 'South Korea', 'Iran', 'Iraq'],
  J: ['Australia', 'Jordan', 'New Zealand', 'Uzbekistan'],
  K: ['Türkiye', 'Denmark', 'Austria', 'Ghana'],
  L: ['Congo DR', 'Cabo Verde', 'Tunisia', 'Qatar'],
}

// Group picks: top 2 finishers + 3rd place ranking
export interface GroupPicks {
  [group: string]: [string, string, string, string] // 1st, 2nd, 3rd, 4th
}

// Full bracket picks keyed by slot
export interface BracketPicks {
  [slot: string]: string // e.g. "R32_M73" → "Mexico"
}

// ── R32 Fixed matchups (from FIFA official schedule) ──────────────────────
// Third-place slots are conditional on which groups produce the best 3rd place teams
// We store the pool of eligible groups for each 3rd place slot
export const R32_MATCHUPS = [
  // ── LEFT HALF (slots 0-7) ─────────────────────────────────────────────
  { slot: 'R32_M73', home: { type: 'runner_up', group: 'A' }, away: { type: 'runner_up', group: 'B' } },
  { slot: 'R32_M74', home: { type: 'winner', group: 'E' }, away: { type: 'third', groups: ['A','B','C','D','F'] } },
  { slot: 'R32_M75', home: { type: 'winner', group: 'F' }, away: { type: 'runner_up', group: 'C' } },
  { slot: 'R32_M76', home: { type: 'winner', group: 'C' }, away: { type: 'runner_up', group: 'F' } },
  { slot: 'R32_M77', home: { type: 'winner', group: 'I' }, away: { type: 'third', groups: ['C','D','F','G','H'] } },
  { slot: 'R32_M78', home: { type: 'runner_up', group: 'E' }, away: { type: 'runner_up', group: 'I' } },
  { slot: 'R32_M79', home: { type: 'winner', group: 'A' }, away: { type: 'third', groups: ['C','E','F','H','I'] } },
  { slot: 'R32_M80', home: { type: 'winner', group: 'L' }, away: { type: 'third', groups: ['E','H','I','J','K'] } },
  // ── RIGHT HALF (slots 8-15) ───────────────────────────────────────────
  { slot: 'R32_M81', home: { type: 'winner', group: 'D' }, away: { type: 'third', groups: ['B','E','F','I','J'] } },
  { slot: 'R32_M82', home: { type: 'winner', group: 'G' }, away: { type: 'third', groups: ['A','E','H','I','J'] } },
  { slot: 'R32_M83', home: { type: 'runner_up', group: 'K' }, away: { type: 'runner_up', group: 'L' } },
  { slot: 'R32_M84', home: { type: 'winner', group: 'H' }, away: { type: 'runner_up', group: 'J' } },
  { slot: 'R32_M85', home: { type: 'winner', group: 'B' }, away: { type: 'third', groups: ['E','F','G','I','J'] } },
  { slot: 'R32_M86', home: { type: 'winner', group: 'J' }, away: { type: 'runner_up', group: 'H' } },
  { slot: 'R32_M87', home: { type: 'winner', group: 'K' }, away: { type: 'third', groups: ['A','B','D','E','F'] } },
  { slot: 'R32_M88', home: { type: 'runner_up', group: 'D' }, away: { type: 'runner_up', group: 'G' } },
]

// R16 pairings (winner of R32 slot X plays winner of R32 slot Y)
// Based on FIFA's bracket tree
export const R16_MATCHUPS = [
  // Left half
  { slot: 'R16_1', home: 'R32_M73', away: 'R32_M74' },
  { slot: 'R16_2', home: 'R32_M75', away: 'R32_M76' },
  { slot: 'R16_3', home: 'R32_M77', away: 'R32_M78' },
  { slot: 'R16_4', home: 'R32_M79', away: 'R32_M80' },
  // Right half
  { slot: 'R16_5', home: 'R32_M81', away: 'R32_M82' },
  { slot: 'R16_6', home: 'R32_M83', away: 'R32_M84' },
  { slot: 'R16_7', home: 'R32_M85', away: 'R32_M86' },
  { slot: 'R16_8', home: 'R32_M87', away: 'R32_M88' },
]

export const QF_MATCHUPS = [
  // Left half
  { slot: 'QF_1', home: 'R16_1', away: 'R16_2' },
  { slot: 'QF_2', home: 'R16_3', away: 'R16_4' },
  // Right half
  { slot: 'QF_3', home: 'R16_5', away: 'R16_6' },
  { slot: 'QF_4', home: 'R16_7', away: 'R16_8' },
]

export const SF_MATCHUPS = [
  { slot: 'SF_1', home: 'QF_1', away: 'QF_2' }, // left
  { slot: 'SF_2', home: 'QF_3', away: 'QF_4' }, // right
]

export const FINAL_MATCHUP = { slot: 'FINAL', home: 'SF_1', away: 'SF_2' }
export const THIRD_PLACE = { slot: 'THIRD', home: 'SF_1_loser', away: 'SF_2_loser' }

// ── Tiebreaker: rank 3rd place teams ─────────────────────────────────────
// In simple mode user just picks which 8 groups produce 3rd place qualifiers
// In full mode we calculate from predicted results

export interface TeamStanding {
  team: string
  group: string
  points: number
  gd: number
  gf: number
}

export function rankThirdPlaceTeams(standings: TeamStanding[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    return b.gf - a.gf
  }).slice(0, 8)
}

// ── Generate R32 bracket from group picks ─────────────────────────────────
// groupPicks: { A: ["Mexico", "Poland", "Saudi Arabia", "South Africa"], ... }
// Returns a map of slot → team for all R32 matches

export function generateR32FromGroupPicks(
  groupPicks: GroupPicks,
  bestThirdGroups: string[] // which 8 groups produced 3rd place qualifiers, ranked
): Record<string, { home: string; away: string }> {
  const bracket: Record<string, { home: string; away: string }> = {}

  // Build lookup maps
  const winners: Record<string, string> = {}
  const runnersUp: Record<string, string> = {}
  const thirds: Record<string, string> = {}

  Object.entries(groupPicks).forEach(([group, teams]) => {
    winners[group] = teams[0]
    runnersUp[group] = teams[1]
    thirds[group] = teams[2]
  })

  // Build list of third-place slots and their eligible groups
  const thirdSlots = R32_MATCHUPS.filter(m => m.away.type === 'third')

  // Make a mutable copy of qualified thirds, shuffle it for random assignment
  const pool = [...bestThirdGroups.slice(0, 8)]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }

  // Assign each third-place slot a valid team from the pool
  // Valid = group must be in the slot's eligible groups list
  // Use backtracking to find a valid assignment
  const thirdAssignments: Record<string, string> = {}

  function assign(slotIdx: number, remaining: string[]): boolean {
    if (slotIdx === thirdSlots.length) return true
    const slot = thirdSlots[slotIdx]
    const eligible = slot.away.groups || []
    // Try eligible groups first
    for (let i = 0; i < remaining.length; i++) {
      if (eligible.includes(remaining[i])) {
        const group = remaining[i]
        const next = [...remaining.slice(0, i), ...remaining.slice(i + 1)]
        thirdAssignments[slot.slot] = thirds[group] || ''
        if (assign(slotIdx + 1, next)) return true
      }
    }
    // Fallback: assign any remaining team (violates eligibility but avoids blank)
    if (remaining.length > 0) {
      thirdAssignments[slot.slot] = thirds[remaining[0]] || ''
      const next = remaining.slice(1)
      if (assign(slotIdx + 1, next)) return true
    }
    return false
  }

  // Try random assignment, fall back to backtracking if it fails
  assign(0, pool)

  // For each R32 matchup, resolve the teams
  for (const matchup of R32_MATCHUPS) {
    let homeTeam = ''
    let awayTeam = ''

    if (matchup.home.type === 'winner') {
      homeTeam = winners[matchup.home.group!] || ''
    } else if (matchup.home.type === 'runner_up') {
      homeTeam = runnersUp[matchup.home.group!] || ''
    }

    if (matchup.away.type === 'runner_up') {
      awayTeam = runnersUp[matchup.away.group!] || ''
    } else if (matchup.away.type === 'winner') {
      awayTeam = winners[matchup.away.group!] || ''
    } else if (matchup.away.type === 'third') {
      awayTeam = thirdAssignments[matchup.slot] || ''
    }

    bracket[matchup.slot] = { home: homeTeam, away: awayTeam }
  }

  return bracket
}

// ── Calculate group standings from predicted game results ─────────────────
export interface PredictedResult {
  home_team: string
  away_team: string
  home_score: number
  away_score: number
}

export function calculateGroupStandings(
  group: string,
  teams: string[],
  results: PredictedResult[]
): TeamStanding[] {
  const standings: Record<string, TeamStanding> = {}
  teams.forEach(t => { standings[t] = { team: t, group, points: 0, gd: 0, gf: 0 } })

  for (const result of results) {
    const home = standings[result.home_team]
    const away = standings[result.away_team]
    if (!home || !away) continue

    home.gf += result.home_score
    home.gd += result.home_score - result.away_score
    away.gf += result.away_score
    away.gd += result.away_score - result.home_score

    if (result.home_score > result.away_score) {
      home.points += 3
    } else if (result.home_score < result.away_score) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }
  }

  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    return b.gf - a.gf
  })
}

// ── Scoring rules ─────────────────────────────────────────────────────────
export interface BracketScoringRules {
  // Group stage
  group_pred_style: 'wld' | 'exact'
  group_wld: number
  group_exact_per_team: number
  group_exact_bonus: number
  group_standing_winner: number
  group_standing_runner_up: number
  group_standing_third: number
  // Knockout
  knockout_pred_style: 'advances' | 'exact'
  r32_advances: number
  r32_exact_bonus: number
  r16_advances: number
  r16_exact_bonus: number
  qf_advances: number
  qf_exact_bonus: number
  sf_advances: number
  sf_exact_bonus: number
  // Final (always exact)
  final_exact_per_team: number
  final_exact_bonus: number
  champion_bonus: number
}

export const DEFAULT_BRACKET_SCORING: BracketScoringRules = {
  group_pred_style: 'wld',
  group_wld: 2,
  group_exact_per_team: 2,
  group_exact_bonus: 3,
  group_standing_winner: 3,
  group_standing_runner_up: 3,
  group_standing_third: 2,
  knockout_pred_style: 'advances',
  r32_advances: 2, r32_exact_bonus: 3,
  r16_advances: 3, r16_exact_bonus: 4,
  qf_advances: 5, qf_exact_bonus: 6,
  sf_advances: 8, sf_exact_bonus: 10,
  final_exact_per_team: 5, final_exact_bonus: 15,
  champion_bonus: 20,
}

// Score a bracket pick for a knockout slot
export function scoreKnockoutPick(
  slot: string,
  predictedWinner: string,
  actualWinner: string,
  predictedScore: string | null, // "2-1" format, 90 min only
  actualScore: string | null,
  rules: BracketScoringRules
): number {
  let pts = 0
  const correctAdvance = predictedWinner === actualWinner

  // Determine round
  const isFinal = slot === 'FINAL'
  const roundKey = slot.startsWith('R32') ? 'r32'
    : slot.startsWith('R16') ? 'r16'
    : slot.startsWith('QF') ? 'qf'
    : slot.startsWith('SF') ? 'sf'
    : null

  if (isFinal) {
    // Final is always exact score
    if (predictedScore && actualScore) {
      const [ph, pa] = predictedScore.split('-').map(Number)
      const [ah, aa] = actualScore.split('-').map(Number)
      if (!isNaN(ph) && !isNaN(pa)) {
        if (ph === ah) pts += rules.final_exact_per_team
        if (pa === aa) pts += rules.final_exact_per_team
        if (ph === ah && pa === aa) pts += rules.final_exact_bonus
      }
    }
    if (correctAdvance) pts += rules.champion_bonus
    return pts
  }

  if (!roundKey || !correctAdvance) return pts

  // Advances points
  pts += rules[`${roundKey}_advances` as keyof BracketScoringRules] as number

  // Exact score bonus if applicable
  if (rules.knockout_pred_style === 'exact' && predictedScore && actualScore) {
    const [ph, pa] = predictedScore.split('-').map(Number)
    const [ah, aa] = actualScore.split('-').map(Number)
    if (!isNaN(ph) && !isNaN(pa) && ph === ah && pa === aa) {
      pts += rules[`${roundKey}_exact_bonus` as keyof BracketScoringRules] as number
    }
  }

  return pts
}

// Score a group stage game pick
export function scoreGroupGamePick(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  rules: BracketScoringRules
): number {
  if (rules.group_pred_style === 'wld') {
    const predicted = getResult(predictedHome, predictedAway)
    const actual = getResult(actualHome, actualAway)
    return predicted === actual ? rules.group_wld : 0
  } else {
    let pts = 0
    if (predictedHome === actualHome) pts += rules.group_exact_per_team
    if (predictedAway === actualAway) pts += rules.group_exact_per_team
    if (predictedHome === actualHome && predictedAway === actualAway) pts += rules.group_exact_bonus
    return pts
  }
}

// ── Get opponents for a bracket slot given current bracket state ──────────
export function getSlotOpponents(
  slot: string,
  r32Bracket: Record<string, { home: string; away: string }>,
  userPicks: BracketPicks
): { home: string; away: string } {
  // R32 slots come from group stage
  if (slot.startsWith('R32')) {
    return r32Bracket[slot] || { home: '', away: '' }
  }

  // R16: winners of two R32 slots
  const r16 = R16_MATCHUPS.find(m => m.slot === slot)
  if (r16) {
    return {
      home: userPicks[r16.home] || `winner of ${r16.home}`,
      away: userPicks[r16.away] || `winner of ${r16.away}`,
    }
  }

  // QF: winners of two R16 slots
  const qf = QF_MATCHUPS.find(m => m.slot === slot)
  if (qf) {
    return {
      home: userPicks[qf.home] || `winner of ${qf.home}`,
      away: userPicks[qf.away] || `winner of ${qf.away}`,
    }
  }

  // SF: winners of two QF slots
  const sf = SF_MATCHUPS.find(m => m.slot === slot)
  if (sf) {
    return {
      home: userPicks[sf.home] || `winner of ${sf.home}`,
      away: userPicks[sf.away] || `winner of ${sf.away}`,
    }
  }

  // Final: winners of two SF slots
  if (slot === 'FINAL') {
    return {
      home: userPicks['SF_1'] || 'winner of SF_1',
      away: userPicks['SF_2'] || 'winner of SF_2',
    }
  }

  return { home: '', away: '' }
}
