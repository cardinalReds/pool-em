import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
const ODDS_API_KEY = process.env.ODDS_API_KEY!

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // strip accents (José -> Jose)
    .replace(/['’]/g, '') // strip apostrophes (Hawai'i -> Hawaii)
    .toLowerCase()
    .trim()
}

// The Odds API names teams "{School} {Mascot}" (e.g. "TCU Horned Frogs"); our fixtures
// store just the school ("TCU"). A startsWith match after normalization is reliable for
// that convention and avoids a hand-maintained team-name mapping table.
function matchesTeam(oddsApiName: string, ourName: string): boolean {
  return normalizeTeamName(oddsApiName).startsWith(normalizeTeamName(ourName))
}

function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
}

export async function syncOddsApiFootball(
  sportKey: 'americanfootball_nfl' | 'americanfootball_ncaaf',
  tournamentId: string
) {
  const now = new Date()
  const min = new Date(now.getTime() + 1 * 60 * 60 * 1000)
  const max = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_team, away_team, date')
    .eq('tournament_id', tournamentId)
    .gte('date', min.toISOString())
    .lte('date', max.toISOString())
    .eq('status', 'NS')

  if (!fixtures?.length) return { ok: true, updated: 0, matched: 0, total_in_window: 0, events_returned: 0 }

  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`
  )
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${await res.text()}`)
  const events: any[] = await res.json()

  let updated = 0
  let matched = 0
  for (const fixture of fixtures) {
    const kickoff = new Date(fixture.date).getTime()
    const event = events.find(e =>
      matchesTeam(e.home_team, fixture.home_team) &&
      matchesTeam(e.away_team, fixture.away_team) &&
      Math.abs(new Date(e.commence_time).getTime() - kickoff) < 6 * 60 * 60 * 1000
    )
    if (!event) continue
    matched++

    // Whichever US book has both markets populated first — spreads/totals barely move
    // book-to-book and we're not offering bet placement, so book choice doesn't matter much.
    const book = event.bookmakers?.find((bm: any) =>
      bm.markets?.some((m: any) => m.key === 'spreads') &&
      bm.markets?.some((m: any) => m.key === 'totals')
    ) ?? event.bookmakers?.[0]
    if (!book) continue

    const spreadsMarket = book.markets?.find((m: any) => m.key === 'spreads')
    const totalsMarket = book.markets?.find((m: any) => m.key === 'totals')
    const h2hMarket = book.markets?.find((m: any) => m.key === 'h2h')

    const homeSpread = spreadsMarket?.outcomes?.find((o: any) => o.name === event.home_team)?.point ?? null
    const totalPoint = totalsMarket?.outcomes?.[0]?.point ?? null
    const homeMl = h2hMarket?.outcomes?.find((o: any) => o.name === event.home_team)?.price
    const awayMl = h2hMarket?.outcomes?.find((o: any) => o.name === event.away_team)?.price

    const { error } = await supabase.from('fixtures').update({
      line_total_goals: totalPoint,
      line_asian_handicap_home: homeSpread,
      line_asian_handicap_away: homeSpread != null ? -homeSpread : null,
      odds_home: homeMl != null ? americanToDecimal(homeMl) : null,
      odds_away: awayMl != null ? americanToDecimal(awayMl) : null,
      odds_updated_at: new Date().toISOString(),
    }).eq('id', fixture.id)
    if (!error) updated++
  }

  return { ok: true, updated, matched, total_in_window: fixtures.length, events_returned: events.length }
}
