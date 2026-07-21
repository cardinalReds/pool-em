import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const LEAGUE = 39
const SEASON = 2026

const TEAM_IDS = [33, 34, 35, 36, 40, 42, 45, 47, 49, 50, 51, 52, 55, 57, 63, 64, 65, 66, 746, 1346]

async function fetchTeams() {
  const res = await fetch(
    `https://v3.football.api-sports.io/teams?league=${LEAGUE}&season=${SEASON}`,
    { headers: { 'x-apisports-key': API_KEY } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.response || []
}

async function fetchSquad(teamId: number) {
  const res = await fetch(
    `https://v3.football.api-sports.io/players/squads?team=${teamId}`,
    { headers: { 'x-apisports-key': API_KEY } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.response?.[0]?.players || []
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch and upsert teams
    const teams = await fetchTeams()
    for (const t of teams) {
      await supabase.from('pl_teams').upsert({
        id: t.team.id,
        name: t.team.name,
        short_name: t.team.name,
        logo: t.team.logo,
        season: SEASON,
        updated_at: new Date().toISOString(),
      })
    }

    // Fetch squads for each team (rate limit: 10 req/min on free tier — add delay)
    let playerCount = 0
    for (const teamId of TEAM_IDS) {
      const players = await fetchSquad(teamId)
      for (const p of players) {
        await supabase.from('pl_players').upsert({
          id: p.id,
          name: p.name,
          team_id: teamId,
          position: p.position,
          season: SEASON,
          updated_at: new Date().toISOString(),
        })
        playerCount++
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({ ok: true, teams: teams.length, players: playerCount })
  } catch (err) {
    console.error('PL squads sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
