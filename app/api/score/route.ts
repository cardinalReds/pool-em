import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY!
const WC_LEAGUE_ID = 1
const WC_SEASON = 2026

async function fetchLiveAndFinished() {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&status=FT`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  return data.response || []
}

async function fetchFirstScorer(fixtureId: number) {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}&type=Goal`,
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  )
  const data = await res.json()
  const events = data.response || []
  // First goal scorer
  const firstGoal = events.sort((a: any, b: any) => a.time.elapsed - b.time.elapsed)[0]
  return firstGoal?.player?.name || null
}

function scoreResult(homeScore: number, awayScore: number): 'home' | 'away' | 'draw' {
  if (homeScore > awayScore) return 'home'
  if (homeScore < awayScore) return 'away'
  return 'draw'
}

export async function POST(request: NextRequest) {
  // Verify this is called from our cron or admin
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const finishedMatches = await fetchLiveAndFinished()
    let scored = 0

    for (const match of finishedMatches) {
      const fixtureId = match.fixture.id
      const homeScore = match.goals.home
      const awayScore = match.goals.away

      if (homeScore === null || awayScore === null) continue

      // Check if already scored
      const { data: existing } = await supabase
        .from('fixtures')
        .select('scored')
        .eq('id', fixtureId)
        .single()

      if (existing?.scored) continue

      // Get first scorer
      const firstScorerName = await fetchFirstScorer(fixtureId)
      const actualResult = scoreResult(homeScore, awayScore)

      // Update fixture
      await supabase.from('fixtures').upsert({
        id: fixtureId,
        status: 'FT',
        home_score: homeScore,
        away_score: awayScore,
        first_scorer_name: firstScorerName,
        scored: true,
        tournament_id: 'wc_2026',
      }, { onConflict: 'id' })

      // Get all pools using this tournament
      const { data: pools } = await supabase
        .from('pools')
        .select('id, package_id')
        .eq('tournament_id', 'wc_2026')

      for (const pool of pools || []) {
        // Get predictions for this fixture in this pool
        const { data: predictions } = await supabase
          .from('predictions')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', fixtureId)

        for (const pred of predictions || []) {
          let points = 0

          // Score based on package
          if (pool.package_id === 'WLD' || pool.package_id === 'WLD_1TS') {
            if (pred.predicted_result === actualResult) points += 1
          }
          if (pool.package_id === 'WLD_1TS' || pool.package_id === 'EXACT_1TS') {
            if (firstScorerName && pred.predicted_first_scorer_name &&
                pred.predicted_first_scorer_name.toLowerCase().trim() ===
                firstScorerName.toLowerCase().trim()) {
              points += 3
            }
          }
          if (pool.package_id === 'EXACT_SCORE' || pool.package_id === 'EXACT_1TS') {
            if (pred.predicted_home_score === homeScore &&
                pred.predicted_away_score === awayScore) {
              points += 3
            } else if (pred.predicted_result === actualResult) {
              points += 1
            }
          }

          await supabase
            .from('predictions')
            .update({ points_earned: points })
            .eq('id', pred.id)
        }

        scored++
      }
    }

    return NextResponse.json({ ok: true, fixtures_scored: scored })
  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Also allow GET for manual trigger during development
export async function GET(request: NextRequest) {
  return POST(request)
}
