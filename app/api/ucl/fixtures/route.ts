import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const UCL_LEAGUE_ID = 2 // UEFA Champions League, v3.football.api-sports.io — verified via /leagues?search=Champions
const SEASON = 2026
const TOURNAMENT_ID = 'ucl_2026'

// This sync can run while a match is live — the vendor's raw status ("1H", "2H", "HT",
// etc.) must not be written verbatim, or it stomps the 'live' value the score cron owns
// (see app/api/ncaaf/fixtures/route.ts, which hit exactly this bug).
function normalizeStatus(statusShort: string): string {
  if (['FT', 'AET', 'PEN'].includes(statusShort)) return 'FT'
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
      `https://v3.football.api-sports.io/fixtures?league=${UCL_LEAGUE_ID}&season=${SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const allFixtures = data.response || []

    // Qualifying rounds and play-offs (Jul-Aug) are already over by the time pools open —
    // only the 36-team league phase ("League Stage - N", renamed "Matchday N" to match PL's
    // convention) and later knockout rounds (Round of 16 onward — no Round of 32 in UCL's
    // format) are ever pickable. Anything else gets skipped, same idea as NCAAF filtering to
    // FBS only.
    let skipped = 0
    let upserted = 0
    const failures: { id: number; error: string }[] = []
    for (const f of allFixtures) {
      const apiRound: string = f.league.round
      const matchdayMatch = apiRound.match(/^League Stage - (\d+)$/)
      const round = matchdayMatch ? `Matchday ${matchdayMatch[1]}` : apiRound
      const isKnockout = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'].includes(apiRound)
      if (!matchdayMatch && !isKnockout) { skipped++; continue }

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
        status: normalizeStatus(f.fixture.status.short),
        venue: f.fixture.venue?.name || f.fixture.venue?.city || 'TBD',
        city: f.fixture.venue?.city || 'TBD',
        home_score: f.goals?.home ?? null,
        away_score: f.goals?.away ?? null,
        ht_home_score: f.score?.halftime?.home ?? null,
        ht_away_score: f.score?.halftime?.away ?? null,
      }, { onConflict: 'id' })
      if (error) {
        failures.push({ id: f.fixture.id, error: error.message })
      } else {
        upserted++
      }
    }

    if (failures.length > 0) console.error('UCL fixtures sync — failed rows:', failures)
    return NextResponse.json({ ok: true, upserted, skipped, failed: failures.length, failures: failures.slice(0, 10) })
  } catch (err) {
    console.error('UCL fixtures sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
