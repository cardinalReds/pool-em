import type { SupabaseClient } from '@supabase/supabase-js'

export interface Contact {
  userId: string
  displayName: string
  sharedPoolIds: string[]
}

// Everyone the given user has ever shared a pool with — computed on read from
// pool_members, no denormalized contacts table. Naturally scoped by pool_members'
// existing RLS (only pools the caller is themselves already in), naturally excludes
// ghost_entries (no auth.users row), and includes archived pools (no is_active filter) --
// matching "everyone you've ever pooled with," not just current pools.
export async function getContacts(supabase: SupabaseClient, userId: string): Promise<Contact[]> {
  const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
    supabase.from('pools').select('id').eq('admin_id', userId),
    supabase.from('pool_members').select('pool_id').eq('user_id', userId),
  ])
  const poolIds = [...new Set([
    ...(adminPools || []).map((p: any) => p.id),
    ...(memberRows || []).map((m: any) => m.pool_id),
  ])]

  if (poolIds.length === 0) return []

  const { data: rows } = await supabase
    .from('pool_members')
    .select('user_id, display_name, pool_id')
    .in('pool_id', poolIds)
    .neq('user_id', userId)

  const byUser = new Map<string, Contact>()
  for (const row of rows || []) {
    const existing = byUser.get(row.user_id)
    if (existing) {
      existing.displayName = row.display_name
      existing.sharedPoolIds.push(row.pool_id)
    } else {
      byUser.set(row.user_id, { userId: row.user_id, displayName: row.display_name, sharedPoolIds: [row.pool_id] })
    }
  }

  return [...byUser.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function getMutualContacts(contacts: Contact[], poolMemberUserIds: Set<string>): Contact[] {
  return contacts.filter(c => poolMemberUserIds.has(c.userId))
}
