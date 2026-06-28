import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // Group by competition
    const byCompetition = new Map<string, typeof candidateSessions>()
    for (const s of candidateSessions) {
      const key = `${s.competition_id}-${s.season}`
      if (!byCompetition.has(key)) byCompetition.set(key, [])
      byCompetition.get(key)!.push(s)
    }

    let updated = 0
    let justCompleted = false
    let anyInProgress = false

    for (const [, sessions] of byCompetition) {
      const { competition_id, season } = sessions[0]
      const apiSessions = await fetchSessionStatus(competition_id, season)

      for (const dbSession of sessions) {
        // Match by session_type since our internal id != API session id
        const apiSession = apiSessions.find((s: any) =>
          s.type?.toLowerCase().replace(/\s+/g, '_') === dbSession.session_type?.toLowerCase().replace(/\s+/g, '_') ||
          s.type === dbSession.session_type
        )
        if (!apiSession) continue

        const apiStatus = apiSession.status // 'Completed', 'In Progress', 'Scheduled', etc.

        if (apiStatus === 'Completed' && dbSession.status !== 'Completed') {
          await supabase.from('f1_sessions').update({ status: 'Completed', scored: false }).eq('id', dbSession.id)
          updated++
          justCompleted = true
        } else if (apiStatus === 'In Progress' && dbSession.status !== 'In Progress') {
          await supabase.from('f1_sessions').update({ status: 'In Progress' }).eq('id', dbSession.id)
          updated++
          anyInProgress = true
        } else if (apiStatus !== dbSession.status && apiStatus !== 'Completed') {
          await supabase.from('f1_sessions').update({ status: apiStatus }).eq('id', dbSession.id)
        }

        if (apiStatus === 'In Progress') anyInProgress = true
      }
    }

    // Trigger scoring when session completes OR during live race (for live updates)
    if (justCompleted || anyInProgress) await triggerScoring()

    return NextResponse.json({ ok: true, checked: candidateSessions.length, updated })
  } catch (err) {
    console.error('F1 live route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
