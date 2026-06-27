import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateR32FromGroupPicks } from '@/lib/bracketEngine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Build a GroupPicks object from actual_standings rows
// so we can run generateR32FromGroupPicks on the real results
function buildActualGroupPicks(
  lockedRows: { group_name: string; position: number; team: string; advances: boolean }[]
): Record<string, string[]> {
  const picks: Record<string, string[]> = {}
  for (const row of lockedRows) {
    if (!picks[row.group_name]) picks[row.group_name] = ['', '', '', '']
    picks[row.group_name][row.position - 1] = row.team
  }
  return picks
}

// The 8 groups whose 3rd place team advances (marked with advances=true)
function buildBestThirdGroups(
  lockedRows: { group_name: string; position: number; advances: boolean }[]
): string[] {
  return lockedRows
    .filter(r => r.position === 3 && r.advances)
    .map(r => r.group_name)
}

// Build a flat set of all teams appearing in each round of the actual bracket
// R32: teams confirmed via actual fixture appearances (not bracket generation)
// This avoids the randomness problem in generateR32FromGroupPicks for partial data
function buildActualRoundSets(
  actualR32Bracket: Record<string, { home: string; away: string }>,
  fixtures: any[]
): Record<string, Set<string>> {
  const sets: Record<string, Set<string>> = {
    R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), FINAL: new Set(), CHAMPION: new Set()
  }

  // R32 participants: use actual fixture appearances first (most reliable)
  // Then supplement with the generated bracket for teams not yet confirmed in fixtures
  for (const f of fixtures) {
    if (f.status !== 'FT' && f.status !== 'live') continue
    const r = f.round || ''
    if (r.includes('Round of 32')) {
      if (f.home_team) sets.R32.add(f.home_team)
      if (f.away_team) sets.R32.add(f.away_team)
    }
  }

  // Also add teams from the generated bracket (1st and 2nd place teams are certain
  // once their group is locked — 3rd place teams are only added when advances=true)
  for (const { home, away } of Object.values(actualR32Bracket)) {
    if (home) sets.R32.add(home)
    if (away) sets.R32.add(away)
  }

  // R16 onward come from actual fixture results
  for (const f of fixtures) {
    if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
    const r = f.round || ''
    const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
    if (r.includes('Round of 32') && w) sets.R16.add(w)
    if (r.includes('Round of 16')) {
      sets.R16.add(f.home_team); sets.R16.add(f.away_team)
      if (w) sets.QF.add(w)
    }
    if (r.includes('Quarter-finals')) {
      sets.QF.add(f.home_team); sets.QF.add(f.away_team)
      if (w) sets.SF.add(w)
    }
    if (r.includes('Semi-finals')) {
      sets.SF.add(f.home_team); sets.SF.add(f.away_team)
      if (w) sets.FINAL.add(w)
    }
    if (r === 'Final') {
      sets.FINAL.add(f.home_team); sets.FINAL.add(f.away_team)
      if (w) sets.CHAMPION.add(w)
    }
  }

  return sets
}

