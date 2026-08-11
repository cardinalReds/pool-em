import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Same account/key as API_FOOTBALL_KEY — API-Sports bundles MMA as a separate product
// under the one account, already used elsewhere (mma/seed's fighter-photo lookup) via
// this exact base URL.
const API_KEY = process.env.API_FOOTBALL_KEY!
const APISPORTS_MMA_BASE = 'https://v1.mma.api-sports.io'

async function fetchFightsForDate(date: string): Promise<any[]> {
  const res = await fetch(`${APISPORTS_MMA_BASE}/fights?date=${date}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.response || []
}

async function fetchOddsForFight(fightId: number): Promise<any[]> {
  const res = await fetch(`${APISPORTS_MMA_BASE}/odds?fight=${fightId}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.response?.[0]?.bookmakers || []
}

function normalizeName(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

// BallDontLie (our fixtures.home_team/away_team) and API-Sports (fighters.first/second)
// are different providers with no shared id — matched by fighter names instead, either
// orientation since corner assignment isn't guaranteed to agree between the two.
function findMatchingFight(fights: any[], homeTeam: string, awayTeam: string): any {
  const h = normalizeName(homeTeam)
  const a = normalizeName(awayTeam)
  return fights.find((f: any) => {
    const first = normalizeName(f.fighters?.first?.name)
    const second = normalizeName(f.fighters?.second?.name)
    return (first === h && second === a) || (first === a && second === h)
  })
}

// Prefers the 3-way market (rare in MMA, but carries a draw price) over the plain
// 2-way moneyline, and bet365 over other bookmakers when both offer the same market —
// same priority order as the soccer/NFL odds routes.
function extractMoneyline(bookmakers: any[]): { home: number | null; draw: number | null; away: number | null } {
  const ordered = [...bookmakers.filter(bm => bm.name === 'bet365'), ...bookmakers.filter(bm => bm.name !== 'bet365')]

  const findVal = (bet: any, label: string) => {
    const v = bet?.values?.find((v: any) => v.value?.toString().toLowerCase() === label)
    const odd = v?.odd != null ? parseFloat(v.odd) : null
    return odd != null && !isNaN(odd) ? odd : null
  }

  for (const bm of ordered) {
    const bet = bm.bets?.find((b: any) => b.name === '3Way Result')
    if (bet) return { home: findVal(bet, 'home'), draw: findVal(bet, 'draw'), away: findVal(bet, 'away') }
  }
  for (const bm of ordered) {
    const bet = bm.bets?.find((b: any) => b.name === 'Home/Away')
    if (bet) return { home: findVal(bet, 'home'), draw: null, away: findVal(bet, 'away') }
  }
  return { home: null, draw: null, away: null }
}

async function run() {
  const now = new Date()
  const min = new Date(now.getTime() + 1 * 60 * 60 * 1000)       // 1 hour out
  const max = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 14 days out, matching soccer/NFL
  const refresh48 = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  const { data: mmaTournaments } = await supabase.from('tournaments').select('id').eq('sport', 'mma')
  const mmaTournamentIds = new Set((mmaTournaments || []).map((t: any) => t.id))
  if (mmaTournamentIds.size === 0) return { ok: true, updated: 0 }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, date, home_team, away_team, api_sports_fight_id, odds_updated_at, tournament_id')
    .gte('date', min.toISOString())
    .lte('date', max.toISOString())
    .eq('status', 'NS')

  const mmaFixtures = (fixtures || []).filter((f: any) => mmaTournamentIds.has(f.tournament_id))
  if (mmaFixtures.length === 0) return { ok: true, updated: 0 }

  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const toFetch = mmaFixtures.filter((f: any) => {
    if (!f.odds_updated_at) return true
    const fightTime = new Date(f.date)
    return fightTime <= refresh48 && new Date(f.odds_updated_at) < sixHoursAgo
  })
  if (toFetch.length === 0) return { ok: true, updated: 0, total_in_window: mmaFixtures.length }

  // Resolve api_sports_fight_id for any fixture that doesn't have one yet. Card nights
  // routinely cross the midnight UTC boundary, and our own per-fixture time is only an
  // estimate (segment-level, not per-fight) — confirmed against a real card that our
  // estimated time can land a fight on a different calendar day than api-sports files
  // it under. Query the fixture's date plus the day either side and merge, so matching
  // doesn't depend on the two providers agreeing on which day a fight "is."
  const dayCache = new Map<string, any[]>()
  async function fightsForDay(dateKey: string): Promise<any[]> {
    if (!dayCache.has(dateKey)) {
      dayCache.set(dateKey, await fetchFightsForDate(dateKey))
      await new Promise(r => setTimeout(r, 300))
    }
    return dayCache.get(dateKey)!
  }

  for (const f of toFetch) {
    if (f.api_sports_fight_id) continue
    const centerDate = new Date(f.date)
    const dateKeys = [-1, 0, 1].map(offset => {
      const d = new Date(centerDate.getTime() + offset * 24 * 60 * 60 * 1000)
      return d.toISOString().slice(0, 10)
    })
    const candidates: any[] = []
    for (const dateKey of dateKeys) candidates.push(...await fightsForDay(dateKey))

    const match = findMatchingFight(candidates, f.home_team, f.away_team)
    if (match?.id) {
      f.api_sports_fight_id = match.id
      await supabase.from('fixtures').update({ api_sports_fight_id: match.id }).eq('id', f.id)
    }
  }

  let updated = 0
  for (const f of toFetch) {
    if (!f.api_sports_fight_id) continue
    await new Promise(r => setTimeout(r, 300))
    const bookmakers = await fetchOddsForFight(f.api_sports_fight_id)
    if (!bookmakers.length) continue // no line posted yet — retried next run since odds_updated_at stays null

    const { home, draw, away } = extractMoneyline(bookmakers)
    if (home == null && draw == null && away == null) continue

    await supabase.from('fixtures').update({
      odds_home: home,
      odds_draw: draw,
      odds_away: away,
      odds_updated_at: new Date().toISOString(),
    }).eq('id', f.id)
    updated++
  }

  return { ok: true, updated, total_in_window: mmaFixtures.length }
}

async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await run())
  } catch (err) {
    console.error('MMA odds cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
