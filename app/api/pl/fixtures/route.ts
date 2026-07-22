import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const LEAGUE = 39
const SEASON = 2026
const TOURNAMENT_ID = 'pl_2026'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${LEAGUE}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const fixtures = data.response || []

    let upserted = 0
    const failures: { id: number; error: string }[] = []
    for (const f of fixtures) {
      const round = f.league.round.replace('Regular Season - ', 'Matchday ')
      const { error } = await supabase.from('fixtures').upsert({
        id: f.fixture.id,
        tournament_id: TOURNAMENT_ID,
        round,
        home_team: f.teams.home.name,
        away_team: f.teams.away.name,
        home_logo: f.teams.home.logo || null,
        away_logo: f.teams.away.logo || null,
        date: f.fixture.date,
        api_fixture_id: f.fixture.id,
        status: f.fixture.status.short,
        // API-Football sometimes has no venue name yet (e.g. venue TBD) — city or a
        // placeholder keeps this from violating the not-null constraint and silently
        // dropping the fixture entirely.
        venue: f.fixture.venue?.name || f.fixture.venue?.city || 'TBD',
        city: f.fixture.venue?.city || null,
        home_score: f.goals?.home ?? null,
        away_score: f.goals?.away ?? null,
      }, { onConflict: 'id' })
      if (error) {
        failures.push({ id: f.fixture.id, error: error.message })
      } else {
        upserted++
      }
    }

    if (failures.length > 0) console.error('PL fixtures sync — failed rows:', failures)
    return NextResponse.json({ ok: true, upserted, failed: failures.length, failures: failures.slice(0, 10) })
  } catch (err) {
    console.error('PL fixtures sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
