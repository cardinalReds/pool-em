import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!

const WC_TEAMS = [
  // Group A
  { id: 16, name: 'Mexico' },
  { id: 1531, name: 'South Africa' },
  { id: 17, name: 'South Korea' },
  { id: 770, name: 'Czechia' },
  // Group B
  { id: 5529, name: 'Canada' },
  { id: 1113, name: 'Bosnia and Herzegovina' },
  { id: 1569, name: 'Qatar' },
  { id: 15, name: 'Switzerland' },
  // Group C
  { id: 6, name: 'Brazil' },
  { id: 31, name: 'Morocco' },
  { id: 2386, name: 'Haiti' },
  { id: 1108, name: 'Scotland' },
  // Group D
  { id: 2384, name: 'USA' },
  { id: 2380, name: 'Paraguay' },
  { id: 20, name: 'Australia' },
  { id: 777, name: 'Türkiye' },
  // Group E
  { id: 25, name: 'Germany' },
  { id: 5530, name: 'Curaçao' },
  { id: 1501, name: 'Ivory Coast' },
  { id: 2382, name: 'Ecuador' },
  // Group F
  { id: 1118, name: 'Netherlands' },
  { id: 12, name: 'Japan' },
  { id: 5, name: 'Sweden' },
  { id: 28, name: 'Tunisia' },
  // Group G
  { id: 1, name: 'Belgium' },
  { id: 32, name: 'Egypt' },
  { id: 22, name: 'Iran' },
  { id: 4673, name: 'New Zealand' },
  // Group H
  { id: 9, name: 'Spain' },
  { id: 1533, name: 'Cape Verde' },
  { id: 23, name: 'Saudi Arabia' },
  { id: 7, name: 'Uruguay' },
  // Group I
  { id: 2, name: 'France' },
  { id: 13, name: 'Senegal' },
  { id: 1567, name: 'Iraq' },
  { id: 1090, name: 'Norway' },
  // Group J
  { id: 26, name: 'Argentina' },
  { id: 1532, name: 'Algeria' },
  { id: 775, name: 'Austria' },
  { id: 1548, name: 'Jordan' },
  // Group K
  { id: 27, name: 'Portugal' },
  { id: 1508, name: 'Congo DR' },
  { id: 1568, name: 'Uzbekistan' },
  { id: 8, name: 'Colombia' },
  // Group L
  { id: 10, name: 'England' },
  { id: 3, name: 'Croatia' },
  { id: 1504, name: 'Ghana' },
  { id: 11, name: 'Panama' },
]

async function seedTeam(teamId: number, teamName: string): Promise<{ name: string; count: number; skipped: boolean }> {
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tournament_id', 'wc_2026')

  if (count && count > 0) return { name: teamName, count, skipped: true }

  const res = await fetch(
    `https://v3.football.api-sports.io/players/squads?team=${teamId}`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  const squad = data.response?.[0]?.players || []

  if (squad.length === 0) return { name: teamName, count: 0, skipped: false }

  const rows = squad.map((p: any) => ({
    id: p.id,
    name: p.name,
    team_id: teamId,
    team_name: teamName,
    position: p.position || null,
    shirt_number: p.number || null,
    tournament_id: 'wc_2026',
  }))

  await supabase.from('players').upsert(rows, { onConflict: 'id' })
  return { name: teamName, count: rows.length, skipped: false }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = []
  let seeded = 0, skipped = 0, failed = 0

  for (const team of WC_TEAMS) {
    try {
      await new Promise(r => setTimeout(r, 250)) // rate limit
      const result = await seedTeam(team.id, team.name)
      results.push(result)
      if (result.skipped) skipped++
      else if (result.count > 0) seeded++
      else failed++
    } catch (err) {
      results.push({ name: team.name, error: String(err) })
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    summary: { seeded, skipped, failed, total: WC_TEAMS.length },
    results,
  })
}
