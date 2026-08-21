// Pure selection logic for NCAAF "best 10 games" pools (pool.cfb_game_mode === 'best10').
// Storage-agnostic on purpose — app/api/ncaaf/best10-select/route.ts owns persistence.
//
// Unlike PL's best5 (lib/best5Selection.ts), there's no standings/rankings data available
// for college football from the API (coverage.standings === false), so this is spread-only:
// one game per distinct kickoff slot, so the 10 picked games don't all overlap at the same
// time — no marquee/rivalry weighting. Self-contained rather than sharing code with
// best5Selection.ts so PL's already-shipped behavior can't regress from a shared-code change.

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

export function selectBest10(fixtures: Best10Fixture[]): number[] {
  const N = 10
  if (fixtures.length === 0) return []

  // Group into distinct kickoff timeslots.
  const slotMap = new Map<number, Best10Fixture[]>()
  for (const f of fixtures) {
    const t = new Date(f.date).getTime()
    const arr = slotMap.get(t) ?? []
    arr.push(f)
    slotMap.set(t, arr)
  }

  // Within each slot, earliest-id-first (arbitrary but stable — no priority signal to sort by).
  const slots = [...slotMap.values()].map(games => [...games].sort((a, b) => a.id - b.id))

  let selected: Best10Fixture[]

  if (slots.length === N) {
    selected = slots.map(s => s[0])
  } else if (slots.length > N) {
    // More timeslots than we need — spread picks evenly across the full slate of slots
    // (sorted chronologically) rather than just taking the first N, so a 99-game week 1
    // doesn't end up all early-afternoon games.
    const chronological = [...slots].sort((a, b) => compareCandidates(a[0], b[0]))
    const step = chronological.length / N
    const pickedSlotIdx = new Set<number>()
    for (let i = 0; i < N; i++) pickedSlotIdx.add(Math.min(chronological.length - 1, Math.floor(i * step)))
    selected = [...pickedSlotIdx].sort((a, b) => a - b).map(idx => chronological[idx][0])
  } else {
    // Fewer than N slots — take every slot's representative, then pad with the best
    // remaining (non-representative) games across all slots.
    const base = slots.map(s => s[0])
    const leftovers = slots.flatMap(s => s.slice(1))
    leftovers.sort(compareCandidates)
    const need = Math.max(0, N - base.length)
    selected = [...base, ...leftovers.slice(0, need)]
  }

  return selected
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
    .map(f => f.id)
}
