// ── WC 2026 Bracket Engine ────────────────────────────────────────────────
// All 12 groups: A-L
// Each group has 4 teams

import { ANNEX_C } from './annex_c'

export const WC_2026_GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'Congo DR', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
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
// ── Official FIFA WC 2026 Bracket ─────────────────────────────────────────
// Source: fotmob official fixture schedule
// R32 ordered top→bottom per half, each adjacent pair feeds one R16

export const R32_MATCHUPS = [
  // ── LEFT HALF — top to bottom ─────────────────────────────────────────
  { slot: 'R32_M74', home: { type: 'winner', group: 'E' }, away: { type: 'third', groups: ['A','B','C','D','F'] } },   // 1E vs 3AB
  { slot: 'R32_M77', home: { type: 'winner', group: 'I' }, away: { type: 'third', groups: ['C','D','F','G','H'] } },   // 1I vs 3CD
  { slot: 'R32_M73', home: { type: 'runner_up', group: 'A' }, away: { type: 'runner_up', group: 'B' } },               // 2A vs 2B
  { slot: 'R32_M75', home: { type: 'winner', group: 'F' }, away: { type: 'runner_up', group: 'C' } },                  // 1F vs 2C
  { slot: 'R32_M84', home: { type: 'runner_up', group: 'K' }, away: { type: 'runner_up', group: 'L' } },               // 2K vs 2L
  { slot: 'R32_M88', home: { type: 'winner', group: 'H' }, away: { type: 'runner_up', group: 'J' } },                  // 1H vs 2J
  { slot: 'R32_M83', home: { type: 'winner', group: 'D' }, away: { type: 'third', groups: ['B','E','F','I','J'] } },   // 1D vs 3BE
  { slot: 'R32_M81', home: { type: 'winner', group: 'G' }, away: { type: 'third', groups: ['A','E','H','I','J'] } },   // 1G vs 3AE
  // ── RIGHT HALF — top to bottom ────────────────────────────────────────
  { slot: 'R32_M76', home: { type: 'winner', group: 'C' }, away: { type: 'runner_up', group: 'F' } },                  // 1C vs 2F
  { slot: 'R32_M78', home: { type: 'runner_up', group: 'E' }, away: { type: 'runner_up', group: 'I' } },               // 2E vs 2I
  { slot: 'R32_M79', home: { type: 'winner', group: 'A' }, away: { type: 'third', groups: ['C','E','F','H','I'] } },   // 1A vs 3CE
  { slot: 'R32_M80', home: { type: 'winner', group: 'L' }, away: { type: 'third', groups: ['E','H','I','J','K'] } },   // 1L vs 3EH
  { slot: 'R32_M86', home: { type: 'winner', group: 'J' }, away: { type: 'runner_up', group: 'H' } },                  // 1J vs 2H
  { slot: 'R32_M82', home: { type: 'runner_up', group: 'D' }, away: { type: 'runner_up', group: 'G' } },               // 2D vs 2G
  { slot: 'R32_M85', home: { type: 'winner', group: 'B' }, away: { type: 'third', groups: ['E','F','G','I','J'] } },   // 1B vs 3EF
  { slot: 'R32_M87', home: { type: 'winner', group: 'K' }, away: { type: 'third', groups: ['D','E','I','J','L'] } },   // 1K vs 3DE
]

// R16 — each pair of adjacent R32 slots feeds one R16 match
export const R16_MATCHUPS = [
  // Left half
  { slot: 'R16_1', home: 'R32_M74', away: 'R32_M77' }, // 1E/3AB vs 1I/3CD → Jul 4
  { slot: 'R16_2', home: 'R32_M73', away: 'R32_M75' }, // 2A/2B vs 1F/2C  → Jul 4
  { slot: 'R16_3', home: 'R32_M84', away: 'R32_M88' }, // 2K/2L vs 1H/2J  → Jul 6
  { slot: 'R16_4', home: 'R32_M83', away: 'R32_M81' }, // 1D/3BE vs 1G/3AE → Jul 6
  // Right half
  { slot: 'R16_5', home: 'R32_M76', away: 'R32_M78' }, // 1C/2F vs 2E/2I  → Jul 5
  { slot: 'R16_6', home: 'R32_M79', away: 'R32_M80' }, // 1A/3CE vs 1L/3EH → Jul 5
  { slot: 'R16_7', home: 'R32_M86', away: 'R32_M82' }, // 1J/2H vs 2D/2G  → Jul 7
  { slot: 'R16_8', home: 'R32_M85', away: 'R32_M87' }, // 1B/3EF vs 1K/3DE → Jul 7
]

// QF: R16_1+R16_2 → QF_1, R16_3+R16_4 → QF_2 (left SF)
//     R16_5+R16_6 → QF_3, R16_7+R16_8 → QF_4 (right SF)
export const QF_MATCHUPS = [
  { slot: 'QF_1', home: 'R16_1', away: 'R16_2' },
  { slot: 'QF_2', home: 'R16_3', away: 'R16_4' },
  { slot: 'QF_3', home: 'R16_5', away: 'R16_6' },
  { slot: 'QF_4', home: 'R16_7', away: 'R16_8' },
]

