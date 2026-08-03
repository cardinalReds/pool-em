import type { SupabaseClient } from '@supabase/supabase-js'

// Sliding-window limiter backed by rate_limit_events (service-role only). Returns false
// once `key` has hit `max` events within the last `windowSeconds` — caller decides what
// key means (per-email, per-IP, per-user, or a combination joined into one string).
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  opts: { max: number; windowSeconds: number }
): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000).toISOString()
  const { count } = await supabase
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)
  if ((count || 0) >= opts.max) return false

  await supabase.from('rate_limit_events').insert({ key })

  // No dedicated cron for this table — prune old rows opportunistically (1% of calls)
  // so it doesn't grow unbounded. Cheap, safe to run redundantly, fire-and-forget.
  if (Math.random() < 0.01) {
    supabase.from('rate_limit_events').delete().lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).then(() => {})
  }

  return true
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
