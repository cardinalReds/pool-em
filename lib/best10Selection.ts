// Pure selection logic for NCAAF "best 10 games" pools (pool.cfb_game_mode === 'best10').
// Storage-agnostic on purpose — app/api/ncaaf/best10-select/route.ts owns persistence.
//
// Ranked (AP Top 25) games take priority and are allowed to overlap each other — a real
// marquee matchup matters more than avoiding a kickoff-time collision. Only once ranked
// games are exhausted (or there are more than 10 of them) does the original no-overlap,
// spread-across-timeslots logic apply — either to fill remaining slots with unranked games,
// or, if rankings aren't available at all, as the sole selection method exactly as before.

import { rankOf, type RankedTeams } from './cfbRankings'

export interface Best10Fixture {
  id: number
  home_team: string
  away_team: string
  date: string
}

function compareCandidates(a: Best10Fixture, b: Best10Fixture): number {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
  if (dateDiff !== 0) return dateDiff
  return a.id - b.id
}

// null = neither team is ranked. Otherwise: how many of the two teams are ranked (a
// ranked-vs-ranked game outranks a ranked-vs-unranked one), and the better of their two
// ranks (lower number = better).
function gameRankScore(f: Best10Fixture, rankedTeams: RankedTeams): { rankedCount: number; bestRank: number } | null {
  const ranks = [rankOf(rankedTeams, f.home_team), rankOf(rankedTeams, f.away_team)]
    .filter((r): r is number => r != null)
  if (ranks.length === 0) return null
  return { rankedCount: ranks.length, bestRank: Math.min(...ranks) }
}

function compareRankedGames(a: Best10Fixture, b: Best10Fixture, rankedTeams: RankedTeams): number {
  const sa = gameRankScore(a, rankedTeams)!
  const sb = gameRankScore(b, rankedTeams)!
  if (sa.rankedCount !== sb.rankedCount) return sb.rankedCount - sa.rankedCount
  if (sa.bestRank !== sb.bestRank) return sa.bestRank - sb.bestRank
  return compareCandidates(a, b)
}

// The original spread-only algorithm — one game per distinct kickoff timeslot, evenly
// sampled across the week so picks aren't clustered into one time window. Used as-is when
// no rankings are available, and as the filler for unranked slots once ranked games are set.
function selectSpread(fixtures: Best10Fixture[], n: number): Best10Fixture[] {
  if (fixtures.length === 0 || n <= 0) return []

  const slotMap = new Map<number, Best10Fixture[]>()
  for (const f of fixtures) {
    const t = new Date(f.date).getTime()
    const arr = slotMap.get(t) ?? []
    arr.push(f)
    slotMap.set(t, arr)
  }
  const slots = [...slotMap.values()].map(games => [...games].sort((a, b) => a.id - b.id))

  if (slots.length === n) {
    return slots.map(s => s[0])
  } else if (slots.length > n) {
    const chronological = [...slots].sort((a, b) => compareCandidates(a[0], b[0]))
    const step = chronological.length / n
    const pickedSlotIdx = new Set<number>()
    for (let i = 0; i < n; i++) pickedSlotIdx.add(Math.min(chronological.length - 1, Math.floor(i * step)))
    return [...pickedSlotIdx].sort((a, b) => a - b).map(idx => chronological[idx][0])
  } else {
    const base = slots.map(s => s[0])
    const leftovers = slots.flatMap(s => s.slice(1))
    leftovers.sort(compareCandidates)
    const need = Math.max(0, n - base.length)
    return [...base, ...leftovers.slice(0, need)]
  }
}

export function selectBest10(fixtures: Best10Fixture[], rankedTeams?: RankedTeams): number[] {
  const N = 10
  if (fixtures.length === 0) return []

  if (rankedTeams && rankedTeams.size > 0) {
    // Limited to ranked-team games by default — a week with only 6 games involving a
    // ranked team just has 6 predictable games, not padded out to 10 with unranked filler.
    // (No-overlap time spreading still applies among the ranked games themselves when
    // there are more than 10 of them — see compareRankedGames.)
    const ranked = fixtures.filter(f => gameRankScore(f, rankedTeams) !== null)
    const selected = [...ranked].sort((a, b) => compareRankedGames(a, b, rankedTeams)).slice(0, N)

    return selected
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
      .map(f => f.id)
  }

  return selectSpread(fixtures, N)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
    .map(f => f.id)
}

// "Democratize" mode (pool.cfb_game_mode === 'vote') — members vote for up to 10 games each;
// this tallies raw vote counts once voting has closed. A tie right at the 10th spot is
// broken by AP ranking (a tied game with a higher-ranked team wins), then by
// compareCandidates for full determinism. A low-turnout week — fewer than 10 games got any
// votes at all — pads the remaining slots using the same ranked-priority selection as
// best10 mode, over whatever games weren't already picked by vote.
export function selectByVotes(
  fixtures: Best10Fixture[],
  voteCounts: Map<number, number>,
  rankedTeams?: RankedTeams,
): number[] {
  const N = 10
  if (fixtures.length === 0) return []

  const voted = fixtures.filter(f => (voteCounts.get(f.id) ?? 0) > 0)
  const unvoted = fixtures.filter(f => (voteCounts.get(f.id) ?? 0) === 0)

  const byVotes = [...voted].sort((a, b) => {
    const voteDiff = (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0)
    if (voteDiff !== 0) return voteDiff
    if (rankedTeams && rankedTeams.size > 0) {
      const sa = gameRankScore(a, rankedTeams)
      const sb = gameRankScore(b, rankedTeams)
      if (sa && !sb) return -1
      if (!sa && sb) return 1
      if (sa && sb) {
        if (sa.rankedCount !== sb.rankedCount) return sb.rankedCount - sa.rankedCount
        if (sa.bestRank !== sb.bestRank) return sa.bestRank - sb.bestRank
      }
    }
    return compareCandidates(a, b)
  })

  const selected = byVotes.length >= N
    ? byVotes.slice(0, N)
    : [...byVotes, ...selectBest10(unvoted, rankedTeams).map(id => unvoted.find(f => f.id === id)!).slice(0, N - byVotes.length)]

  return selected
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
    .map(f => f.id)
}
