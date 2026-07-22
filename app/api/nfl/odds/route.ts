import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
const API_KEY = process.env.API_FOOTBALL_KEY!
const TOURNAMENT_ID = 'nfl_2026'

async function fetchOddsForGame(gameId: number): Promise<any[]> {
  const res = await fetch(
    `https://v1.american-football.api-sports.io/odds?game=${gameId}`,
    { headers: { 'x-apisports-key': API_KEY } }
  )
  const data = await res.json()
  const bookmakers: any[] = data.response?.[0]?.bookmakers || []
  const bet365 = bookmakers.filter((bm: any) => bm.name === 'Bet365')
  const others = bookmakers.filter((bm: any) => bm.name !== 'Bet365')
  const ordered = [...bet365, ...others]
  return ordered.flatMap((bm: any) => bm.bets.map((b: any) => ({ ...b, bookmaker: bm.name })))
}

function extractTotalLine(bets: any[], betName: string): number | null {
  const bet = bets.find((b: any) => b.name === betName)
    ?? bets.find((b: any) => b.name?.toLowerCase().includes(betName.toLowerCase()))
  if (!bet) return null
  const overValue = bet.values?.find((v: any) => v.value?.toString().toLowerCase().startsWith('over'))
  if (!overValue) return null
  const match = overValue.value.toString().match(/over\s*([\d.]+)/i)
  return match ? parseFloat(match[1]) : null
}

function extractHandicap(bets: any[], betName: string): { home: number | null; away: number | null } {
  const bet = bets.find((b: any) => b.name === betName && b.bookmaker === 'Bet365')
    ?? bets.find((b: any) => b.name === betName)
  if (!bet) return { home: null, away: null }

  const homeVal = bet.values?.find((v: any) => v.value?.toString().toLowerCase().includes('home'))
  const awayVal = bet.values?.find((v: any) => v.value?.toString().toLowerCase().includes('away'))

  const parseHandicap = (v: any): number | null => {
    if (!v) return null
    const match = v.value.toString().match(/[-+]?\d+\.?\d*/)
    return match ? parseFloat(match[0]) : null
  }

  return { home: parseHandicap(homeVal), away: parseHandicap(awayVal) }
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
    const min = new Date(now.getTime() + 1 * 60 * 60 * 1000)
    const max = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const refresh48 = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, date, api_fixture_id, odds_updated_at')
      .eq('tournament_id', TOURNAMENT_ID)
      .gte('date', min.toISOString())
      .lte('date', max.toISOString())
      .eq('status', 'NS')
      .gt('api_fixture_id', 0)

    if (!fixtures?.length) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    const toFetch = fixtures.filter(f => {
      if (!f.odds_updated_at) return true
      const kickoff = new Date(f.date)
      const isWithin48hrs = kickoff <= refresh48
      const isStale = new Date(f.odds_updated_at) < sixHoursAgo
      return isWithin48hrs && isStale
    })

    let updated = 0
    for (const fixture of toFetch) {
      if (!fixture.api_fixture_id) continue
      await new Promise(r => setTimeout(r, 300))
      const bets = await fetchOddsForGame(fixture.api_fixture_id)
      if (!bets.length) continue

      const totalLine = extractTotalLine(bets, 'Over/Under')
      const htTotalLine = extractTotalLine(bets, 'Over/Under 1st Half')
      const { home: spreadHome, away: spreadAway } = extractHandicap(bets, 'Asian Handicap')
      const { home: htSpreadHome, away: htSpreadAway } = extractHandicap(bets, 'Asian Handicap First Half')

      await supabase.from('fixtures').update({
        line_total_goals: totalLine,
        line_ht_total_points: htTotalLine,
        line_asian_handicap_home: spreadHome,
        line_asian_handicap_away: spreadAway,
        line_ht_asian_handicap_home: htSpreadHome,
        line_ht_asian_handicap_away: htSpreadAway,
        odds_updated_at: new Date().toISOString(),
      }).eq('id', fixture.id)

      updated++
    }

    return NextResponse.json({ ok: true, updated, total_in_window: fixtures.length })
  } catch (err) {
    console.error('NFL odds cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
