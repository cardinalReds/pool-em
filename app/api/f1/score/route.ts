import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const F1_BASE = 'https://v1.formula-1.api-sports.io'
const TOURNAMENT_ID = 'f1_2026'

interface DriverResult {
  driver_id: number
  driver_name: string
  abbr: string | null
  team_id: number
  team_name: string
  position: number
  grid: string | null
  time: string | null
  laps: number
  gap: string | null
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

async function fetchRankings(apiSessionId: number): Promise<DriverResult[]> {
  const res = await fetch(`${F1_BASE}/rankings/races?race=${apiSessionId}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.response || []).map((r: any) => ({
    driver_id: r.driver?.id,
    driver_name: r.driver?.name,
    abbr: r.driver?.abbr ?? null,
    team_id: r.team?.id,
    team_name: r.team?.name,
    position: r.position,
    grid: r.grid ?? null,
    time: r.time ?? null,
    laps: r.laps ?? 0,
    gap: r.gap ?? null,
  })).filter((r: DriverResult) => r.driver_id && r.position)
}

async function fetchFastestLap(apiSessionId: number): Promise<string | null> {
  const res = await fetch(`${F1_BASE}/rankings/fastestlaps?race=${apiSessionId}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.response?.[0]?.driver?.name ?? null
}

function normalizeDriver(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function driverMatches(pick: string | null, actual: string | null | undefined): boolean {
  if (!pick || !actual) return false
  const normPick = normalizeDriver(pick)
  const normActual = normalizeDriver(actual)
  if (normPick === normActual) return true
  if (normActual.includes(normPick) || normPick.includes(normActual)) return true
  const pickLast = normPick.split(' ').pop() || ''
  const actualLast = normActual.split(' ').pop() || ''
  if (pickLast.length > 3 && pickLast === actualLast) return true
  return false
}

function scoreF1Prediction(categoryId: string, pred: any, results: DriverResult[], rule: PoolRule, fastestLapDriver?: string | null): number {
  const sorted = [...results].sort((a, b) => a.position - b.position)
  const retirements = sorted.filter(r => r.time === 'DNF').sort((a, b) => a.laps - b.laps)
  const finishers = sorted.filter(r => r.time !== 'DNF')
  const winner = finishers[0]?.driver_name
  const podium = finishers.slice(0, 3).map(r => r.driver_name)
  const pointsFinishers = finishers.slice(0, 10).map(r => r.driver_name)
  const poleSitter = results.find(r => r.grid === '1')?.driver_name ?? finishers[0]?.driver_name
  const firstRetirement = retirements[0]?.driver_name

  switch (categoryId) {
    case 'f1_race_winner':
      return driverMatches(pred.value_text, winner) ? rule.points : 0
    case 'f1_podium':
      return podium.some(n => driverMatches(pred.value_text, n)) ? rule.points : 0
    case 'f1_points_finish':
      return pointsFinishers.some(n => driverMatches(pred.value_text, n)) ? rule.points : 0
    case 'f1_fastest_lap':
      return fastestLapDriver && driverMatches(pred.value_text, fastestLapDriver) ? rule.points : 0
    case 'f1_first_retirement':
      return driverMatches(pred.value_text, firstRetirement) ? rule.points : 0
    case 'f1_pole_to_win':
      return (pred.value_yesno === (poleSitter === winner)) ? rule.points : 0
    case 'f1_pole_position':
      return driverMatches(pred.value_text, poleSitter) ? rule.points : 0
    case 'f1_top3_quali': {
      const top3 = results.filter(r => r.position <= 3).map(r => r.driver_name)
      return top3.some(n => driverMatches(pred.value_text, n)) ? rule.points : 0
    }
    case 'f1_q1_eliminated': {
      // Score using 1st qualifying results — position > 15 means eliminated in Q1
      const q1Eliminated = results.filter(r => r.position > 15).map(r => r.driver_name)
      return q1Eliminated.some(n => driverMatches(pred.value_text, n)) ? rule.points : 0
    }
    case 'f1_q3_qualifier': {
      // Score using 2nd qualifying results — position <= 10 made it to Q3
      const q3Drivers = results.filter(r => r.position <= 10).map(r => r.driver_name)
      return q3Drivers.some(n => driverMatches(pred.value_text, n)) ? rule.points : 0
    }
    case 'f1_first_pit_lap':
      return 0 // handled separately via closest-wins logic below
    case 'f1_teammate_battle': {
      if (!pred.value_text) return 0
      const pickedDriver = results.find(r => driverMatches(pred.value_text, r.driver_name))
      if (!pickedDriver) return 0
      const teammate = results.find(r => r.team_id === pickedDriver.team_id && r.driver_id !== pickedDriver.driver_id)
      if (!teammate) return 0
      return pickedDriver.position < teammate.position ? rule.points : 0
    }
    case 'f1_podium_order_1':
    case 'f1_podium_order_2':
    case 'f1_podium_order_3': {
      const pos = parseInt(categoryId.slice(-1))
      const actualAtPos = finishers[pos - 1]?.driver_name
      if (!pred.value_text || !actualAtPos) return 0
      if (driverMatches(pred.value_text, actualAtPos)) return rule.points
      return podium.some(n => driverMatches(pred.value_text, n)) ? (rule.bonus_points || 0) : 0
    }
    case 'f1_sprint_winner':
      return driverMatches(pred.value_text, finishers[0]?.driver_name) ? rule.points : 0
    case 'f1_sprint_podium':
      return finishers.slice(0, 3).some(r => driverMatches(pred.value_text, r.driver_name)) ? rule.points : 0
    case 'f1_top6_teammate':
      return 0
    default:
      return 0
  }
}

// Maps a completed sub-session type to:
// - parentSessionTypes: which session holds the user's predictions (fixture_id)
// - categoriesToScore: which category_ids to score from this sub-session's results
const SESSION_SCORING_MAP: Record<string, { parentTypes: string[], categories: string[] }> = {
  '1st Qualifying':       { parentTypes: ['3rd Qualifying'],       categories: ['f1_q1_eliminated'] },
  '1st Sprint Shootout':  { parentTypes: ['3rd Sprint Shootout'],  categories: ['f1_q1_eliminated'] },
  '2nd Qualifying':       { parentTypes: ['3rd Qualifying'],       categories: ['f1_q3_qualifier'] },
  '2nd Sprint Shootout':  { parentTypes: ['3rd Sprint Shootout'],  categories: ['f1_q3_qualifier'] },
  '3rd Qualifying':       { parentTypes: ['3rd Qualifying'],       categories: ['f1_pole_position', 'f1_top3_quali'] },
  '3rd Sprint Shootout':  { parentTypes: ['3rd Sprint Shootout'],  categories: ['f1_pole_position', 'f1_top3_quali'] },
  'Race':                 { parentTypes: ['Race'],                  categories: ['f1_race_winner', 'f1_podium', 'f1_podium_order_1', 'f1_podium_order_2', 'f1_podium_order_3', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_first_pit_lap', 'f1_teammate_battle'] },
  'Sprint':               { parentTypes: ['Sprint'],                categories: ['f1_sprint_winner', 'f1_sprint_podium', 'f1_first_pit_lap', 'f1_teammate_battle'] },
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: completedSessions } = await supabase
      .from('f1_sessions')
      .select('id, session_type, competition_id, season, status, scored')
      .eq('tournament_id', TOURNAMENT_ID)
      .eq('status', 'Completed')
      .eq('scored', false)
      .limit(20)

    const { data: liveSessions } = await supabase
      .from('f1_sessions')
      .select('id, session_type, competition_id, season, status, scored')
      .eq('tournament_id', TOURNAMENT_ID)
      .eq('status', 'In Progress')
      .limit(5)

    const pendingSessions = [...(completedSessions || []), ...(liveSessions || [])]

    if (!pendingSessions.length) {
      return NextResponse.json({ ok: true, sessions_scored: 0, skipped: true })
    }

    let sessionsScored = 0

    for (const session of pendingSessions) {
      const mapping = SESSION_SCORING_MAP[session.session_type]
      if (!mapping) {
        // Unknown session type — just mark scored and move on
        await supabase.from('f1_sessions').update({ scored: true }).eq('id', session.id)
        continue
      }

      const results = await fetchRankings(session.id)
      if (!results.length) continue // API results not published yet

      // Store results on the sub-session
      const fastestLapDriver = (session.session_type === 'Race' || session.session_type === 'Sprint')
        ? await fetchFastestLap(session.id)
        : null
      await supabase.from('f1_sessions').update({
        results: [...results, { fastest_lap_driver: fastestLapDriver }],
      }).eq('id', session.id)

      // Find the parent session(s) that hold user predictions for this competition
      const { data: parentSessions } = await supabase
        .from('f1_sessions')
        .select('id, results')
        .eq('tournament_id', TOURNAMENT_ID)
        .eq('competition_id', session.competition_id)
        .eq('season', session.season)
        .in('session_type', mapping.parentTypes)

      if (!parentSessions?.length) {
        await supabase.from('f1_sessions').update({ scored: true }).eq('id', session.id)
        continue
      }

      // Store sub-session metadata in parent session for UI display
      for (const parent of parentSessions) {
        const existingResults: any[] = Array.isArray(parent.results) ? parent.results : []
        const driverRows = existingResults.filter((r: any) => r.driver_id)
        const metaRows = existingResults.filter((r: any) => !r.driver_id)

        if (session.session_type === '1st Qualifying' || session.session_type === '1st Sprint Shootout') {
          const q1Eliminated = results.filter(r => r.position > 15).map(r => r.driver_name)
          const newMeta = [...metaRows.filter((m: any) => !m.q1_eliminated), { q1_eliminated: q1Eliminated }]
          await supabase.from('f1_sessions').update({ results: [...driverRows, ...newMeta] }).eq('id', parent.id)
        } else if (session.session_type === '2nd Qualifying' || session.session_type === '2nd Sprint Shootout') {
          const q3Qualifiers = results.filter(r => r.position <= 10).map(r => r.driver_name)
          const newMeta = [...metaRows.filter((m: any) => !m.q3_qualifiers), { q3_qualifiers: q3Qualifiers }]
          await supabase.from('f1_sessions').update({ results: [...driverRows, ...newMeta] }).eq('id', parent.id)
        }
      }

      const { data: pools } = await supabase.from('pools').select('id').eq('tournament_id', TOURNAMENT_ID)

      for (const pool of pools || []) {
        const { data: rulesData } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points')
          .eq('pool_id', pool.id)

        const ruleMap: Record<string, PoolRule> = {}
        ;(rulesData || []).forEach((r: any) => {
          ruleMap[r.category_id] = r
          if (r.category_id === 'f1_podium_order') {
            ruleMap['f1_podium_order_1'] = r
            ruleMap['f1_podium_order_2'] = r
            ruleMap['f1_podium_order_3'] = r
          }
        })

        for (const parent of parentSessions) {
          // Fetch only the predictions for categories this sub-session scores
          const { data: preds } = await supabase
            .from('predictions_v2')
            .select('*')
            .eq('pool_id', pool.id)
            .eq('fixture_id', parent.id)
            .in('category_id', mapping.categories)

          for (const pred of preds || []) {
            const rule = ruleMap[pred.category_id]
            if (!rule) continue
            const points = scoreF1Prediction(pred.category_id, pred, results, rule, fastestLapDriver)
            await supabase.from('predictions_v2')
              .update({ points_earned: points, is_correct: points > 0 })
              .eq('id', pred.id)
          }

          // Closest-wins pit stop scoring
          const pitRule = ruleMap['f1_first_pit_lap']
          if (pitRule && mapping.categories.includes('f1_first_pit_lap')) {
            const pitRes = await fetch(`${F1_BASE}/pitstops?race=${session.id}`, {
              headers: { 'x-apisports-key': API_KEY },
            })
            if (pitRes.ok) {
              const pitData = await pitRes.json()
              const pits: any[] = pitData.response || []
              if (pits.length > 0) {
                const firstPitLap = Math.min(...pits.map((p: any) => p.lap || 999))
                // Store first pit lap in session results for UI display
                await supabase.from('f1_sessions').update({
                  results: [...results, { fastest_lap_driver: fastestLapDriver, first_pit_lap: firstPitLap }],
                }).eq('id', session.id)
                const { data: pitPreds } = await supabase
                  .from('predictions_v2')
                  .select('*')
                  .eq('pool_id', pool.id)
                  .eq('fixture_id', parent.id)
                  .eq('category_id', 'f1_first_pit_lap')
                if (pitPreds?.length) {
                  const minDiff = Math.min(...pitPreds.map((p: any) => Math.abs((p.value_number || 0) - firstPitLap)))
                  for (const p of pitPreds) {
                    const diff = Math.abs((p.value_number || 0) - firstPitLap)
                    const pts = diff === minDiff ? pitRule.points : 0
                    await supabase.from('predictions_v2')
                      .update({ points_earned: pts, is_correct: pts > 0 })
                      .eq('id', p.id)
                  }
                }
              }
            }
          }
        }
      }

      // Only mark as fully scored when Completed — keep rescoring while In Progress
      if (session.status === 'Completed') {
        await supabase.from('f1_sessions').update({ scored: true }).eq('id', session.id)
        sessionsScored++
      }
    }

    return NextResponse.json({ ok: true, sessions_scored: sessionsScored })
  } catch (err) {
    console.error('F1 scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
