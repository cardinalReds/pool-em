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
      const apiDate = f.fixture?.date
      const apiId = f.fixture?.id
      if (!homeTeam || !awayTeam || !apiDate) continue

      // Try matching by api_fixture_id first, then by date
      let existing: any = null
      if (apiId) {
        const { data: byId } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team, api_fixture_id')
          .eq('api_fixture_id', apiId)
          .maybeSingle()
        existing = byId
      }
      if (!existing) {
        // Match by date (within 1 hour) and round
        const apiDateObj = new Date(apiDate)
        const { data: byDate } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team, api_fixture_id')
          .eq('tournament_id', 'wc_2026')
          .eq('round', round)
          .gte('date', new Date(apiDateObj.getTime() - 3600000).toISOString())
          .lte('date', new Date(apiDateObj.getTime() + 3600000).toISOString())
          .maybeSingle()
        existing = byDate
      }
      const venue = f.fixture?.venue?.name
      const city = f.fixture?.venue?.city

      if (!existing) {
        // Insert new fixture (e.g. R16 fixtures published by API)
        await supabase.from('fixtures').insert({
          tournament_id: 'wc_2026',
          round,
          home_team: homeTeam,
          away_team: awayTeam,
          date: apiDate,
          api_fixture_id: apiId,
          status: 'NS',
          venue: venue || null,
          city: city || null,
        })
        continue
      }

      const updates: Record<string, any> = {}
      if (existing.home_team !== homeTeam) updates.home_team = homeTeam
      if (existing.away_team !== awayTeam) updates.away_team = awayTeam
      if (!existing.api_fixture_id && apiId) updates.api_fixture_id = apiId
      if (venue) updates.venue = venue
      if (city) updates.city = city
      updates.date = apiDate

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
  // Include own goals — filter missed penalties and penalty shootout goals
  // Shootout penalties happen at elapsed > 120 or in 'penalties' period
  const goals = events
    .filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.comments !== 'Penalty Shootout')
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
  // Try today and tomorrow (UTC) to catch cross-midnight events
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const results: any[] = []
  for (const date of [today, tomorrow]) {
    const res = await fetch(
      `https://api.balldontlie.io/mma/v1/fights?date=${date}&per_page=100`,
      { headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY! } }
    )
    if (!res.ok) continue
    const data = await res.json()
    const fights = (data.data ?? []).filter((f: any) => ['in_progress', 'completed'].includes(f.status))
    results.push(...fights)
  }
  return results
}

async function handleMMATournament() {
  const liveFights = await fetchLiveMMAFights()
  if (!liveFights.length) return { live: 0, updated: 0 }

  let updated = 0

  for (const fight of liveFights) {
    const apiId = fight.id
    const apiStatus = fight.status
    const isFinished = apiStatus === 'completed'
    const isLive = apiStatus === 'in_progress'

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
  await fetch(`${appUrl}/api/mma/score`, {
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

  // Odds are deliberately NOT refreshed once a fixture goes live — they lock at kickoff.
  // This used to poll api-football's in-play odds endpoint on every tick while a match
  // was live, but the odds shown in the UI should reflect the price at kickoff, not
  // shift underneath the user mid-match. The pre-match crons (/api/odds, /api/nfl/odds,
  // /api/ncaaf/odds) already only touch status='NS' fixtures, so odds_home/draw/away
  // naturally stop changing the moment status flips to 'live' now that this is gone —
  // matching closing_odds_* (see 20260821220000_closing_odds_snapshot.sql), which
  // freezes the same value explicitly for the stats page.

  try {
    // Get all active tournaments that have live or upcoming fixtures today
    const { data: activeTournaments } = await supabase
      .from('tournaments')
      .select('id, sport')
      .eq('status', 'active')

    if (!activeTournaments?.length) {
      return NextResponse.json({ message: 'No active tournaments' })
    }

    const results: Record<string, any> = {}

    for (const tournament of activeTournaments) {
      // ── Soccer tournaments ───────────────────────────────────────────
      if (tournament.sport === 'mma' || tournament.id.startsWith('ufc_') || tournament.id.startsWith('f1_')) continue
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
          .select('id, home_team, away_team, home_score, away_score, first_scorer_name, status, round, odds_home, odds_draw, odds_away, closing_odds_home')
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

        // Determine penalty winner if match went to shootout — only when FT
        let penaltyWinner: string | null = null
        if (status === 'FT') {
          const penScore = apiFixture.score?.penalty
          if (penScore?.home != null && penScore?.away != null && (penScore.home > 0 || penScore.away > 0)) {
            penaltyWinner = penScore.home > penScore.away ? ourFixture.home_team : ourFixture.away_team
          }
        }

        // Freeze whatever odds are on the fixture right now as the closing line, the
        // instant it first goes live — refreshLiveOdds() above only touches fixtures
        // already status='live', so on this exact transition odds_home/draw/away are
        // still whatever was last fetched pre-match, not yet overwritten by in-play odds.
        const closingOddsUpdate = status === 'live' && ourFixture.status !== 'live' && ourFixture.closing_odds_home == null
          ? { closing_odds_home: ourFixture.odds_home, closing_odds_draw: ourFixture.odds_draw, closing_odds_away: ourFixture.odds_away }
          : {}

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
            ...closingOddsUpdate,
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
