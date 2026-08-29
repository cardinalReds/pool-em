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

// This sync can run mid-game (it was re-run manually twice today for the week-numbering
// fix while games were live) — the vendor's raw status ("Q2", "1H", etc.) must not be
// written verbatim, or it stomps the 'live' value the per-minute score cron owns and the
// UI checks for with a value nothing recognizes as live. Collapse anything that isn't
// explicitly NS/FT-family into 'live', same as app/api/ncaaf/score/route.ts's isFinished.
function normalizeStatus(statusShort: string): string {
  if (statusShort === 'FT' || statusShort === 'AOT') return 'FT'
  if (statusShort === 'NS') return 'NS'
  return 'live'
}

// The vendor's own `week` field is far coarser than a real college-football week — confirmed
// it lumped Sat Aug 29 through the following Mon Sep 7 (two full weekends, 9 days) under a
// single week=1, which fed the best10 selector games 8 days apart as if they were the same
// pickable "week." Bucket by actual calendar week instead (Tue 00:00 UTC through the
// following Mon 23:59 UTC — the standard CFB week boundary) and number the buckets
// sequentially ourselves, from the full season's game list, so the numbering is stable
// across syncs.
function weekBucketKey(dateStr: string): number {
  const anchor = Date.UTC(2024, 0, 2) // an arbitrary Tuesday — only used to align 7-day buckets
  const diffDays = Math.floor((new Date(dateStr).getTime() - anchor) / (24 * 60 * 60 * 1000))
  return Math.floor(diffDays / 7)
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
    const allGames = data.response || []

    // FBS (Division I-A) only — the other divisions (FCS, DII, DIII) aren't what anyone
    // means by "college football" for a pool, and would dwarf the best10 candidate pool.
    const games = allGames.filter((g: any) => g.game.stage === 'FBS (Division I-A)')
    const skipped = allGames.length - games.length

    const bucketKeys = [...new Set(games.map((g: any) =>
      weekBucketKey(`${g.game.date.date}T${g.game.date.time}:00Z`)
    ))].sort((a, b) => (a as number) - (b as number))
    // Numbered from 0, not 1 — ESPN/NCAA.com both call the season's opening slate "Week 0"
    // (confirmed for 2026: Aug 28-29 is Week 0, Sept 3-7 is the "real" Week 1), so starting
    // at 1 would put our Week 1 a full week ahead of what it means everywhere else.
    const weekNumberByBucket = new Map(bucketKeys.map((k, i) => [k, i]))

    let upserted = 0
    const failures: { id: number; error: string }[] = []
    for (const g of games) {
      const dateIso = `${g.game.date.date}T${g.game.date.time}:00Z`
      const weekNumber = weekNumberByBucket.get(weekBucketKey(dateIso))

      const homeQ1 = g.scores?.home?.quarter_1
      const homeQ2 = g.scores?.home?.quarter_2
      const awayQ1 = g.scores?.away?.quarter_1
      const awayQ2 = g.scores?.away?.quarter_2
      const htHomeScore = homeQ1 != null && homeQ2 != null ? homeQ1 + homeQ2 : null
      const htAwayScore = awayQ1 != null && awayQ2 != null ? awayQ1 + awayQ2 : null

      const { error } = await supabase.from('fixtures').upsert({
        id: g.game.id,
        tournament_id: TOURNAMENT_ID,
        round: `Week ${weekNumber}`, // matches NFL's "Week N" shape used by NFLGamesList's grouping
        home_team: g.teams.home.name,
        away_team: g.teams.away.name,
        home_logo: g.teams.home.logo || null,
        away_logo: g.teams.away.logo || null,
        date: dateIso,
        api_fixture_id: g.game.id,
        status: normalizeStatus(g.game.status.short),
        venue: g.game.venue?.name || g.game.venue?.city || 'TBD',
        city: g.game.venue?.city || 'TBD', // fixtures.city is NOT NULL — many smaller-program venues omit city
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