export const SF_MATCHUPS = [
  { slot: 'SF_1', home: 'QF_1', away: 'QF_2' },
  { slot: 'SF_2', home: 'QF_3', away: 'QF_4' },
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
  bestThirdGroups: string[] // which 8 groups produced 3rd place qualifiers
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

  // ── Assign third-place teams to R32 slots ─────────────────────────────
  const thirdAssignments: Record<string, string> = {}
  const qualified = bestThirdGroups.slice(0, 8)

  // 1) Try official FIFA Annex C lookup table
  const annexKey = [...qualified].sort().join('')
  const annexEntry = ANNEX_C[annexKey]

  if (annexEntry) {
    // Exact match in the official table — use FIFA's assignment
    Object.entries(annexEntry).forEach(([slot, group]) => {
      thirdAssignments[slot] = thirds[group] || ''
    })
  } else {
    // 2) Combination not in table (221 of 495) — use backtracking
    const thirdSlots = R32_MATCHUPS.filter(m => m.away.type === 'third')
    const pool = [...qualified]
    // Shuffle for randomness
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]]
    }

    function assign(slotIdx: number, remaining: string[]): boolean {
      if (slotIdx === thirdSlots.length) return true
      const slot = thirdSlots[slotIdx]
      const eligible = slot.away.groups || []
      for (let i = 0; i < remaining.length; i++) {
        if (eligible.includes(remaining[i])) {
          const group = remaining[i]
          const next = [...remaining.slice(0, i), ...remaining.slice(i + 1)]
          thirdAssignments[slot.slot] = thirds[group] || ''
          if (assign(slotIdx + 1, next)) return true
        }
      }
      // Fallback: any remaining team
      if (remaining.length > 0) {
        thirdAssignments[slot.slot] = thirds[remaining[0]] || ''
        if (assign(slotIdx + 1, remaining.slice(1))) return true
      }
      return false
    }
    assign(0, pool)
  }

  // ── Resolve all R32 matchups ─────────────────────────────────────────
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

// Group stage format — admin picks one of three
export type GroupStageFormat = 'standings' | 'wld' | 'exact'

export interface BracketScoringRules {
  group_format: GroupStageFormat
  // standings format
  standings_first: number
  standings_second: number
  standings_third: number
  // wld format
  wld_pts: number
  // knockout (all formats)
  r32_pts: number
  r16_pts: number
  qf_pts: number
  sf_pts: number
  final_pts: number
}

export const DEFAULT_BRACKET_SCORING: BracketScoringRules = {
  group_format: 'standings',
  standings_first: 3, standings_second: 2, standings_third: 1,
  wld_pts: 1,
  r32_pts: 1, r16_pts: 2, qf_pts: 4, sf_pts: 6, final_pts: 12,
}

// Score a group stage game (wld or exact formats)
export function scoreGroupGame(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  format: GroupStageFormat,
  rules: BracketScoringRules
): number {
  if (format === 'wld') {
    return getResult(predictedHome, predictedAway) === getResult(actualHome, actualAway) ? rules.wld_pts : 0
  }
  if (format === 'exact') {
    const correctResult = getResult(predictedHome, predictedAway) === getResult(actualHome, actualAway)
    const homeCorrect = predictedHome === actualHome
    const awayCorrect = predictedAway === actualAway
    let pts = 0
    if (correctResult) pts += 3
    if (homeCorrect) pts += 2
    if (awayCorrect) pts += 2
    if (homeCorrect && awayCorrect) pts += 3
    return pts // max 10
  }
  return 0
}

// Score group standings prediction
export function scoreGroupStandings(
  predictedFirst: string, predictedSecond: string,
  actualFirst: string, actualSecond: string,
  predictedThird: string | null, qualifiedThirds: string[],
  rules: BracketScoringRules
): number {
  let pts = 0
  if (predictedFirst === actualFirst) pts += rules.standings_first
  if (predictedSecond === actualSecond) pts += rules.standings_second
  if (predictedThird && qualifiedThirds.includes(predictedThird)) pts += rules.standings_third
  return pts
}

// Score a knockout round pick (team appearing in that round)
export function scoreKnockoutPick(
  slot: string,
  predictedTeam: string,
  actualTeam: string,
  rules: BracketScoringRules
): number {
  if (predictedTeam !== actualTeam) return 0
  if (slot.startsWith('R32')) return rules.r32_pts
  if (slot.startsWith('R16')) return rules.r16_pts
  if (slot.startsWith('QF')) return rules.qf_pts
  if (slot.startsWith('SF')) return rules.sf_pts
  return 0
}

// Score the final (always exact score)
// predictedHome/Away are team names, scores are goals (90 min)
export function scoreFinal(
  predictedHome: string, predictedAway: string,
  predictedHomeGoals: number, predictedAwayGoals: number,
  actualHome: string, actualAway: string,
  actualHomeGoals: number, actualAwayGoals: number,
  rules: BracketScoringRules
): number {
  let pts = 0
  const finalists = [actualHome, actualAway]
  // Correct finalist being in the final
  if (finalists.includes(predictedHome)) pts += rules.final_pts
  if (finalists.includes(predictedAway)) pts += rules.final_pts
  // Correct goals per team (must have correct team too)
  if (predictedHome === actualHome && predictedHomeGoals === actualHomeGoals) pts += 2
  if (predictedAway === actualAway && predictedAwayGoals === actualAwayGoals) pts += 2
  // Exact score bonus (correct teams AND correct scores)
  if (predictedHome === actualHome && predictedAway === actualAway &&
      predictedHomeGoals === actualHomeGoals && predictedAwayGoals === actualAwayGoals) {
    pts += 3
  }
  // Correct winner bonus
  const actualWinner = actualHomeGoals > actualAwayGoals ? actualHome : actualAway
  const predictedWinner = predictedHomeGoals > predictedAwayGoals ? predictedHome : predictedAway
  if (predictedWinner === actualWinner) pts += 10
  return pts
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
