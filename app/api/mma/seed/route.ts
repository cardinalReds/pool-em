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

      const rows = fights
        .map((f: any) => ({
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
          fighter1_photo: null, // BallDontLie doesn't provide fighter photos
          fighter2_photo: null,
          weight_class: f.weight_class?.name ?? null,
          fighter1_nationality: f.fighter1?.nationality ?? null,
          fighter2_nationality: f.fighter2?.nationality ?? null,
          fighter1_last_name: f.fighter1?.last_name ?? null,
          fighter2_last_name: f.fighter2?.last_name ?? null,
          fighter1_id: f.fighter1?.id ?? null,
          fighter2_id: f.fighter2?.id ?? null,
        }))
        .filter((r: any) => r.id && !scoredIds.has(r.id))

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
