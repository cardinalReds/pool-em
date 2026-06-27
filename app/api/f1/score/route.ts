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
  time: string | null // "DNF" literal when retired, otherwise a time/gap string
  laps: number
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
  })).filter(r => r.driver_id && r.position) // drop unclassified/withdrawn rows with no position
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
  return normalizeDriver(pick) === normalizeDriver(actual)
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

// Returns points earned for a single predictions_v2 row given a session's
// driver classification. Picks are stored in value_text (driver name) or
// value_yesno, matching the input_type values seeded in ruleset_categories.
function scoreF1Prediction(categoryId: string, pred: any, results: DriverResult[], rule: PoolRule): number {
  const finishers = results.filter(r => r.time !== 'DNF').sort((a, b) => a.position - b.position)
  const dnfs = results.filter(r => r.time === 'DNF').sort((a, b) => b.laps - a.laps) // most laps = retired latest
  const winner = finishers[0]?.driver_name
  const podium = finishers.slice(0, 3).map(r => r.driver_name)
  const pointsFinishers = finishers.slice(0, 10).map(r => r.driver_name)
  const poleSitter = results.find(r => r.grid === '1')?.driver_name // grid pos 1 = pole, from the RACE session's grid field
  const firstRetirement = dnfs[0]?.driver_name // first car out = fewest laps among DNFs... actually highest laps means retired last
  // NOTE: dnfs sorted descending by laps puts the car that went furthest first;
  // the FIRST retirement is the one with the FEWEST laps completed.
  const firstRetirementCorrected = [...dnfs].sort((a, b) => a.laps - b.laps)[0]?.driver_name

  switch (categoryId) {
    case 'f1_race_winner':
      return driverMatches(pred.value_text, winner) ? rule.points : 0

    case 'f1_podium':
      return podium.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0

    case 'f1_points_finish':
      return pointsFinishers.some(name => driverMatches(pred.value_text, name)) ? rule.points : 0

    case 'f1_fastest_lap': {
      // Fastest lap isn't in the rankings/races payload reliably for every driver row;
      // it comes from the session's own fastest_lap.driver field (see /races endpoint).
      // This is intentionally left as a TODO — see note below.
      return 0
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
        ;(rulesData || []).forEach((r: any) => { ruleMap[r.category_id] = r })

        const { data: preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', session.id) // f1_sessions.id doubles as the "fixture" reference for predictions_v2

        for (const pred of preds || []) {
          const rule = ruleMap[pred.category_id]
          if (!rule) continue

          const points = scoreF1Prediction(pred.category_id, pred, results, rule)
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
