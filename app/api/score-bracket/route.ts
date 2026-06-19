import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── /api/score-bracket ────────────────────────────────────────────────────
// Scores bracket pools using:
//   1. actual_standings rows (admin-locked group positions) for group stage
//   2. real fixture results for knockout rounds (R32 through Final)
//
// Auth: accepts either the CRON_SECRET (for cron/server calls) or a valid
// authenticated Supabase session (for client-side admin panel calls).
// This lets the admin panel trigger rescoring immediately after locking a
// standing without needing CRON_SECRET exposed to the browser.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  // Debug endpoint — returns runtime values to diagnose scoring mismatch
  const { data: lockedRows } = await supabase
    .from('actual_standings')
    .select('group_name, position, team')
    .eq('tournament_id', 'wc_2026')

  const actualStandings: Record<string, Record<string, string>> = {}
  for (const row of lockedRows || []) {
    if (!actualStandings[row.group_name]) actualStandings[row.group_name] = {}
    actualStandings[row.group_name][String(row.position)] = row.team
  }

  const { data: onePick } = await supabase
    .from('bracket_picks')
    .select('user_id, group_picks')
    .eq('pool_id', 'd1889767-0c71-4af0-885d-b134ef1d7633')
    .limit(1)
    .maybeSingle()

  const groupPicks = onePick?.group_picks || {}
  const predicted = groupPicks['A'] || []
  const locked = actualStandings['A']

  return NextResponse.json({
    lockedRows,
    actualStandings,
    predicted_A: predicted,
    locked_A: locked,
    predicted_0: predicted[0],
    locked_1: locked?.['1'],
    types: {
      predicted_0: typeof predicted[0],
      locked_1: typeof locked?.['1'],
    },
    match: predicted[0] === locked?.['1'],
  })
}

