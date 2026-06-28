import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── F1 2026 scoring route ────────────────────────────────────────────────
// Mirrors the structure/conventions of /api/score (auth, predictions_v2,
// pool_rules), but is a separate route rather than a branch inside
// /api/score/route.ts, because that route is hardcoded end-to-end to
// tournament_id = 'wc_2026' (its early-exit query, fixture fetch, and pools
// query all assume a single soccer tournament). F1 also has no `fixtures`
// row to hang off of — see f1_sessions instead.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY! // same key covers all API-Sports products, incl. F1
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

async function fetchRankings(apiSessionId: number): Promise<DriverResult[]> {
  const res = await fetch(`${F1_BASE}/rankings/races?race=${apiSessionId}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return []
  const data = await res.json()
  const rows: any[] = data.response || []
  return rows.map(r => ({
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
  })).filter(r => r.driver_id && r.position)
}

async function fetchFastestLap(apiSessionId: number): Promise<string | null> {
  const res = await fetch(`${F1_BASE}/rankings/fastestlaps?race=${apiSessionId}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) return null
  const data = await res.json()
  // Position 1 in fastestlaps = the driver who set the fastest lap
  const top = data.response?.[0]
  return top?.driver?.name ?? null
}

// Normalizes a driver name for loose matching against picks, same spirit as
// the accent/initial stripping already used for soccer_first_goalscorer.
function normalizeDriver(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}

function driverMatches(pick: string | null, actual: string | null | undefined): boolean {
  if (!pick || !actual) return false
  const normPick = normalizeDriver(pick)
  const normActual = normalizeDriver(actual)
  if (normPick === normActual) return true
  // Partial match: pick is contained in actual name or vice versa
  // e.g. "Kimi Antonelli" matches "Andrea Kimi Antonelli"
  if (normActual.includes(normPick) || normPick.includes(normActual)) return true
  // Last name match: last word of pick matches last word of actual
  const pickLast = normPick.split(' ').pop() || ''
  const actualLast = normActual.split(' ').pop() || ''
  if (pickLast.length > 3 && pickLast === actualLast) return true
  return false
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

// Returns points earned for a single predictions_v2 row given a session's
// driver classification. Picks are stored in value_text (driver name) or
// value_yesno, matching the input_type values seeded in ruleset_categories.
function scoreF1Prediction(categoryId: string, pred: any, results: DriverResult[], rule: PoolRule, fastestLapDriver?: string | null): number {
  // Sort by position — all classified finishers
  const sorted = [...results].sort((a, b) => a.position - b.position)
  const retirements = sorted.filter(r => r.time === 'DNF').sort((a, b) => a.laps - b.laps)
  const finishers = sorted.filter(r => r.time !== 'DNF')
  const winner = finishers[0]?.driver_name
  const podium = finishers.slice(0, 3).map(r => r.driver_name)
  const pointsFinishers = finishers.slice(0, 10).map(r => r.driver_name)
  const poleSitter = results.find(r => r.grid === '1')?.driver_name
  const firstRetirementCorrected = retirements[0]?.driver_name

  switch (categoryId) {
    case 'f1_race_winner':
      return driverMatches(pred.value_text, winner) ? rule.points : 0

    case 'f1_podium':
      return podium.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0

    case 'f1_points_finish':
      return pointsFinishers.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0

    case 'f1_fastest_lap': {
      if (!fastestLapDriver || !pred.value_text) return 0
      return driverMatches(pred.value_text, fastestLapDriver) ? rule.points : 0
    }

    case 'f1_first_retirement':
      return driverMatches(pred.value_text, firstRetirementCorrected) ? rule.points : 0

    case 'f1_pole_to_win':
      return (pred.value_yesno === (poleSitter === winner)) ? rule.points : 0

    case 'f1_pole_position':
      return driverMatches(pred.value_text, poleSitter) ? rule.points : 0

    case 'f1_top3_quali': {
      // Scored against a QUALIFYING session's results, not the race's — caller
      // passes the right `results` array depending on which session this is.
      const top3 = results.filter(r => r.position <= 3).map(r => r.driver_name)
      return top3.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0
    }

    case 'f1_q1_eliminated': {
      // API-Sports doesn't expose Q1/Q2/Q3 elimination splits directly in this
      // payload — would need the '1st/2nd/3rd Qualifying' session ids combined.
      // Left unscored for now; see note below.
      return 0
    }

    case 'f1_podium_order_1':
    case 'f1_podium_order_2':
    case 'f1_podium_order_3': {
      const pos = parseInt(categoryId.slice(-1)) // 1, 2, or 3
      const actualAtPos = finishers[pos - 1]?.driver_name
      const pick = pred.value_text
      if (!pick || !actualAtPos) return 0
      if (driverMatches(pick, actualAtPos)) return rule.points // exact position
      // Partial credit: correct driver but wrong position
      const onPodium = podium.some(name => driverMatches(pick, name))
      return onPodium ? (rule.bonus_points || 0) : 0
    }

    case 'f1_sprint_winner': {
      const sprintWinner = finishers[0]?.driver_name
      return driverMatches(pred.value_text, sprintWinner) ? rule.points : 0
    }

    case 'f1_sprint_podium': {
      const sprintPodium = finishers.slice(0, 3).map(r => r.driver_name)
      return sprintPodium.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0
    }

    // f1_top6_teammate: storage shape not finalized (needs two driver slots,
    // not one value_text) — see note below. Not scored yet.
    case 'f1_top6_teammate':
      return 0

    default:
      return 0
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Early exit: only do work if there's an unscored, completed session
    const { data: pendingSessions } = await supabase
      .from('f1_sessions')
      .select('id, api_session_id:id, session_type, competition_id')
      .eq('tournament_id', TOURNAMENT_ID)
      .eq('status', 'Completed')
      .eq('scored', false)
      .limit(20)

    if (!pendingSessions?.length) {
      return NextResponse.json({ ok: true, sessions_scored: 0, skipped: true })
    }

    let sessionsScored = 0

    for (const session of pendingSessions) {
      const results = await fetchRankings(session.id)
      if (!results.length) continue // results not published by the API yet

      // Fetch fastest lap driver separately
      const fastestLapDriver = session.session_type === 'Race' || session.session_type === 'Sprint'
        ? await fetchFastestLap(session.id)
        : null

      await supabase.from('f1_sessions').update({ results }).eq('id', session.id)

      // Get all pools running this tournament
      const { data: pools } = await supabase
        .from('pools')
        .select('id')
        .eq('tournament_id', TOURNAMENT_ID)

      for (const pool of pools || []) {
        const { data: rulesData } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points')
          .eq('pool_id', pool.id)

        const ruleMap: Record<string, PoolRule> = {}
        ;(rulesData || []).forEach((r: any) => {
          ruleMap[r.category_id] = r
          // Map podium_order_1/2/3 to the parent podium_order rule
          if (r.category_id === 'f1_podium_order') {
            ruleMap['f1_podium_order_1'] = r
            ruleMap['f1_podium_order_2'] = r
            ruleMap['f1_podium_order_3'] = r
          }
        })

        const { data: preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', session.id) // f1_sessions.id doubles as the "fixture" reference for predictions_v2

        for (const pred of preds || []) {
          const rule = ruleMap[pred.category_id]
          if (!rule) continue

          const points = scoreF1Prediction(pred.category_id, pred, results, rule, fastestLapDriver)
          await supabase
            .from('predictions_v2')
            .update({ points_earned: points, is_correct: points > 0 })
            .eq('id', pred.id)
        }
      }

      await supabase.from('f1_sessions').update({ scored: true }).eq('id', session.id)
      sessionsScored++
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