export async function POST() {
  try {
    // ── Load actual_standings ────────────────────────────────────────────
    const { data: lockedRows } = await supabase
      .from('actual_standings')
      .select('group_name, position, team, advances')
      .eq('tournament_id', 'wc_2026')

    const rows = (lockedRows || []) as { group_name: string; position: number; team: string; advances: boolean }[]

    // Build actual group picks and best third groups from locked standings
    const actualGroupPicks = buildActualGroupPicks(rows)
    const actualBestThird = buildBestThirdGroups(rows)

    // Build the actual R32 bracket from locked standings (for user R32 slot comparison)
    const actualR32Bracket = Object.keys(actualGroupPicks).length > 0
      ? generateR32FromGroupPicks(actualGroupPicks as any, actualBestThird)
      : {}

    // Build the definitive set of actual R32 teams directly from actual_standings
    // — avoids the random shuffling bug in generateR32FromGroupPicks for 3rd place teams
    // 1st and 2nd place teams always qualify; 3rd place only if advances=true
    const actualR32TeamsFromStandings = new Set<string>()
    for (const row of rows) {
      if (row.position === 1 || row.position === 2) actualR32TeamsFromStandings.add(row.team)
      if (row.position === 3 && row.advances) actualR32TeamsFromStandings.add(row.team)
    }

    // Build flat standings map for group stage scoring
    const actualStandings: Record<string, Record<string, string>> = {}
    for (const row of rows) {
      if (!actualStandings[row.group_name]) actualStandings[row.group_name] = {}
      actualStandings[row.group_name][String(row.position)] = row.team
    }

    // ── Load fixtures for knockout round results ─────────────────────────
    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('round, home_team, away_team, home_score, away_score, status')
      .eq('tournament_id', 'wc_2026')

    const actualRounds = buildActualRoundSets(actualR32Bracket, allFixtures || [])
    // Override R32 with our definitive standings-based set (additive with fixture data)
    for (const team of actualR32TeamsFromStandings) actualRounds.R32.add(team)

    // ── Load bracket pools ───────────────────────────────────────────────
    const { data: bracketPools } = await supabase
      .from('pools')
      .select('id')
      .eq('deadline_type', 'before_tournament')
      .eq('tournament_id', 'wc_2026')

    if (!bracketPools?.length) return NextResponse.json({ ok: true, pools_scored: 0 })

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

        // ── Group stage ──────────────────────────────────────────────────
        const groupPicks: Record<string, string[]> = pick.group_picks || {}
        for (const [group, predicted] of Object.entries(groupPicks)) {
          const locked = actualStandings[group]
          if (!locked) continue

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

        // ── R32: award points for each team user predicted in R32 that actually made R32 ──
        // Build user's R32 teams directly from their group picks (avoid random shuffling)
        // 1st and 2nd place from each group always qualify
        // 3rd place teams qualify only if the user picked that group in their best_third_groups
        const userBestThird: string[] = pick.best_third_groups || []
        const userR32Teams = new Set<string>()
        for (const [group, predicted] of Object.entries(groupPicks)) {
          if (predicted[0]) userR32Teams.add(predicted[0]) // 1st always qualifies
          if (predicted[1]) userR32Teams.add(predicted[1]) // 2nd always qualifies
          if (predicted[2] && userBestThird.includes(group)) userR32Teams.add(predicted[2]) // 3rd only if user picked this group to advance
        }

        // Award R32 points for each team in user's R32 that actually made R32
        for (const team of userR32Teams) {
          if (actualRounds.R32.has(team)) {
            totalPts += rules.r32Pts
            breakdown[`R32_${team}`] = rules.r32Pts
          }
        }

        // ── R16 onward: user picks the WINNER of each match ─────────────
        // bracket_picks stores R16_1, R16_2 etc. as the predicted winner.
        // actualRounds.R16 is the set of teams that actually made R16.
        const bracketPicksData: Record<string, string> = pick.bracket_picks || {}

        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('R16_'))) {
          const team = bracketPicksData[slot]
          if (team && actualRounds.R16.has(team)) {
            totalPts += rules.r16Pts
            breakdown[slot] = rules.r16Pts
          }
        }
        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('QF_'))) {
          const team = bracketPicksData[slot]
          if (team && actualRounds.QF.has(team)) {
            totalPts += rules.qfPts
            breakdown[slot] = rules.qfPts
          }
        }
        for (const slot of Object.keys(bracketPicksData).filter(k => k.startsWith('SF_'))) {
          const team = bracketPicksData[slot]
          if (team && actualRounds.SF.has(team)) {
            totalPts += rules.sfPts
            breakdown[slot] = rules.sfPts
          }
        }
        const finalPick = bracketPicksData['FINAL']
        if (finalPick && actualRounds.FINAL.has(finalPick)) {
          totalPts += rules.finalPts
          breakdown['FINAL'] = rules.finalPts
        }
        if (finalPick && actualRounds.CHAMPION.has(finalPick)) {
          totalPts += rules.finalPts
          breakdown['CHAMPION'] = rules.finalPts
        }

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
