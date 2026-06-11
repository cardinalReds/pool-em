import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!

async function fetchOddsForFixture(fixtureId: number) {
  const res = await fetch(
    `https://v3.football.api-sports.io/odds?fixture=${fixtureId}&bookmaker=8`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response?.[0]?.bookmakers?.[0]?.bets || []
}

function extractLine(bets: any[], betName: string): number | null {
  const bet = bets.find((b: any) =>
    b.name.toLowerCase().includes(betName.toLowerCase())
  )
  if (!bet) return null
  // Find the "Over" value — the line is the number after "Over "
  const overValue = bet.values?.find((v: any) =>
    v.value?.toString().toLowerCase().startsWith('over')
  )
  if (!overValue) return null
  const match = overValue.value.toString().match(/over\s*([\d.]+)/i)
  return match ? parseFloat(match[1]) : null
}

function extractHandicap(bets: any[]): { home: number | null; away: number | null } {
  const bet = bets.find((b: any) => b.name.toLowerCase().includes('asian handicap'))
  if (!bet) return { home: null, away: null }
  const home = bet.values?.find((v: any) => v.value?.toString().includes('Home'))
  const away = bet.values?.find((v: any) => v.value?.toString().includes('Away'))
  const parseHandicap = (v: any) => {
    if (!v) return null
    const match = v.value.toString().match(/([-+]?\d+\.?\d*)/)
    return match ? parseFloat(match[1]) : null
  }
  return { home: parseHandicap(home), away: parseHandicap(away) }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const min = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const max = new Date(now.getTime() + 30 * 60 * 60 * 1000)

    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, date, api_fixture_id')
      .gte('date', min.toISOString())
      .lte('date', max.toISOString())
      .is('odds_updated_at', null)
      .not('api_fixture_id', 'is', null)
      .eq('status', 'NS')

    if (!fixtures?.length) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    let updated = 0
    for (const fixture of fixtures) {
      if (!fixture.api_fixture_id) continue
      await new Promise(r => setTimeout(r, 300))
      const bets = await fetchOddsForFixture(fixture.api_fixture_id)
      if (!bets.length) continue

      const lineGoals = extractLine(bets, 'Goals Over/Under') ?? extractLine(bets, 'Total Goals')
      const lineCorners = extractLine(bets, 'Total Corners') ?? extractLine(bets, 'Corners')
      const lineCards = extractLine(bets, 'Booking Points') ?? extractLine(bets, 'Total Bookings') ?? extractLine(bets, 'Cards')
      const { home: handicapHome, away: handicapAway } = extractHandicap(bets)

      await supabase.from('fixtures').update({
        line_total_goals: lineGoals,
        line_total_corners: lineCorners,
        line_card_points: lineCards,
        line_asian_handicap_home: handicapHome,
        line_asian_handicap_away: handicapAway,
        odds_updated_at: new Date().toISOString(),
      }).eq('id', fixture.id)

      updated++
    }

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error('Odds cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
