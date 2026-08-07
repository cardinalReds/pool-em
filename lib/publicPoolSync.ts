import type { SupabaseClient } from '@supabase/supabase-js'

// A private pool "matches" a public pool when they're the same tournament and the
// public pool's scored categories are all present in the private pool's ruleset (a
// superset on the private side is fine — extra private-only categories just don't
// mirror). Both must be CUSTOM pools since only CUSTOM pools have pool_rules at all.
async function getMatchingPublicPoolIds(supabase: SupabaseClient, privatePoolId: string): Promise<string[]> {
  const { data: privatePool } = await supabase
    .from('pools')
    .select('id, tournament_id, package_id, is_public')
    .eq('id', privatePoolId)
    .maybeSingle()
  if (!privatePool || privatePool.is_public || privatePool.package_id !== 'CUSTOM' || !privatePool.tournament_id) return []

  const { data: publicPools } = await supabase
    .from('pools')
    .select('id')
    .eq('is_public', true)
    .eq('tournament_id', privatePool.tournament_id)
    .eq('package_id', 'CUSTOM')
  if (!publicPools?.length) return []

  const { data: privateRules } = await supabase.from('pool_rules').select('category_id').eq('pool_id', privatePoolId)
  const privateCats = new Set((privateRules || []).map((r: any) => r.category_id))
  if (privateCats.size === 0) return []

  const matches: string[] = []
  for (const pub of publicPools) {
    const { data: pubRules } = await supabase.from('pool_rules').select('category_id').eq('pool_id', pub.id)
    const pubCats = (pubRules || []).map((r: any) => r.category_id)
    if (pubCats.length > 0 && pubCats.every((c: string) => privateCats.has(c))) matches.push(pub.id)
  }
  return matches
}

// Self-insert (auth.uid() = user_id either way) — satisfies the ordinary
// "Users can join pools" policy with no extra permissions needed.
export async function syncMemberToPublicPools(
  supabase: SupabaseClient,
  privatePoolId: string,
  userId: string,
  displayName: string,
) {
  const publicPoolIds = await getMatchingPublicPoolIds(supabase, privatePoolId)
  for (const publicPoolId of publicPoolIds) {
    const { data: existing } = await supabase
      .from('pool_members').select('id').eq('pool_id', publicPoolId).eq('user_id', userId).maybeSingle()
    if (existing) continue
    await supabase.from('pool_members').insert({ pool_id: publicPoolId, user_id: userId, display_name: displayName })
  }
}

// A ghost can only ever live in one private pool, so its public-pool presence is a
// separate, linked ghost_entries row rather than the same row appearing twice. Requires
// the caller to administer the public pool too (ghost_entries' own insert policy) — if
// they don't, this silently no-ops rather than blocking the private pool's own ghost add.
export async function syncGhostToPublicPools(
  supabase: SupabaseClient,
  privatePoolId: string,
  ghost: { id: string; name: string; created_by: string | null },
) {
  const publicPoolIds = await getMatchingPublicPoolIds(supabase, privatePoolId)
  for (const publicPoolId of publicPoolIds) {
    const { data: existing } = await supabase
      .from('ghost_entries').select('id').eq('pool_id', publicPoolId).eq('source_ghost_entry_id', ghost.id).maybeSingle()
    if (existing) continue
    await supabase.from('ghost_entries').insert({
      pool_id: publicPoolId, name: ghost.name, created_by: ghost.created_by, source_ghost_entry_id: ghost.id,
    })
  }
}

