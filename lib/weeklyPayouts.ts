// Computes and persists weekly-pot payouts once a matchday's fixtures are fully finished.
// Shared between the client-side admin trigger (WeeklyPot.tsx) and any future cron route.

function parseMatchday(round: string): number | null {
  const m = (round || '').match(/Matchday (\d+)/)
  return m ? parseInt(m[1]) : null
}

// Parses a payout_structure string (either one of the fixed templates or freeform
// custom text) into { rank, pct } pairs. Falls back to winner-takes-all if nothing
// recognizable is found — custom text without "%" or "evenly" can't be parsed reliably.
export function parsePayoutSplits(structureText: string | null | undefined): { rank: number; pct: number }[] {
  if (!structureText) return [{ rank: 1, pct: 100 }]
  const matches = [...structureText.matchAll(/(\d+)(?:st|nd|rd|th)\s*:?\s*(\d+(?:\.\d+)?)\s*%/gi)]
  if (matches.length > 0) {
    return matches.map(m => ({ rank: parseInt(m[1]), pct: parseFloat(m[2]) }))
  }
  if (/evenly/i.test(structureText)) {
    const ordinalCount = (structureText.match(/\d+(?:st|nd|rd|th)/gi) || []).length || 3
    const pct = 100 / ordinalCount
    return Array.from({ length: ordinalCount }, (_, i) => ({ rank: i + 1, pct }))
  }
  return [{ rank: 1, pct: 100 }]
}

export interface WeeklyPayoutResult {
  matchday: number
  pot: number
  payouts: { user_id: string; rank: number; amount: number }[]
}

// Computes payouts for every matchday that (a) has entrants, (b) has all its fixtures
// finished, and (c) doesn't already have a weekly_payouts row — then inserts the rows.
// Returns what it computed so callers can show immediate feedback.
export async function computeWeeklyPayouts(
  supabase: any,
  poolId: string,
  tournamentId: string,
  weeklyBuyIn: number,
  payoutStructure: string | null | undefined,
  adminFeePercent: number | null | undefined,
): Promise<WeeklyPayoutResult[]> {
  const [entriesRes, fixturesRes, existingRes] = await Promise.all([
    supabase.from('matchday_entries').select('user_id, matchday').eq('pool_id', poolId),
    supabase.from('fixtures').select('id, round, status').eq('tournament_id', tournamentId),
    supabase.from('weekly_payouts').select('matchday').eq('pool_id', poolId),
  ])

  const alreadyComputed = new Set<number>((existingRes.data || []).map((r: any) => r.matchday))

  const entrantsByMatchday: Record<number, string[]> = {}
  ;(entriesRes.data || []).forEach((e: any) => {
    if (!entrantsByMatchday[e.matchday]) entrantsByMatchday[e.matchday] = []
    entrantsByMatchday[e.matchday].push(e.user_id)
  })

  const fixturesByMatchday: Record<number, { id: number; status: string }[]> = {}
  ;(fixturesRes.data || []).forEach((f: any) => {
    const md = parseMatchday(f.round)
    if (md === null) return
    if (!fixturesByMatchday[md]) fixturesByMatchday[md] = []
    fixturesByMatchday[md].push({ id: f.id, status: f.status })
  })

  const splits = parsePayoutSplits(payoutStructure)
  const results: WeeklyPayoutResult[] = []

  for (const [mdStr, entrantIds] of Object.entries(entrantsByMatchday)) {
    const matchday = parseInt(mdStr)
    if (alreadyComputed.has(matchday)) continue
    if (entrantIds.length === 0) continue

    const fixtures = fixturesByMatchday[matchday] || []
    if (fixtures.length === 0) continue
    const allFinished = fixtures.every(f => f.status === 'FT')
    if (!allFinished) continue

    const fixtureIds = fixtures.map(f => f.id)
    const { data: preds } = await supabase.from('predictions_v2').select('user_id, points_earned')
      .eq('pool_id', poolId).in('fixture_id', fixtureIds).in('user_id', entrantIds)

    const pointsByUser: Record<string, number> = {}
    entrantIds.forEach(id => { pointsByUser[id] = 0 })
    ;(preds || []).forEach((p: any) => { pointsByUser[p.user_id] = (pointsByUser[p.user_id] || 0) + (p.points_earned || 0) })

    const ranked = Object.entries(pointsByUser)
      .map(([user_id, points]) => ({ user_id, points }))
      .sort((a, b) => b.points - a.points)

    // Standard competition ranking (1224): tied entrants share a rank, next rank skips ahead.
    const rankByUser: Record<string, number> = {}
    let currentRank = 1
    ranked.forEach((r, i) => {
      if (i > 0 && r.points === ranked[i - 1].points) {
        rankByUser[r.user_id] = rankByUser[ranked[i - 1].user_id]
      } else {
        rankByUser[r.user_id] = currentRank
      }
      currentRank = i + 2
    })

    const feePercent = adminFeePercent || 0
    const pot = entrantIds.length * weeklyBuyIn * (1 - feePercent / 100)

    const payouts: { user_id: string; rank: number; amount: number }[] = []
    for (const split of splits) {
      const usersAtRank = ranked.filter(r => rankByUser[r.user_id] === split.rank)
      if (usersAtRank.length === 0) continue
      const amountEach = (pot * split.pct / 100) / usersAtRank.length
      for (const u of usersAtRank) {
        payouts.push({ user_id: u.user_id, rank: split.rank, amount: Math.round(amountEach * 100) / 100 })
      }
    }

    if (payouts.length > 0) {
      // upsert, not insert — the desktop and mobile layouts both mount their own
      // WeeklyPot instance and can race to compute the same matchday concurrently
      const { error } = await supabase.from('weekly_payouts').upsert(
        payouts.map(p => ({
          pool_id: poolId, matchday, winner_user_id: p.user_id, payout_rank: p.rank, amount: p.amount,
        })),
        { onConflict: 'pool_id,matchday,payout_rank', ignoreDuplicates: true }
      )
      if (!error) results.push({ matchday, pot, payouts })
    }
  }

  return results
}
