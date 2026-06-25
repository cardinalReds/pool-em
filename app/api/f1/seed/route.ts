import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── /api/f1/seed ─────────────────────────────────────────────────────────────
// One-time seeder that populates f1_sessions with the full 2026 F1 calendar.
// Call once with your CRON_SECRET:
//   curl -X POST "https://www.pool-em.com/api/f1/seed?secret=YOUR_SECRET"
//
// Safe to re-run — uses upsert with (competition_id, season, session_type)
// unique constraint so existing rows are updated not duplicated.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const F1_BASE = 'https://v1.formula-1.api-sports.io'
const SEASON = 2026
const TOURNAMENT_ID = 'f1_2026'

// Session types we care about — skip practice sessions since users don't pick on those
const SCORED_SESSION_TYPES = ['Race', '1st Qualifying', '2nd Qualifying', '3rd Qualifying', 'Sprint', 'Sprint Qualifying']

// All 2026 F1 competition IDs from /competitions endpoint
// Verified from your earlier API call — excludes historical/defunct venues
const COMPETITION_IDS = [
  1,   // Australia
  2,   // Bahrain
  4,   // China
  6,   // Barcelona-Catalunya (Spain)
  7,   // Monaco
  8,   // Azerbaijan
  9,   // Canada
  11,  // Austria
  12,  // Great Britain
  14,  // Hungary
  15,  // Belgium
  16,  // Italy (Monza)
  17,  // Singapore
  19,  // Japan
  20,  // USA (Austin)
  21,  // Mexico
  22,  // Brazil
  23,  // Abu Dhabi
  32,  // Saudi Arabia
  33,  // Qatar
  34,  // Miami
  35,  // Las Vegas
  216, // Spain (Madrid)
]

async function fetchSessions(competitionId: number): Promise<any[]> {
  const res = await fetch(`${F1_BASE}/races?competition=${competitionId}&season=${SEASON}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.response || []
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: { competition: number; inserted: number; skipped: number; error?: string }[] = []

  for (const competitionId of COMPETITION_IDS) {
    try {
      const sessions = await fetchSessions(competitionId)

      if (!sessions.length) {
        results.push({ competition: competitionId, inserted: 0, skipped: 0, error: 'no sessions returned' })
        continue
      }

      const rows = sessions
        .filter(s => SCORED_SESSION_TYPES.includes(s.type))
        .map(s => ({
          id: s.id,
          competition_id: s.competition.id,
          competition_name: s.competition.name,
          season: s.season,
          session_type: s.type,
          date: s.date,
          status: s.status || 'Scheduled',
          tournament_id: TOURNAMENT_ID,
          results: null,
          scored: false,
        }))

      if (!rows.length) {
        results.push({ competition: competitionId, inserted: 0, skipped: sessions.length, error: 'no scored session types found' })
        continue
      }

      const { error } = await supabase
        .from('f1_sessions')
        .upsert(rows, { onConflict: 'id' })

      if (error) {
        results.push({ competition: competitionId, inserted: 0, skipped: 0, error: error.message })
      } else {
        results.push({ competition: competitionId, inserted: rows.length, skipped: sessions.length - rows.length })
      }

      // Small delay to avoid hammering the API
      await new Promise(r => setTimeout(r, 300))

    } catch (err) {
      results.push({ competition: competitionId, inserted: 0, skipped: 0, error: String(err) })
    }
  }

  const totalInserted = results.reduce((a, r) => a + r.inserted, 0)
  const errors = results.filter(r => r.error)

  return NextResponse.json({
    ok: true,
    total_inserted: totalInserted,
    competitions_processed: results.length,
    errors: errors.length ? errors : undefined,
    detail: results,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
