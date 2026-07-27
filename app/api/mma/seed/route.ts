import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── /api/mma/seed ────────────────────────────────────────────────────────────
// Populates `fixtures` with a UFC card from BallDontLie. Serves both the
// initial seed and the 24h refresh (card lineups change up until fight week) —
// safe to re-run: upserts by `id`, and never touches a fixture once scored=true.
//
// Auto-discovers each tournament's BallDontLie event id by matching event_date
// if `tournaments.api_league_id` isn't already set, and backfills that column —
// the existing app/api/mma/live and app/api/mma/score routes already read
// api_league_id as the BallDontLie event id, so this also makes those routes
// work correctly for a tournament they've never been able to find before.
//
//   curl -X POST "https://www.pool-em.com/api/mma/seed?secret=YOUR_SECRET"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BDL_KEY = process.env.BALLDONTLIE_API_KEY!
const BDL_BASE = 'https://api.balldontlie.io/mma/v1'
const UFC_LEAGUE_ID = 1

// Fighter photos come from a different provider (api-sports MMA, same account/key as
// F1) since BallDontLie doesn't return them at all -- confirmed by checking every field
// in its fighter objects. api-sports' /fighters search endpoint isn't season/date
// restricted the way its /fights endpoint is (it's not scoped to a specific event), so
// it works fine on the Free plan. It IS rate-limited to 10 req/min though, and its
// search field rejects anything but alphanumeric+spaces (diacritics, hyphens, etc. 400),
// so names need normalizing first. Capped per run below to stay within a safe execution
// window -- a brand new card's ~20 fighters backfill over a couple of 12h cron runs
// rather than one long one; this is fine since most runs only have a couple of new
// names to look up (late replacements), not a whole fresh card.
const APISPORTS_KEY = process.env.API_FOOTBALL_KEY!
const APISPORTS_MMA_BASE = 'https://v1.mma.api-sports.io'
const MAX_PHOTO_LOOKUPS_PER_RUN = 8
const PHOTO_LOOKUP_DELAY_MS = 6500

function normalizeForSearch(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics (Kauê -> Kaue)
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // hyphens etc -> spaces (Abdul-Malik -> Abdul Malik)
    .replace(/\s+/g, ' ').trim()
}

