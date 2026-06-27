import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io'

// Map API-Football status codes to our status values
async function syncKnockoutFixtures() {
  const KNOCKOUT_ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
  for (const round of KNOCKOUT_ROUNDS) {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=1&season=2026&round=${encodeURIComponent(round)}`,
      { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
    )
    if (!res.ok) continue
    const data = await res.json()
    for (const f of data.response || []) {
      const homeTeam = f.teams?.home?.name
      const awayTeam = f.teams?.away?.name
      if (!homeTeam || !awayTeam) continue
      const { data: existing } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team')
        .eq('api_fixture_id', f.fixture.id)
        .maybeSingle()
      if (!existing) continue
      const updates: Record<string, string> = {}
      if (existing.home_team !== homeTeam) updates.home_team = homeTeam
      if (existing.away_team !== awayTeam) updates.away_team = awayTeam
      if (Object.keys(updates).length > 0) {
        await supabase.from('fixtures').update(updates).eq('id', existing.id)
      }
    }
  }
}

async function populateTBDFixtures() {
  // Load actual standings
  const { data: rows } = await supabase
    .from('actual_standings')
    .select('group_name, position, team, advances')
    .eq('tournament_id', 'wc_2026')

  if (!rows?.length) return

  // Build standings map
  const standings: Record<string, Record<string, string>> = {}
  for (const row of rows) {
    if (!standings[row.group_name]) standings[row.group_name] = {}
    standings[row.group_name][String(row.position)] = row.team
  }

  // Find TBD fixtures and resolve them
  const { data: tbdFixtures } = await supabase
    .from('fixtures')
    .select('id, home_team, away_team')
    .eq('tournament_id', 'wc_2026')
    .or('home_team.ilike.TBD%,away_team.ilike.TBD%')

  function resolve(placeholder: string): string | null {
    const m1 = placeholder.match(/TBD \(1([A-L])\)/)
    if (m1) return standings[m1[1]]?.['1'] || null
    const m2 = placeholder.match(/TBD \(2([A-L])\)/)
    if (m2) return standings[m2[1]]?.['2'] || null
    // TBD (3) — best 3rd place — cannot resolve until all groups done
    return null
  }

  for (const fixture of tbdFixtures || []) {
    const updates: Record<string, string> = {}
    if (fixture.home_team.startsWith('TBD')) {
      const resolved = resolve(fixture.home_team)
      if (resolved) updates.home_team = resolved
    }
    if (fixture.away_team.startsWith('TBD')) {
      const resolved = resolve(fixture.away_team)
      if (resolved) updates.away_team = resolved
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('fixtures').update(updates).eq('id', fixture.id)
    }
  }
}

function normalizeStatus(apiStatus: string): string {
  const live = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE']
  const finished = ['FT', 'AET', 'PEN']
  if (live.includes(apiStatus)) return 'live'
  if (finished.includes(apiStatus)) return 'FT'
  return 'scheduled'
}

async function fetchLiveFixtures(tournamentId: string): Promise<any[]> {
  // Get the API-Football league ID for this tournament
  // WC 2026 league ID is 1 (FIFA World Cup)
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tournament?.api_league_id) return []

  const res = await fetch(
    `${API_FOOTBALL_BASE}/fixtures?league=${tournament.api_league_id}&season=${tournament.season}&live=all`,
    {
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY!,
      },
    }
  )

  if (!res.ok) return []
  const data = await res.json()
  return data.response ?? []
}

async function fetchFixtureEvents(apiFixtureId: number): Promise<any[]> {
  const res = await fetch(
    `${API_FOOTBALL_BASE}/fixtures/events?fixture=${apiFixtureId}`,
    {
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY!,
      },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.response ?? []
}

function extractFirstScorer(events: any[], homeTeam: string, awayTeam: string): string | null {
  // Include own goals — filter only missed penalties
  const goals = events
    .filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty')
    .sort((a, b) => a.time.elapsed - b.time.elapsed)

  const first = goals[0]
  if (!first) return null

  if (first.detail === 'Own Goal') {
    // e.team is the team whose player scored the own goal (e.g. France/Magnan)
    // The goal counts for the OTHER team (e.g. Spain)
    const scoringTeam = first.team?.name || ''
    const benefitingTeam = scoringTeam === homeTeam ? awayTeam : homeTeam
    return `Own Goal (${benefitingTeam})`
  }

  return first.player?.name ?? null
}


async function fetchFixtureStats(apiFixtureId: number): Promise<{ homeCorners: number; awayCorners: number; homeCards: number; awayCards: number }> {
  const res = await fetch(
    `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${apiFixtureId}`,
    { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
  )
  if (!res.ok) return { homeCorners: 0, awayCorners: 0, homeCards: 0, awayCards: 0 }
  const data = await res.json()
  const teams = data.response ?? []
  const getStat = (team: any, name: string) => parseInt(team.statistics?.find((s: any) => s.type === name)?.value ?? '0') || 0
  const home = teams[0] ?? {}
  const away = teams[1] ?? {}
  return {
    homeCorners: getStat(home, 'Corner Kicks'),
    awayCorners: getStat(away, 'Corner Kicks'),
    homeCards: getStat(home, 'Yellow Cards') + getStat(home, 'Red Cards'),
    awayCards: getStat(away, 'Yellow Cards') + getStat(away, 'Red Cards'),
  }
}

async function fetchLiveMMAFights(): Promise<any[]> {
  const res = await fetch(
    `https://v1.mma.api-sports.io/fights?date=${new Date().toISOString().slice(0, 10)}`,
    { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.response ?? []).filter((f: any) => ['IN', 'PF', 'LIVE', 'EOR', 'FT'].includes(f.status?.short))
}

async function fetchMMAResult(apiId: number): Promise<any> {
  const res = await fetch(
    `https://v1.mma.api-sports.io/fights/results?id=${apiId}`,
    { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.response?.[0] ?? null
}

async function handleMMATournament() {
  const liveFights = await fetchLiveMMAFights()
  if (!liveFights.length) return { live: 0, updated: 0 }

  let updated = 0

  for (const fight of liveFights) {
    const apiId = fight.id
    const apiStatus = fight.status?.short
    const isFinished = apiStatus === 'FT'
    const isLive = ['IN', 'PF', 'LIVE', 'EOR'].includes(apiStatus)

    const { data: ourFixture } = await supabase
      .from('fixtures')
      .select('id, status, fight_order, tournament_id')
      .eq('api_fixture_id', apiId)
      .maybeSingle()

    if (!ourFixture) continue

    const newStatus = isFinished ? 'FT' : isLive ? 'live' : 'NS'

    // Update fixture status
    const { error } = await supabase
      .from('fixtures')
      .update({ status: newStatus })
      .eq('id', ourFixture.id)

    if (error) continue

    // If fight just finished, unlock the next fight
    if (isFinished && ourFixture.status !== 'FT') {
      // Trigger scoring
      await triggerScoring(String(ourFixture.id))

      // Find next fight by fight_order and update its date to now + 10 min
      if (ourFixture.fight_order) {
        const nextLockTime = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        await supabase
          .from('fixtures')
          .update({ date: nextLockTime })
          .eq('tournament_id', ourFixture.tournament_id)
          .eq('fight_order', ourFixture.fight_order + 1)
          .eq('status', 'NS')
      }
      updated++
    }
  }

  return { live: liveFights.length, updated }
}

async function triggerScoring(fixtureId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  await fetch(`${appUrl}/api/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ fixture_id: fixtureId }),
  })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all active tournaments that have live or upcoming fixtures today
    const { data: activeTournaments } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'active')

    if (!activeTournaments?.length) {
      return NextResponse.json({ message: 'No active tournaments' })
    }

    const results: Record<string, any> = {}

    for (const tournament of activeTournaments) {
      // ── MMA tournaments ──────────────────────────────────────────────
      if (tournament.id === 'ufc_freedom_250') {
        results[tournament.id] = await handleMMATournament()
        continue
      }

      // ── Soccer tournaments ───────────────────────────────────────────
      // Only call API if there are live fixtures OR fixtures that started in the last 3 hours
      const now = new Date()
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      const { data: activeFixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', tournament.id)
        .or(`status.eq.live,and(status.eq.NS,date.gte.${threeHoursAgo.toISOString()},date.lte.${twoHoursFromNow.toISOString()})`)
        .limit(1)

      if (!activeFixtures?.length) {
        results[tournament.id] = { live: 0, skipped: true }
        continue
      }

      const liveApiFixtures = await fetchLiveFixtures(tournament.id)

      // Even if the live feed is empty, check for fixtures stuck in 'live' status
      // — they may have finished and dropped off the live feed without being updated
      if (!liveApiFixtures.length) {
        const { data: stuckFixtures } = await supabase
          .from('fixtures')
          .select('id, api_fixture_id')
          .eq('tournament_id', tournament.id)
          .eq('status', 'live')

        if (stuckFixtures?.length) {
          for (const stuck of stuckFixtures) {
            if (!stuck.api_fixture_id) continue
            const res = await fetch(
              `${API_FOOTBALL_BASE}/fixtures?id=${stuck.api_fixture_id}`,
              { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! } }
            )
            if (!res.ok) continue
            const data = await res.json()
            const apiFixture = data.response?.[0]
            if (!apiFixture) continue
            const apiStatus = apiFixture.fixture.status.short
            const status = normalizeStatus(apiStatus)
            if (status === 'FT') {
              await supabase.from('fixtures').update({
                status,
                home_score: apiFixture.goals.home ?? 0,
                away_score: apiFixture.goals.away ?? 0,
              }).eq('id', stuck.id)
              await triggerScoring(stuck.id)
            }
          }
        }

        results[tournament.id] = { live: 0 }
        continue
      }

      let updated = 0

      for (const apiFixture of liveApiFixtures) {
        const apiId = apiFixture.fixture.id
        const apiStatus = apiFixture.fixture.status.short
        const status = normalizeStatus(apiStatus)
        const homeScore = apiFixture.goals.home ?? 0
        const awayScore = apiFixture.goals.away ?? 0

        // Find our fixture by api_fixture_id
        const { data: ourFixture } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team, home_score, away_score, first_scorer_name, status, round')
          .eq('api_fixture_id', apiId)
          .single()

        if (!ourFixture) continue

        const scoreChanged =
          ourFixture.home_score !== homeScore ||
          ourFixture.away_score !== awayScore

        // Fetch events to get first scorer (only if score changed or no scorer yet)
        let firstScorer = ourFixture.first_scorer_name
        if (scoreChanged || (!firstScorer && homeScore + awayScore > 0)) {
          const events = await fetchFixtureEvents(apiId)
          firstScorer = extractFirstScorer(events, ourFixture.home_team, ourFixture.away_team)
        }

        // Fetch live stats only when score changes (saves API calls)
        let statsUpdate: Record<string, any> = {}
        if (scoreChanged) {
          const stats = await fetchFixtureStats(apiId)
          statsUpdate = {
            live_home_corners: stats.homeCorners,
            live_away_corners: stats.awayCorners,
            live_home_cards: stats.homeCards,
            live_away_cards: stats.awayCards,
          }
        }

        // Determine penalty winner if match went to shootout
        let penaltyWinner: string | null = null
        const penScore = apiFixture.score?.penalty
        if (penScore?.home != null && penScore?.away != null && (penScore.home > 0 || penScore.away > 0)) {
          penaltyWinner = penScore.home > penScore.away ? ourFixture.home_team : ourFixture.away_team
        }

        // Update fixture
        const { error } = await supabase
          .from('fixtures')
          .update({
            home_score: homeScore,
            away_score: awayScore,
            first_scorer_name: firstScorer,
            status,
            ...(penaltyWinner ? { penalty_winner: penaltyWinner } : {}),
            ...statsUpdate,
          })
          .eq('id', ourFixture.id)

        if (error) {
          console.error(`Failed to update fixture ${ourFixture.id}:`, error)
          continue
        }

        // Trigger scoring if score changed or match just finished
        if (scoreChanged || (status === 'FT' && ourFixture.status !== 'FT')) {
          await triggerScoring(ourFixture.id)
          updated++
        }

        // When a game finishes, sync knockout fixture team names from API
        if (status === 'FT' && ourFixture.status !== 'FT') {
          await syncKnockoutFixtures()
          await populateTBDFixtures()
        }
      }

      results[tournament.id] = { live: liveApiFixtures.length, updated }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('Live route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