// Silently mirrors a ghost's just-saved picks onto its public-pool mirror(s) — no opt-in
// prompt, since the ghost can't see one and the admin already made that call by adding
// the ghost in the first place. Only copies categories the mirror pool actually scores
// (the public pool can be a strict subset of the private pool's ruleset).
export async function copyGhostPredictionsToMirrors(
  supabase: SupabaseClient,
  ghostId: string,
  rows: {
    fixture_id: number
    category_id: string
    value_wld: string | null
    value_number: number | null
    value_text: string | null
    value_ou: string | null
    value_yesno: boolean | null
    submitted_at: string
  }[],
) {
  if (rows.length === 0) return
  const { data: mirrors } = await supabase.from('ghost_entries').select('id, pool_id').eq('source_ghost_entry_id', ghostId)
  if (!mirrors?.length) return

  for (const mirror of mirrors) {
    const { data: mirrorRules } = await supabase.from('pool_rules').select('category_id').eq('pool_id', mirror.pool_id)
    const mirrorCats = new Set((mirrorRules || []).map((r: any) => r.category_id))
    const mirroredRows = rows
      .filter(r => mirrorCats.has(r.category_id))
      .map(r => ({ ...r, pool_id: mirror.pool_id, user_id: mirror.id }))
    if (mirroredRows.length === 0) continue
    await supabase.from('predictions_v2').upsert(mirroredRows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
  }
}

export interface CopyCandidate {
  poolId: string
  poolName: string
  sharedCategories: string[]
  onlyInOtherCategories: string[]
}

// Other same-tournament CUSTOM pools this real user belongs to that share at least one
// scored category with the current pool, and that they haven't already been asked (or
// answered) about. A pool pair with zero category overlap is never worth asking about,
// so it's filtered out here rather than persisted as a permanent "no".
export async function findUnresolvedCopyCandidates(
  supabase: SupabaseClient,
  userId: string,
  currentPoolId: string,
  currentTournamentId: string | undefined,
  currentCategories: string[],
): Promise<CopyCandidate[]> {
  if (!currentTournamentId || currentCategories.length === 0) return []

  const { data: memberships } = await supabase
    .from('pool_members')
    .select('pool_id, pools(id, name, tournament_id, package_id, archived)')
    .eq('user_id', userId)
    .neq('pool_id', currentPoolId)

  const candidates = (memberships || [])
    .map((m: any) => m.pools)
    .filter((p: any) => p && p.tournament_id === currentTournamentId && p.package_id === 'CUSTOM' && !p.archived)
  if (candidates.length === 0) return []

  const { data: resolvedPrefs } = await supabase
    .from('pool_pick_copy_prefs')
    .select('to_pool_id')
    .eq('user_id', userId)
    .eq('from_pool_id', currentPoolId)
  const resolvedIds = new Set((resolvedPrefs || []).map((p: any) => p.to_pool_id))

  const unresolved = candidates.filter((p: any) => !resolvedIds.has(p.id))
  if (unresolved.length === 0) return []

  const currentCatSet = new Set(currentCategories)
  const results: CopyCandidate[] = []
  for (const p of unresolved) {
    const { data: rules } = await supabase.from('pool_rules').select('category_id').eq('pool_id', p.id)
    const otherCats = (rules || []).map((r: any) => r.category_id)
    const shared = otherCats.filter((c: string) => currentCatSet.has(c))
    if (shared.length === 0) continue
    results.push({
      poolId: p.id,
      poolName: p.name,
      sharedCategories: shared,
      onlyInOtherCategories: otherCats.filter((c: string) => !currentCatSet.has(c)),
    })
  }
  return results
}

// Records the user's one-time answer for a pool pair (both directions, so it behaves
// symmetrically regardless of which pool they're in when they next save a pick), and on
// "yes" backfills each pool's existing picks into the other for whatever categories the
// receiving pool actually scores.
export async function resolveCopyPreference(
  supabase: SupabaseClient,
  userId: string,
  poolAId: string,
  poolBId: string,
  enabled: boolean,
) {
  await supabase.from('pool_pick_copy_prefs').upsert([
    { user_id: userId, from_pool_id: poolAId, to_pool_id: poolBId, enabled },
    { user_id: userId, from_pool_id: poolBId, to_pool_id: poolAId, enabled },
  ], { onConflict: 'user_id,from_pool_id,to_pool_id' })

  if (!enabled) return

  const [{ data: rulesA }, { data: rulesB }] = await Promise.all([
    supabase.from('pool_rules').select('category_id').eq('pool_id', poolAId),
    supabase.from('pool_rules').select('category_id').eq('pool_id', poolBId),
  ])
  const catsA = new Set((rulesA || []).map((r: any) => r.category_id))
  const catsB = new Set((rulesB || []).map((r: any) => r.category_id))

  const [{ data: predsA }, { data: predsB }] = await Promise.all([
    supabase.from('predictions_v2').select('*').eq('pool_id', poolAId).eq('user_id', userId),
    supabase.from('predictions_v2').select('*').eq('pool_id', poolBId).eq('user_id', userId),
  ])

  const stripped = (p: any) => {
    const { id, points_earned, is_correct, pool_id, user_id, ...rest } = p
    return rest
  }

  const toB = (predsA || []).filter((p: any) => catsB.has(p.category_id)).map((p: any) => ({ ...stripped(p), pool_id: poolBId, user_id: userId }))
  const toA = (predsB || []).filter((p: any) => catsA.has(p.category_id)).map((p: any) => ({ ...stripped(p), pool_id: poolAId, user_id: userId }))

  if (toB.length) await supabase.from('predictions_v2').upsert(toB, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
  if (toA.length) await supabase.from('predictions_v2').upsert(toA, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
}

// Called after a real user's pick save succeeds — silently pushes it into any other pool
// they've already opted into copying with, for whichever categories that pool scores.
export async function copyUserPredictionsToLinkedPools(
  supabase: SupabaseClient,
  userId: string,
  fromPoolId: string,
  rows: {
    fixture_id: number
    category_id: string
    value_wld: string | null
    value_number: number | null
    value_text: string | null
    value_ou: string | null
    value_yesno: boolean | null
    submitted_at: string
  }[],
) {
  if (rows.length === 0) return
  const { data: prefs } = await supabase
    .from('pool_pick_copy_prefs').select('to_pool_id').eq('user_id', userId).eq('from_pool_id', fromPoolId).eq('enabled', true)
  if (!prefs?.length) return

  for (const { to_pool_id } of prefs) {
    const { data: rules } = await supabase.from('pool_rules').select('category_id').eq('pool_id', to_pool_id)
    const cats = new Set((rules || []).map((r: any) => r.category_id))
    const copyRows = rows.filter(r => cats.has(r.category_id)).map(r => ({ ...r, pool_id: to_pool_id, user_id: userId }))
    if (copyRows.length === 0) continue
    await supabase.from('predictions_v2').upsert(copyRows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
  }
}
