import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY! // same account-wide key covers all api-sports.io products
const LEAGUE = 1 // NFL (2 = NCAA, not synced here)
const SEASON = 2026
const TOURNAMENT_ID = 'nfl_2026'

// This sync can run while games are live — the vendor's raw status ("Q2", "1H", etc.) must
// not be written verbatim, or it stomps the 'live' value the per-minute score cron owns and
// the UI checks for with a value nothing recognizes as live. See
// app/api/ncaaf/fixtures/route.ts for the fuller comment (hit there first, fixed here too).
function normalizeStatus(statusShort: string): string {
  if (statusShort === 'FT' || statusShort === 'AOT') return 'FT'
  if (statusShort === 'NS') return 'NS'
  return 'live'
}

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
      // Regular season only for now — preseason is meaningless for pools, postseason is
      // single-elimination (different shape, not built yet).
      if (g.game.stage !== 'Regular Season') { skipped++; continue }

      const homeQ1 = g.scores?.home?.quarter_1
      const homeQ2 = g.scores?.home?.quarter_2
      const awayQ1 = g.scores?.away?.quarter_1
      const awayQ2 = g.scores?.away?.quarter_2
      const htHomeScore = homeQ1 != null && homeQ2 != null ? homeQ1 + homeQ2 : null
      const htAwayScore = awayQ1 != null && awayQ2 != null ? awayQ1 + awayQ2 : null

      const { error } = await supabase.from('fixtures').upsert({
        id: g.game.id,
        tournament_id: TOURNAMENT_ID,
        round: g.game.week, // "Week 1" .. "Week 18" — same shape as PL's "Matchday N"
        home_team: g.teams.home.name,
        away_team: g.teams.away.name,
        home_logo: g.teams.home.logo || null,
        away_logo: g.teams.away.logo || null,
        date: `${g.game.date.date}T${g.game.date.time}:00Z`,
        api_fixture_id: g.game.id,
        status: normalizeStatus(g.game.status.short),
        venue: g.game.venue?.name || g.game.venue?.city || 'TBD',
        city: g.game.venue?.city || 'TBD', // fixtures.city is NOT NULL — same latent gap as app/api/ncaaf/fixtures/route.ts, just never hit for NFL yet
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

    if (failures.length > 0) console.error('NFL fixtures sync — failed rows:', failures)
    return NextResponse.json({ ok: true, upserted, skipped, failed: failures.length, failures: failures.slice(0, 10) })
  } catch (err) {
    console.error('NFL fixtures sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
