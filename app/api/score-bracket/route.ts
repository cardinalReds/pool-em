import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateR32FromGroupPicks } from '@/lib/bracketEngine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const API_KEY = process.env.API_FOOTBALL_KEY!
const KNOCKOUT_ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

async function syncKnockoutFixturesFromAPI() {
  for (const round of KNOCKOUT_ROUNDS) {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=1&season=2026&round=${encodeURIComponent(round)}`,
      { headers: { 'x-apisports-key': API_KEY } }
    )
    if (!res.ok) continue
    const data = await res.json()
    for (const f of data.response || []) {
      const homeTeam = f.teams?.home?.name
      const awayTeam = f.teams?.away?.name
      const apiDate = f.fixture?.date
      const apiId = f.fixture?.id
      if (!homeTeam || !awayTeam || !apiDate) continue

      let existing: any = null
      if (apiId) {
        const { data: byId } = await supabase.from('fixtures').select('id, home_team, away_team, api_fixture_id').eq('api_fixture_id', apiId).maybeSingle()
        existing = byId
      }
      if (!existing) {
        const apiDateObj = new Date(apiDate)
        const { data: byDate } = await supabase.from('fixtures').select('id, home_team, away_team, api_fixture_id').eq('tournament_id', 'wc_2026').eq('round', round).gte('date', new Date(apiDateObj.getTime() - 3600000).toISOString()).lte('date', new Date(apiDateObj.getTime() + 3600000).toISOString()).maybeSingle()
        existing = byDate
      }
      if (!existing) continue

      const updates: Record<string, any> = {}
      if (existing.home_team !== homeTeam) updates.home_team = homeTeam
      if (existing.away_team !== awayTeam) updates.away_team = awayTeam
      if (!existing.api_fixture_id && apiId) updates.api_fixture_id = apiId
      updates.date = apiDate
      if (Object.keys(updates).length > 0) {
        await supabase.from('fixtures').update(updates).eq('id', existing.id)
      }
    }
    await new Promise(r => setTimeout(r, 200))
  }
}

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
    R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), FINAL: new Set(), CHAMPION: new Set(),
    ELIMINATED: new Set() // teams that have lost a match
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
    const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : f.penalty_winner || null
    const l = w ? (w === f.home_team ? f.away_team : f.home_team) : null
    if (r.includes('Round of 32') && w) { sets.R16.add(w); if (l) sets.ELIMINATED.add(l) }
    if (r.includes('Round of 16')) {
      sets.R16.add(f.home_team); sets.R16.add(f.away_team)
      if (w) { sets.QF.add(w); if (l) sets.ELIMINATED.add(l) }
    }
    if (r.includes('Quarter-finals')) {
      sets.QF.add(f.home_team); sets.QF.add(f.away_team)
      if (w) { sets.SF.add(w); if (l) sets.ELIMINATED.add(l) }
    }
    if (r.includes('Semi-finals')) {
      sets.SF.add(f.home_team); sets.SF.add(f.away_team)
      if (w) { sets.FINAL.add(w); if (l) sets.ELIMINATED.add(l) }
    }
    if (r === 'Final') {
      sets.FINAL.add(f.home_team); sets.FINAL.add(f.away_team)
      if (w) { sets.CHAMPION.add(w); if (l) sets.ELIMINATED.add(l) }
    }
  }

  // Also add teams not in R32 (didn't qualify from groups)
  // Get all tournament teams from actual_standings
  return sets
}


export async function GET() {
  return POST()
}

export async function POST() {
  try {
    // Sync knockout fixture team names from API first
    await syncKnockoutFixturesFromAPI()

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

    // ── Populate TBD knockout fixtures with actual team names ─────────────
    if (rows.length > 0) {
      const { data: tbdFixtures } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team, api_fixture_id')
        .eq('tournament_id', 'wc_2026')
        .or('home_team.ilike.TBD%,away_team.ilike.TBD%')

      // Build the actual R32 bracket to resolve TBD (3) slots
      // This only gives meaningful results once all 12 groups + best third are locked
      const actualBracketForTBD = Object.keys(actualGroupPicks).length >= 12
        ? generateR32FromGroupPicks(actualGroupPicks as any, actualBestThird)
        : {}

      for (const fixture of tbdFixtures || []) {
        const updates: Record<string, string> = {}

        function resolveTeam(placeholder: string): string | null {
          const m1 = placeholder.match(/TBD \(1([A-Z])\)/)
          if (m1) return actualStandings[m1[1]]?.['1'] || null
          const m2 = placeholder.match(/TBD \(2([A-Z])\)/)
          if (m2) return actualStandings[m2[1]]?.['2'] || null
          if (placeholder === 'TBD (3)') {
            // Find this fixture's slot in the actual R32 bracket by api_fixture_id
            // The bracket maps slot names to {home, away} — find the slot matching this fixture
            for (const [slot, teams] of Object.entries(actualBracketForTBD)) {
              // We need to match by slot position — check both sides
              if (teams.home && teams.away) {
                // If one side is already resolved, the other TBD (3) must be the remaining one
                if (!fixture.home_team.startsWith('TBD') && teams.home === fixture.home_team) return teams.away || null
                if (!fixture.away_team.startsWith('TBD') && teams.away === fixture.away_team) return teams.home || null
              }
            }
            return null
          }
          return null
        }

        const newHome = fixture.home_team.startsWith('TBD') ? resolveTeam(fixture.home_team) : null
        const newAway = fixture.away_team.startsWith('TBD') ? resolveTeam(fixture.away_team) : null

        if (newHome) updates.home_team = newHome
        if (newAway) updates.away_team = newAway

        if (Object.keys(updates).length > 0) {
          await supabase.from('fixtures').update(updates).eq('id', fixture.id)
        }
      }
    }

    // ── Load fixtures for knockout round results ─────────────────────────
    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('round, home_team, away_team, home_score, away_score, status, penalty_winner')
      .eq('tournament_id', 'wc_2026')

    const actualRounds = buildActualRoundSets(actualR32Bracket, allFixtures || [])
    // Override R32 with our definitive standings-based set (additive with fixture data)
    for (const team of actualR32TeamsFromStandings) actualRounds.R32.add(team)

    // Build eliminated: all 48 tournament teams minus those in R32, plus match losers
    const { data: allStandingsRows } = await supabase
      .from('actual_standings')
      .select('team')
      .eq('tournament_id', 'wc_2026')
    const allTournamentTeams = new Set((allStandingsRows || []).map((r: any) => r.team))
    for (const team of allTournamentTeams) {
      if (!actualRounds.R32.has(team)) actualRounds.ELIMINATED.add(team)
    }

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
            if (locked['1'] && predicted[0] === locked['1']) { totalPts += rules.standingsFirst; breakdown[`group_${group}_1st`] = rules.standingsFirst }
            if (locked['2'] && predicted[1] === locked['2']) { totalPts += rules.standingsSecond; breakdown[`group_${group}_2nd`] = rules.standingsSecond }
            if (locked['3'] && predicted[2] === locked['3']) { totalPts += rules.standingsThird; breakdown[`group_${group}_3rd`] = rules.standingsThird }
          }
        }

        const bracketPicksData: Record<string, string> = pick.bracket_picks || {}

        // ── Build user arrays from bracket_picks ─────────────────────────
        // userR32 = teams user picked to win each R32 match (values of R32_Mxx keys)
        // userR16 = teams user picked to win each R16 match (values of R16_x keys)
        // userQF  = teams user picked to win each QF match  (values of QF_x keys)
        // userSF  = teams user picked to win each SF match  (values of SF_x keys)
        // userFINAL = team user picked to win the Final
        const userR32 = Object.entries(bracketPicksData).filter(([k]) => k.startsWith('R32_')).map(([, v]) => v).filter(Boolean)
        const userR16 = Object.entries(bracketPicksData).filter(([k]) => k.startsWith('R16_')).map(([, v]) => v).filter(Boolean)
        const userQF  = Object.entries(bracketPicksData).filter(([k]) => k.startsWith('QF_')).map(([, v]) => v).filter(Boolean)
        const userSF  = Object.entries(bracketPicksData).filter(([k]) => k.startsWith('SF_')).map(([, v]) => v).filter(Boolean)
        const userFINAL = bracketPicksData['FINAL']

        // ── Build actual arrays from confirmed results ────────────────────
        // actualR32 = 32 teams who actually played in R32 (from standings)
        // actualR16 = teams who won their R32 game (confirmed in R16)
        // actualQF  = teams who won their R16 game
        // actualSF  = teams who won their QF game
        // actualFINAL = teams who won their SF game
        // actualChampion = tournament winner

        // ── Score each round ─────────────────────────────────────────────
        // R32 participation (1pt each): user predicted them in R32 from group picks
        const userBestThird: string[] = pick.best_third_groups || []
        const userR32FromGroups = new Set<string>()
        for (const [group, predicted] of Object.entries(groupPicks)) {
          if (predicted[0]) userR32FromGroups.add(predicted[0])
          if (predicted[1]) userR32FromGroups.add(predicted[1])
          if (predicted[2] && userBestThird.includes(group)) userR32FromGroups.add(predicted[2])
        }
        for (const team of userR32FromGroups) {
          if (actualRounds.R32.has(team)) { totalPts += rules.r32Pts; breakdown[`R32_${team}`] = rules.r32Pts }
        }

        // R16 (2pts each): user predicted them to WIN their R32 match → team is now in R16
        for (const team of userR32) {
          if (actualRounds.R16.has(team)) { totalPts += rules.r16Pts; breakdown[`R16_${team}`] = rules.r16Pts }
        }

        // QF (4pts each): user predicted them to WIN their R16 match → team is now in QF
        for (const team of userR16) {
          if (actualRounds.QF.has(team)) { totalPts += rules.qfPts; breakdown[`QF_${team}`] = rules.qfPts }
        }

        // SF (6pts each): user predicted them to WIN their QF match → team is now in SF
        for (const team of userQF) {
          if (actualRounds.SF.has(team)) { totalPts += rules.sfPts; breakdown[`SF_${team}`] = rules.sfPts }
        }

        // Final (12pts each): user predicted them to WIN their SF match → team is in Final
        for (const team of userSF) {
          if (actualRounds.FINAL.has(team)) { totalPts += rules.finalPts; breakdown[`FINAL_${team}`] = rules.finalPts }
        }

        // Champion: user predicted the winner of the Final — 10pts for correct winner
        if (userFINAL && actualRounds.CHAMPION.has(userFINAL)) {
          totalPts += 10; breakdown['CHAMPION'] = 10
        }

        // ── Final exact score ─────────────────────────────────────────────
        // 2pts per correct team goal + 3pt exact bonus (per pool's posted rules)
        const finalFixture = allFixtures?.find(f => f.round === 'Final' && f.status === 'FT')
        if (finalFixture && pick.final_home_score != null && pick.final_away_score != null) {
          const actualHomeGoals = finalFixture.home_score
          const actualAwayGoals = finalFixture.away_score
          let finalScorePts = 0
          if (pick.final_home_score === actualHomeGoals) finalScorePts += 2
          if (pick.final_away_score === actualAwayGoals) finalScorePts += 2
          if (pick.final_home_score === actualHomeGoals && pick.final_away_score === actualAwayGoals) {
            finalScorePts += 3
          }
          if (finalScorePts > 0) {
            totalPts += finalScorePts
            breakdown['FINAL_SCORE'] = finalScorePts
          }
        }

        // ── Max possible score ────────────────────────────────────────────
        // Start from confirmed points, then add points for any pick that's
        // still alive (not eliminated) and not yet confirmed for that round
        let maxPossible = totalPts

        // R32 group picks not yet confirmed but team still alive
        for (const team of userR32FromGroups) {
          if (!actualRounds.R32.has(team) && !actualRounds.ELIMINATED.has(team)) maxPossible += rules.r32Pts
        }
        // R16: pick alive and not yet confirmed in R16
        for (const team of userR32) {
          if (!actualRounds.R16.has(team) && !actualRounds.ELIMINATED.has(team)) maxPossible += rules.r16Pts
        }
        // QF: pick alive and not yet confirmed in QF
        for (const team of userR16) {
          if (!actualRounds.QF.has(team) && !actualRounds.ELIMINATED.has(team)) maxPossible += rules.qfPts
        }
        // SF: pick alive and not yet confirmed in SF
        for (const team of userQF) {
          if (!actualRounds.SF.has(team) && !actualRounds.ELIMINATED.has(team)) maxPossible += rules.sfPts
        }
        // Final: pick alive and not yet confirmed in Final
        for (const team of userSF) {
          if (!actualRounds.FINAL.has(team) && !actualRounds.ELIMINATED.has(team)) maxPossible += rules.finalPts
        }
        // Champion: pick alive and not yet confirmed champion — 10pts for correct winner
        if (userFINAL && !actualRounds.CHAMPION.has(userFINAL) && !actualRounds.ELIMINATED.has(userFINAL)) {
          maxPossible += 10
        }
        // Final exact score — 2+2+3 = 7pts max, only countable if finalist still alive and Final not yet played
        if (!finalFixture && userFINAL && !actualRounds.ELIMINATED.has(userFINAL)) {
          maxPossible += 7
        }

        if (totalPts > 0 || Object.keys(breakdown).length > 0) {
          await supabase
            .from('bracket_picks')
            .update({ bracket_scores: { total: totalPts, breakdown, eliminated: [...actualRounds.ELIMINATED], max_possible: maxPossible } })
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