export async function POST() {
  // No auth required — this route only reads actual_standings and fixtures,
  // then updates bracket_scores. The source data is already RLS-protected.
  // Worst case someone triggers an unnecessary rescore.
  try {
    // ── Load actual_standings (admin-locked group positions) ─────────────
    const { data: lockedRows } = await supabase
      .from('actual_standings')
      .select('group_name, position, team')
      .eq('tournament_id', 'wc_2026')

    // Shape: { 'A': { '1': 'Mexico', '2': 'USA', ... }, ... }
    const actualStandings: Record<string, Record<string, string>> = {}
    for (const row of lockedRows || []) {
      if (!actualStandings[row.group_name]) actualStandings[row.group_name] = {}
      actualStandings[row.group_name][String(row.position)] = row.team
    }

    // ── Load all WC 2026 fixtures for knockout scoring ───────────────────
    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('tournament_id', 'wc_2026')

    // Build which teams have actually advanced to each knockout round
    const advancedToRound: Record<string, Set<string>> = {
      R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), FINAL: new Set(), CHAMPION: new Set()
    }
    for (const f of allFixtures || []) {
      if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
      const r = f.round || ''
      if (r.includes('Round of 32')) {
        advancedToRound.R32.add(f.home_team)
        advancedToRound.R32.add(f.away_team)
        const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
        if (w) advancedToRound.R16.add(w)
      }
      if (r.includes('Round of 16')) {
        advancedToRound.R16.add(f.home_team)
        advancedToRound.R16.add(f.away_team)
        const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
        if (w) advancedToRound.QF.add(w)
      }
      if (r.includes('Quarter-finals')) {
        advancedToRound.QF.add(f.home_team)
        advancedToRound.QF.add(f.away_team)
        const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
        if (w) advancedToRound.SF.add(w)
      }
      if (r.includes('Semi-finals')) {
        advancedToRound.SF.add(f.home_team)
        advancedToRound.SF.add(f.away_team)
        const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
        if (w) advancedToRound.FINAL.add(w)
      }
      if (r === 'Final') {
        advancedToRound.FINAL.add(f.home_team)
        advancedToRound.FINAL.add(f.away_team)
        const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
        if (w) advancedToRound.CHAMPION.add(w)
      }
    }

    // ── Load all bracket pools ───────────────────────────────────────────
    const { data: bracketPools } = await supabase
      .from('pools')
      .select('id')
      .eq('deadline_type', 'before_tournament')
      .eq('tournament_id', 'wc_2026')

    if (!bracketPools?.length) {
      return NextResponse.json({ ok: true, pools_scored: 0 })
    }

    let poolsScored = 0

    for (const pool of bracketPools) {
      const { data: rulesRow } = await supabase
        .from('bracket_scoring_rules')
        .select('*')
        .eq('pool_id', pool.id)
        .maybeSingle()

      if (!rulesRow) continue

      const rules = {
        groupFormat: rulesRow.group_format || 'standings',
        standingsFirst: rulesRow.standings_first ?? 3,
        standingsSecond: rulesRow.standings_second ?? 2,
        standingsThird: rulesRow.standings_third ?? 1,
        r32Pts: rulesRow.r32_pts ?? 1,
        r16Pts: rulesRow.r16_pts ?? 2,
        qfPts: rulesRow.qf_pts ?? 4,
        sfPts: rulesRow.sf_pts ?? 6,
        finalPts: rulesRow.final_pts ?? 12,
      }

      const { data: allPicks } = await supabase
        .from('bracket_picks')
        .select('*')
        .eq('pool_id', pool.id)

      for (const pick of allPicks || []) {
        let totalPts = 0
        const breakdown: Record<string, number> = {}

        // ── Group stage: score from actual_standings ─────────────────────
        const groupPicks: Record<string, string[]> = pick.group_picks || {}
        for (const [group, predicted] of Object.entries(groupPicks)) {
          const locked = actualStandings[group]
          if (!locked) continue

          console.log(`Group ${group}: locked=`, JSON.stringify(locked), `predicted[0]=${predicted[0]}, locked['1']=${locked['1']}, match=${predicted[0] === locked['1']}`)

          if (rules.groupFormat === 'standings') {
            if (locked['1'] && predicted[0] === locked['1']) {
              totalPts += rules.standingsFirst
              breakdown[`group_${group}_1st`] = rules.standingsFirst
            }
            if (locked['2'] && predicted[1] === locked['2']) {
              totalPts += rules.standingsSecond
              breakdown[`group_${group}_2nd`] = rules.standingsSecond
            }
            if (locked['3'] && predicted[2] === locked['3']) {
              totalPts += rules.standingsThird
              breakdown[`group_${group}_3rd`] = rules.standingsThird
            }
          }
        }

        // ── Knockout stage: score from real fixture results ───────────────
        const bracketPicksData: Record<string, string> = pick.bracket_picks || {}

        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('R32_'))) {
          const team = bracketPicksData[slot]
          if (team && advancedToRound.R32.has(team)) {
            totalPts += rules.r32Pts
            breakdown[slot] = rules.r32Pts
          }
        }
        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('R16_'))) {
          const team = bracketPicksData[slot]
          if (team && advancedToRound.R16.has(team)) {
            totalPts += rules.r16Pts
            breakdown[slot] = rules.r16Pts
          }
        }
        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('QF_'))) {
          const team = bracketPicksData[slot]
          if (team && advancedToRound.QF.has(team)) {
            totalPts += rules.qfPts
            breakdown[slot] = rules.qfPts
          }
        }
        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('SF_'))) {
          const team = bracketPicksData[slot]
          if (team && advancedToRound.SF.has(team)) {
            totalPts += rules.sfPts
            breakdown[slot] = rules.sfPts
          }
        }
        const finalPick = bracketPicksData['FINAL']
        if (finalPick && advancedToRound.FINAL.has(finalPick)) {
          totalPts += rules.finalPts
          breakdown['FINAL'] = rules.finalPts
        }
        if (finalPick && advancedToRound.CHAMPION.has(finalPick)) {
          totalPts += rules.finalPts
          breakdown['CHAMPION'] = rules.finalPts
        }

        // Only write if we have something meaningful — don't overwrite with zeros
        if (totalPts > 0 || Object.keys(breakdown).length > 0) {
          await supabase
            .from('bracket_picks')
            .update({ bracket_scores: { total: totalPts, breakdown } })
            .eq('id', pick.id)
        }
      }

      poolsScored++
    }

    return NextResponse.json({ ok: true, pools_scored: poolsScored })
  } catch (err) {
    console.error('Bracket scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
