import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Records that a sync route hit a real, persistent problem (as opposed to "nothing new
// to fetch this tick") — e.g. an api-sports product whose plan doesn't cover the current
// season, an auth failure, a schema mismatch in the response. Without this, a route can
// fail every single cron tick for months with nothing but a console.error nobody reads
// (this is exactly how F1 went unscored for an entire season). Edge-triggered, not
// level-triggered: /api/admin/notify only emails once per NEW incident (first occurrence,
// or a recurrence after a prior one was cleared), not on every 5-minute digest tick while
// the problem sits unresolved.
//
// The client is built lazily inside getSupabase(), not at module scope, on purpose: this
// module is imported by lib/cfbRankings.ts, which a client component (NFLGamesList.tsx)
// also imports for the client-safe rankOf() helper. A module-scope createClient() call
// using SUPABASE_SERVICE_KEY runs the instant the module loads, in whatever bundle it
// ends up in — including the browser, where that key is (correctly) never inlined, so it's
// always undefined there. That crashed every single pool page in production with
// "supabaseKey is required" the moment this file started being imported transitively from
// client code, with no code-side symptom to grep for since the failure only happens at
// runtime, in a bundle nobody was looking at. Deferring construction into the function
// bodies below means merely importing this module (dead code in a client bundle) is inert;
// it only actually runs if reportSyncIssue/clearSyncIssue are called, which never happens
// client-side.
let supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )
  }
  return supabase
}

// Upserts the issue's last_seen_at/message on every call, but only resets
// first_seen_at/notified_at when this is a genuinely new incident (no row yet, or the
// prior incident under this key was already marked resolved) — so a problem that's been
// failing for a week doesn't get its "first seen" clock reset on every tick.
export async function reportSyncIssue(key: string, message: string): Promise<void> {
  const supabase = getSupabase()
  const { data: existing } = await supabase.from('sync_issues').select('resolved_at').eq('key', key).maybeSingle()
  const isNewIncident = !existing || existing.resolved_at !== null

  await supabase.from('sync_issues').upsert({
    key,
    message,
    last_seen_at: new Date().toISOString(),
    ...(isNewIncident ? { first_seen_at: new Date().toISOString(), notified_at: null, resolved_at: null } : {}),
  })
}

// Call once a sync route confirms things are working again (a clean fetch with no
// plan/auth errors). No-op if there was nothing to clear.
export async function clearSyncIssue(key: string): Promise<void> {
  await getSupabase().from('sync_issues').update({ resolved_at: new Date().toISOString() }).eq('key', key).is('resolved_at', null)
}
