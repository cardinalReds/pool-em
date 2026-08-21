import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY! // same account-wide key covers all api-sports.io products
const LEAGUE = 2 // NCAA (college football) — same product as NFL (league 1), see app/api/nfl/fixtures/route.ts
const SEASON = 2026
const TOURNAMENT_ID = 'ncaaf_2026'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `https://v1.american-football.api-sports.io/games?league=${LEAGUE}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const games = data.response || []

    let upserted = 0
    let skipped = 0
    const failures: { id: number; error: string }[] = []
    for (const g of games) {
      // FBS (Division I-A) only — the other divisions (FCS, DII, DIII) aren't what anyone
      // means by "college football" for a pool, and would dwarf the best10 candidate pool.
      if (g.game.stage !== 'FBS (Division I-A)') { skipped++; continue }

      const homeQ1 = g.scores?.home?.quarter_1
      const homeQ2 = g.scores?.home?.quarter_2
      const awayQ1 = g.scores?.away?.quarter_1
      const awayQ2 = g.scores?.away?.quarter_2
      const htHomeScore = homeQ1 != null && homeQ2 != null ? homeQ1 + homeQ2 : null
      const htAwayScore = awayQ1 != null && awayQ2 != null ? awayQ1 + awayQ2 : null

      const { error } = await supabase.from('fixtures').upsert({
        id: g.game.id,
        tournament_id: TOURNAMENT_ID,
        round: `Week ${g.game.week}`, // matches NFL's "Week N" shape used by NFLGamesList's grouping
        home_team: g.teams.home.name,
        away_team: g.teams.away.name,
        home_logo: g.teams.home.logo || null,
        away_logo: g.teams.away.logo || null,
        date: `${g.game.date.date}T${g.game.date.time}:00Z`,
        api_fixture_id: g.game.id,
        status: g.game.status.short,
        venue: g.game.venue?.name || g.game.venue?.city || 'TBD',
        city: g.game.venue?.city || null,
        home_score: g.scores?.home?.total ?? null,
        away_score: g.scores?.away?.total ?? null,
        ht_home_score: htHomeScore,
        ht_away_score: htAwayScore,
      }, { onConflict: 'id' })
      if (error) {
        failures.push({ id: g.game.id, error: error.message })
      } else {
        upserted++
      }
    }

    if (failures.length > 0) console.error('NCAAF fixtures sync — failed rows:', failures)
    return NextResponse.json({ ok: true, upserted, skipped, failed: failures.length, failures: failures.slice(0, 10) })
  } catch (err) {
    console.error('NCAAF fixtures sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
