import { createClient } from '@supabase/supabase-js'

// Records that a sync route hit a real, persistent problem (as opposed to "nothing new
// to fetch this tick") — e.g. an api-sports product whose plan doesn't cover the current
// season, an auth failure, a schema mismatch in the response. Without this, a route can
// fail every single cron tick for months with nothing but a console.error nobody reads
// (this is exactly how F1 went unscored for an entire season). Edge-triggered, not
// level-triggered: /api/admin/notify only emails once per NEW incident (first occurrence,
// or a recurrence after a prior one was cleared), not on every 5-minute digest tick while
// the problem sits unresolved.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Upserts the issue's last_seen_at/message on every call, but only resets
// first_seen_at/notified_at when this is a genuinely new incident (no row yet, or the
// prior incident under this key was already marked resolved) — so a problem that's been
// failing for a week doesn't get its "first seen" clock reset on every tick.
export async function reportSyncIssue(key: string, message: string): Promise<void> {
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
  await supabase.from('sync_issues').update({ resolved_at: new Date().toISOString() }).eq('key', key).is('resolved_at', null)
}
