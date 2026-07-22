// Pure selection logic for PL "best 5 games" pools (pool.pl_game_mode === 'best5').
// Storage-agnostic on purpose — app/api/pl/best5-select/route.ts owns persistence.

export const MARQUEE_CLUBS = new Set([
  'Manchester United', 'Manchester City', 'Chelsea', 'Liverpool', 'Arsenal', 'Tottenham', 'Newcastle',
])

// Order-insensitive pairs — checked both ways in isMustWatch.
export const DERBY_PAIRS: [string, string][] = [
  ['Arsenal', 'Tottenham'],                  // North London
  ['Manchester United', 'Manchester City'],  // Manchester
  ['Liverpool', 'Everton'],                  // Merseyside
  ['Liverpool', 'Manchester United'],        // North West
  ['Chelsea', 'Fulham'],                     // West London
  ['Brighton', 'Crystal Palace'],            // M23 / South Coast
  ['Newcastle', 'Sunderland'],               // Tyne-Wear
  ['Leeds', 'Manchester United'],
  ['Leeds', 'Chelsea'],
]

export function isMustWatch(homeTeam: string, awayTeam: string): boolean {
  if (MARQUEE_CLUBS.has(homeTeam) && MARQUEE_CLUBS.has(awayTeam)) return true
  return DERBY_PAIRS.some(([a, b]) =>
    (a === homeTeam && b === awayTeam) || (a === awayTeam && b === homeTeam)
  )
}

export interface Best5Fixture {
  id: number
  home_team: string
  away_team: string
  date: string
}

// Tiebreak priority, highest wins: must-watch (2) + standings-extreme (1) = 0..3.
// Standings-extreme = combined table position sums to a top-of-table (<12) or deep
// relegation-zone (>34) clash — thresholds assume a 20-team league. Missing standings
// (e.g. pre-season, or an unrecognized team name) just means no bonus, not an error.
function priority(f: Best5Fixture, standingsByTeam: Map<string, number>): number {
  let score = isMustWatch(f.home_team, f.away_team) ? 2 : 0
  const homePos = standingsByTeam.get(f.home_team)
  const awayPos = standingsByTeam.get(f.away_team)
  if (homePos != null && awayPos != null) {
    const sum = homePos + awayPos
    if (sum > 34 || sum < 12) score += 1
  }
  return score
}

function compareCandidates(a: Best5Fixture, b: Best5Fixture, standingsByTeam: Map<string, number>): number {
  const pDiff = priority(b, standingsByTeam) - priority(a, standingsByTeam)
  if (pDiff !== 0) return pDiff
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
  if (dateDiff !== 0) return dateDiff
  return a.id - b.id
}

export function selectBest5(fixtures: Best5Fixture[], standingsByTeam: Map<string, number>): number[] {
  if (fixtures.length === 0) return []

  // Group into distinct kickoff timeslots.
  const slotMap = new Map<number, Best5Fixture[]>()
  for (const f of fixtures) {
    const t = new Date(f.date).getTime()
    const arr = slotMap.get(t) ?? []
    arr.push(f)
    slotMap.set(t, arr)
  }

  // Within each slot, best-first (representative = slots[i][0]).
  const slots = [...slotMap.values()].map(games =>
    [...games].sort((a, b) => compareCandidates(a, b, standingsByTeam))
  )

  let selected: Best5Fixture[]

  if (slots.length === 5) {
    selected = slots.map(s => s[0])
  } else if (slots.length > 5) {
    // Rank slots by their representative's priority, keep the top 5.
    const ranked = [...slots].sort((a, b) => compareCandidates(a[0], b[0], standingsByTeam))
    selected = ranked.slice(0, 5).map(s => s[0])
  } else {
    // Fewer than 5 slots — take every slot's representative, then pad with the
    // best remaining (non-representative) games across all slots.
    const base = slots.map(s => s[0])
    const leftovers = slots.flatMap(s => s.slice(1))
    leftovers.sort((a, b) => compareCandidates(a, b, standingsByTeam))
    const need = Math.max(0, 5 - base.length)
    selected = [...base, ...leftovers.slice(0, need)]
  }

  return selected
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
    .map(f => f.id)
}
