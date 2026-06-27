import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── F1 2026 session poller ───────────────────────────────────────────────
// Detects when a practice/qualifying/sprint/race session has finished and
// triggers /api/score-f1. Kept separate from /api/live/route.ts because that
// file dispatches on `fixtures` rows; F1 sessions live in their own table.
//
// Unlike soccer (constant live matches most days during the tournament) or
// even MMA (one event), F1 only has ~24 race weekends/year with a handful of
// sessions each. Polling every minute all season (as vercel.json currently
// does for soccer) would be wasteful against a free-tier API quota, so this
// route only calls the API when a session is within its likely window —
// see the date-range guard below.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const F1_BASE = 'https://v1.formula-1.api-sports.io'
const TOURNAMENT_ID = 'f1_2026'

async function fetchSessionStatus(competitionId: number, season: number): Promise<any[]> {
  const res = await fetch(`${F1_BASE}/races?competition=${competitionId}&season=${season}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.response || []
}

async function triggerScoring() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'
  await fetch(`${appUrl}/api/score-f1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  }).catch(() => {})
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Only look at sessions whose date is within the last 3 days or next 6
    // hours — i.e. an active or just-finished race weekend. Skip the API
    // call entirely outside that window.
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000)

    const { data: candidateSessions } = await supabase
      .from('f1_sessions')
      .select('id, competition_id, competition_name, season, session_type, status')
      .eq('tournament_id', TOURNAMENT_ID)
      .neq('status', 'Completed')
      .neq('status', 'Cancelled')
      .gte('date', sevenDaysAgo.toISOString())
      .lte('date', sixHoursFromNow.toISOString())

    if (!candidateSessions?.length) {
      return NextResponse.json({ ok: true, checked: 0, updated: 0, skipped: true })
    }

    // Group by competition so we only call the API once per Grand Prix, not per session
    const byCompetition = new Map<string, typeof candidateSessions>()
    for (const s of candidateSessions) {
      const key = `${s.competition_id}-${s.season}`
      if (!byCompetition.has(key)) byCompetition.set(key, [])
      byCompetition.get(key)!.push(s)
    }

    let updated = 0
    let justCompleted = false

    for (const [, sessions] of byCompetition) {
      const { competition_id, season } = sessions[0]
      const apiSessions = await fetchSessionStatus(competition_id, season)

      for (const apiSession of apiSessions) {
        const match = sessions.find(s => s.id === apiSession.id)
        if (!match) continue

        if (apiSession.status === 'Completed' && match.status !== 'Completed') {
          await supabase.from('f1_sessions').update({ status: 'Completed' }).eq('id', match.id)
          updated++
          justCompleted = true
        } else if (apiSession.status !== match.status) {
          await supabase.from('f1_sessions').update({ status: apiSession.status }).eq('id', match.id)
        }
      }
    }

    if (justCompleted) await triggerScoring()

    return NextResponse.json({ ok: true, checked: candidateSessions.length, updated })
  } catch (err) {
    console.error('F1 live route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
