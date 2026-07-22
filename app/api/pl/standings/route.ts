import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const LEAGUE = 39
const SEASON = 2026

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/standings?league=${LEAGUE}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const standings = data.response?.[0]?.league?.standings?.[0] || []

    let updated = 0
    for (const s of standings) {
      // Plain update, not upsert — team rows already exist (created daily by
      // /api/pl/squads). Postgres validates NOT NULL constraints against the full
      // implied row even for the DO UPDATE branch of an upsert, so a partial-column
      // upsert can't work here without also re-sending name/short_name/logo; a
      // straight update sidesteps that and is the more accurate operation anyway —
      // this route only ever means "refresh standings for teams that exist."
      const { error } = await supabase.from('pl_teams').update({
        position: s.rank,
        points: s.points,
        played: s.all.played,
        won: s.all.win,
        drawn: s.all.draw,
        lost: s.all.lose,
        goals_for: s.all.goals.for,
        goals_against: s.all.goals.against,
        goal_difference: s.goalsDiff,
      }).eq('id', s.team.id)
      if (!error) updated++
    }

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error('PL standings sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
