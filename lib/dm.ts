import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// conversations.user_a < user_b is enforced by a check constraint, so the pair always
// has to be normalized the same way regardless of who's looking it up or starting it.
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

// Finds the existing 1:1 conversation between two users, or creates one — insert is
// gated by the "Users can start a conversation with a pool-mate" RLS policy (see
// 20260821250000_direct_messages.sql), so this throws/returns null if they don't
// actually share a pool rather than silently succeeding.
export async function findOrCreateConversation(
  supabase: SupabaseClient<Database>,
  myId: string,
  otherId: string
): Promise<{ id: string } | { error: string }> {
  const [user_a, user_b] = orderedPair(myId, otherId)
  const { data: existing } = await supabase.from('conversations').select('id').eq('user_a', user_a).eq('user_b', user_b).maybeSingle()
  if (existing) return { id: existing.id }

  const { data: created, error } = await supabase.from('conversations').insert({ user_a, user_b }).select('id').single()
  if (error || !created) return { error: error?.message || 'could not start conversation' }
  return { id: created.id }
}
