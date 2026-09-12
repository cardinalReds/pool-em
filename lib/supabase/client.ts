import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// touched 2026-09-12 to force a fresh git-push-triggered Vercel build while chasing a
// NEXT_PUBLIC_SUPABASE_ANON_KEY build-time env var issue — safe to remove later.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  if (client) return client
  client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey)
  return client
}
