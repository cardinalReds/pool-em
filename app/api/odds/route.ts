import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!

async function fetchOddsForFixture(fixtureId: number): Promise<any[]> {
  // Fetch all bookmakers, no filter
  const res = await fetch(
    `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  // Flatten all bets from all bookmakers, Bet365 first (most reliable)
  const bookmakers: any[] = data.response?.[0]?.bookmakers || []
  const bet365 = bookmakers.filter((bm: any) => bm.name === 'Bet365')
  const others = bookmakers.filter((bm: any) => bm.name !== 'Bet365')
  const ordered = [...bet365, ...others]
  return ordered.flatMap((bm: any) => bm.bets.map((b: any) => ({ ...b, bookmaker: bm.name })))
}

function extractLine(bets: any[], betName: string): number | null {
  // Find exact bet name match first, then partial
  const bet = bets.find((b: any) => b.name === betName)
    ?? bets.find((b: any) => b.name.toLowerCase().includes(betName.toLowerCase()))
  if (!bet) return null
  // Find the "Over X" value and extract X
  const overValue = bet.values?.find((v: any) =>
    v.value?.toString().toLowerCase().startsWith('over')
  )
  if (!overValue) return null
  const match = overValue.value.toString().match(/over\s*([\d.]+)/i)
  return match ? parseFloat(match[1]) : null
}

function extractHandicap(bets: any[]): { home: number | null; away: number | null } {
  // Use Bet365 Asian Handicap first
  const bet = bets.find((b: any) => b.name === 'Asian Handicap' && b.bookmaker === 'Bet365')
    ?? bets.find((b: any) => b.name === 'Asian Handicap')
  if (!bet) return { home: null, away: null }

  const homeVal = bet.values?.find((v: any) => v.value?.toString().toLowerCase().includes('home'))
  const awayVal = bet.values?.find((v: any) => v.value?.toString().toLowerCase().includes('away'))

  const parseHandicap = (v: any): number | null => {
    if (!v) return null
    // e.g. "Home -1.25" → -1.25
    const match = v.value.toString().match(/[-+]?\d+\.?\d*/)
    return match ? parseFloat(match[0]) : null
  }

  return { home: parseHandicap(homeVal), away: parseHandicap(awayVal) }
}

// Moneyline (who's favored to win) — shown blurred-by-default in the UI, separate from
// the lines above (which are shown openly since they're the reference point for specific
// prediction categories). Bet market is named "Match Winner" pre-match; the live-odds
// endpoint (see refreshLiveOdds below) calls the equivalent market "Fulltime Result".
function extractMatchWinner(bets: any[], betName = 'Match Winner'): { home: number | null; draw: number | null; away: number | null } {
  const bet = bets.find((b: any) => b.name === betName && b.bookmaker === 'Bet365')
    ?? bets.find((b: any) => b.name === betName)
  if (!bet) return { home: null, draw: null, away: null }

  const findOdd = (label: string) => {
    const v = bet.values?.find((v: any) => v.value?.toString().toLowerCase() === label)
    const odd = v?.odd != null ? parseFloat(v.odd) : null
    return odd != null && !isNaN(odd) ? odd : null
  }

  return { home: findOdd('home'), draw: findOdd('draw'), away: findOdd('away') }
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
    const min = new Date(now.getTime() + 1 * 60 * 60 * 1000)       // 1 hour out
    const max = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 14 days out (API limit)
    const refresh48 = new Date(now.getTime() + 48 * 60 * 60 * 1000) // t-48hrs refresh threshold

    // Fetch fixtures that either:
    // 1. Have never had odds fetched (odds_updated_at IS NULL), or
    // 2. Are within 48 hours and odds haven't been refreshed in the last 6 hours
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, date, api_fixture_id, odds_updated_at')
      .gte('date', min.toISOString())
      .lte('date', max.toISOString())
      .eq('status', 'NS')
      .gt('api_fixture_id', 0)

    if (!fixtures?.length) {
      return NextResponse.json({ ok: true, updated: 0, error: fixturesError?.message })
    }

    // Filter: never fetched OR within 48hrs and stale (>6hrs since last fetch)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    const toFetch = fixtures.filter(f => {
      if (!f.odds_updated_at) return true // never fetched
      const kickoff = new Date(f.date)
      const isWithin48hrs = kickoff <= refresh48
      const isStale = new Date(f.odds_updated_at) < sixHoursAgo
      return isWithin48hrs && isStale
    })

    let updated = 0
    for (const fixture of toFetch) {
      if (!fixture.api_fixture_id) continue
      await new Promise(r => setTimeout(r, 300))
      const bets = await fetchOddsForFixture(fixture.api_fixture_id)
      if (!bets.length) continue

      const lineGoals = extractLine(bets, 'Goals Over/Under')
      const lineCorners = extractLine(bets, 'Corners Over Under')
      const lineCards = extractLine(bets, 'Cards Over/Under')
      const { home: handicapHome, away: handicapAway } = extractHandicap(bets)
      const { home: mlHome, draw: mlDraw, away: mlAway } = extractMatchWinner(bets)

      await supabase.from('fixtures').update({
        line_total_goals: lineGoals,
        line_total_corners: lineCorners,
        line_card_points: lineCards,
        line_asian_handicap_home: handicapHome,
        line_asian_handicap_away: handicapAway,
        odds_home: mlHome,
        odds_draw: mlDraw,
        odds_away: mlAway,
        odds_updated_at: new Date().toISOString(),
      }).eq('id', fixture.id)

      updated++
    }

    return NextResponse.json({ ok: true, updated, total_in_window: fixtures.length })
  } catch (err) {
    console.error('Odds cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