async function fetchFighterPhoto(name: string): Promise<string | null> {
  const query = normalizeForSearch(name)
  if (!query) return null
  const res = await fetch(`${APISPORTS_MMA_BASE}/fighters?search=${encodeURIComponent(query)}`, {
    headers: { 'x-apisports-key': APISPORTS_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.response?.[0]?.photo ?? null
}

async function findEventId(eventDate: Date): Promise<number | null> {
  const res = await fetch(`${BDL_BASE}/events?league_ids[]=${UFC_LEAGUE_ID}&per_page=100`, {
    headers: { Authorization: BDL_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  const events: any[] = data.data || []
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000
  const match = events.find(e => Math.abs(new Date(e.date).getTime() - eventDate.getTime()) < twoDaysMs)
  return match?.id ?? null
}

async function fetchFights(eventId: number): Promise<any[]> {
  const res = await fetch(`${BDL_BASE}/fights?event_ids[]=${eventId}&per_page=100`, {
    headers: { Authorization: BDL_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.data || []
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, event_date, api_league_id')
    .eq('sport', 'mma')
    .eq('status', 'active')
    .not('event_date', 'is', null)
    .gte('event_date', new Date().toISOString())

  // Reuse photos we've already looked up for a fighter (they rarely change, and
  // the same fighters show up across multiple cards) before spending any of this
  // run's limited lookup budget on them.
  const { data: photoRows } = await supabase
    .from('fixtures')
    .select('home_team, fighter1_photo, away_team, fighter2_photo')
    .not('card_segment', 'is', null) // card_segment is MMA-only; fixtures has no sport column
    .not('fighter1_photo', 'is', null)
  const photoCache = new Map<string, string>()
  for (const r of photoRows || []) {
    if (r.home_team && r.fighter1_photo) photoCache.set(r.home_team, r.fighter1_photo)
    if (r.away_team && r.fighter2_photo) photoCache.set(r.away_team, r.fighter2_photo)
  }
  let photoLookupBudget = MAX_PHOTO_LOOKUPS_PER_RUN

  async function resolvePhoto(name: string | undefined): Promise<string | null> {
    if (!name) return null
    if (photoCache.has(name)) return photoCache.get(name)!
    if (photoLookupBudget <= 0) return null
    photoLookupBudget--
    const photo = await fetchFighterPhoto(name)
    if (photo) photoCache.set(name, photo)
    await new Promise(r => setTimeout(r, PHOTO_LOOKUP_DELAY_MS))
    return photo
  }

  const results: { tournament: string; inserted: number; error?: string }[] = []

  for (const tournament of tournaments || []) {
    try {
      let eventId = tournament.api_league_id
      if (!eventId) {
        eventId = await findEventId(new Date(tournament.event_date))
        if (!eventId) {
          results.push({ tournament: tournament.id, inserted: 0, error: 'no matching BallDontLie event found' })
          continue
        }
        await supabase.from('tournaments').update({ api_league_id: eventId }).eq('id', tournament.id)
      }

      const fights = await fetchFights(eventId)
      if (!fights.length) {
        results.push({ tournament: tournament.id, inserted: 0, error: 'no fights returned' })
        continue
      }

      // Never clobber a fixture that's already been scored — only overwrite rows
      // still pre-fight, which is exactly what lets substitutions/reshuffles refresh in.
      const { data: existing } = await supabase
        .from('fixtures')
        .select('id, scored')
        .eq('tournament_id', tournament.id)
      const scoredIds = new Set((existing || []).filter(f => f.scored).map(f => f.id))

      // Fights don't carry their own individual start time — all fights in a segment
      // share that segment's start time. app/api/mma/live/route.ts already progresses
      // each subsequent fight's date forward in real time as the card plays out, so a
      // shared initial time per segment is correct, not a placeholder.
      const segmentTime: Record<string, string> = {
        early_prelims: fights[0]?.event?.early_prelims_start_time,
        prelims: fights[0]?.event?.prelims_start_time,
        main_card: fights[0]?.event?.main_card_start_time,
      }
      const fallbackDate = fights[0]?.event?.date

      const candidateFights = fights.filter((f: any) => f.id && !scoredIds.has(f.id))

      // BallDontLie doesn't provide fighter photos at all (checked every field in its
      // fighter objects) -- resolved separately from api-sports' /fighters search
      // endpoint via resolvePhoto(), which is cache-first and rate-limit-budgeted
      // across this whole run (see MAX_PHOTO_LOOKUPS_PER_RUN above).
      const rows = []
      for (const f of candidateFights) {
        rows.push({
          id: f.id,
          api_fixture_id: f.id,
          date: segmentTime[f.card_segment] || fallbackDate,
          home_team: f.fighter1?.name,
          away_team: f.fighter2?.name,
          venue: f.event?.venue_name ?? null,
          city: f.event?.venue_city ?? null,
          round: f.card_segment,
          status: 'NS',
          tournament_id: tournament.id,
          scored: false,
          fight_order: f.fight_order,
          card_segment: f.card_segment,
          scheduled_rounds: f.scheduled_rounds,
          is_title_fight: !!f.is_title_fight,
          fighter1_photo: await resolvePhoto(f.fighter1?.name),
          fighter2_photo: await resolvePhoto(f.fighter2?.name),
          weight_class: f.weight_class?.name ?? null,
          fighter1_nationality: f.fighter1?.nationality ?? null,
          fighter2_nationality: f.fighter2?.nationality ?? null,
          fighter1_last_name: f.fighter1?.last_name ?? null,
          fighter2_last_name: f.fighter2?.last_name ?? null,
          fighter1_id: f.fighter1?.id ?? null,
          fighter2_id: f.fighter2?.id ?? null,
        })
      }

      if (!rows.length) {
        results.push({ tournament: tournament.id, inserted: 0, error: 'nothing new to upsert' })
        continue
      }

      const { error } = await supabase.from('fixtures').upsert(rows, { onConflict: 'id' })

      if (error) {
        results.push({ tournament: tournament.id, inserted: 0, error: error.message })
      } else {
        results.push({ tournament: tournament.id, inserted: rows.length })
      }

      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      results.push({ tournament: tournament.id, inserted: 0, error: String(err) })
    }
  }

  return NextResponse.json({
    ok: true,
    tournaments_processed: results.length,
    detail: results,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
