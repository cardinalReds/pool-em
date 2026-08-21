'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COMMON_IDS, CATEGORY_GROUPS, ROUND_SPECIALS, groupKeyFor } from '@/lib/categoryGroups'

const SPORT_ORDER = ['soccer', 'nfl', 'f1', 'mma']
const SPORT_META: Record<string, { emoji: string; label: string }> = {
  soccer: { emoji: '⚽', label: 'Soccer' },
  nfl: { emoji: '🏈', label: 'NFL' },
  f1: { emoji: '🏎', label: 'Formula 1' },
  mma: { emoji: '🥊', label: 'MMA' },
}

// Points-per-component scoring means points_earned > 0 (is_correct) isn't the same as
// "fully correct" — soccer's exact-score categories award home/away digits independently
// plus a bonus for getting both, and F1's podium-order categories award bonus points for
// picking a driver who's on the podium but in the wrong position. For these, "hit" is
// recomputed below as points_earned === the pool's full-credit value for that category,
// using each pool's own pool_rules (points/bonus_points), not just the is_correct flag.
const PARTIAL_CREDIT_CATEGORIES = new Set([
  'soccer_exact_score', 'soccer_ht_exact_score',
  'f1_podium_order_1', 'f1_podium_order_2', 'f1_podium_order_3',
])

interface CategoryStat {
  categoryId: string
  name: string
  sortOrder: number
  hits: number
  total: number
}

interface CompetitionStat {
  tournamentId: string
  name: string
  status: string
  hits: number
  total: number
}

interface SportStat {
  sport: string
  hits: number
  total: number
  groups: { label: string; categories: CategoryStat[] }[]
  competitions: CompetitionStat[]
}

// A single graded win/draw/loss-style pick (soccer_result or nfl_result), with enough
// fixture context to filter by team/outcome and simulate a $1-per-pick bet. Odds are the
// closing line (see closing_odds_* on fixtures) — the price at kickoff, not whatever
// in-play odds happened to be showing later.
interface WldPick {
  fixtureId: number
  tournamentId: string
  homeTeam: string
  awayTeam: string
  predictedWld: 'home' | 'away' | 'draw'
  isCorrect: boolean
  closingOddsHome: number | null
  closingOddsDraw: number | null
  closingOddsAway: number | null
}

interface PLTableRow { team: string; w: number; d: number; l: number; pts: number; played: number }

function groupCategoriesForSport(categoryList: CategoryStat[]) {
  const used = new Set<string>()
  const byId = new Map(categoryList.map(c => [c.categoryId, c]))
  const groups: { label: string; categories: CategoryStat[] }[] = []

  const common = COMMON_IDS.map(id => byId.get(id)).filter(Boolean) as CategoryStat[]
  if (common.length > 0) {
    groups.push({ label: 'Common Picks', categories: common })
    common.forEach(c => used.add(c.categoryId))
  }

  for (const group of CATEGORY_GROUPS) {
    const cats = categoryList.filter(c => !used.has(c.categoryId) && group.ids.includes(groupKeyFor(c.categoryId)))
    if (cats.length === 0) continue
    groups.push({ label: group.label, categories: cats })
    cats.forEach(c => used.add(c.categoryId))
  }

  const roundSpecials = categoryList.filter(c => !used.has(c.categoryId) && ROUND_SPECIALS.includes(c.categoryId))
  if (roundSpecials.length > 0) {
    groups.push({ label: 'Round Specials', categories: roundSpecials })
    roundSpecials.forEach(c => used.add(c.categoryId))
  }

  const rest = categoryList.filter(c => !used.has(c.categoryId))
  if (rest.length > 0) groups.push({ label: 'Other', categories: rest })

  return groups
}

// Team + result-type filter over a sport's graded W/D/L picks, with a $1-per-pick betting
// simulation using the closing odds captured at kickoff (see closing_odds_* on fixtures —
// frozen there specifically so this can't silently use stale/live-drifted odds).
function PicksExplorer({ picks, hasDraw }: { picks: WldPick[]; hasDraw: boolean }) {
  const [team, setTeam] = useState('all')
  const [outcome, setOutcome] = useState<'all' | 'home' | 'away' | 'draw'>('all')

  const teams = [...new Set(picks.flatMap(p => [p.homeTeam, p.awayTeam]))].sort()

  const filtered = picks.filter(p => {
    if (team !== 'all' && p.homeTeam !== team && p.awayTeam !== team) return false
    if (outcome !== 'all' && p.predictedWld !== outcome) return false
    return true
  })

  const hits = filtered.filter(p => p.isCorrect).length
  const total = filtered.length
  const pct = total > 0 ? Math.round((hits / total) * 100) : 0

  let staked = 0
  let netPnl = 0
  let oddsMissing = 0
  for (const p of filtered) {
    const odds = p.predictedWld === 'home' ? p.closingOddsHome : p.predictedWld === 'away' ? p.closingOddsAway : p.closingOddsDraw
    if (odds == null) { oddsMissing++; continue }
    staked += 1
    netPnl += p.isCorrect ? (odds - 1) : -1
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.5rem' }}>explore your picks</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '0.6rem' }}>
        <select value={team} onChange={e => setTeam(e.target.value)}
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white' }}>
          <option value="all">all teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={outcome} onChange={e => setOutcome(e.target.value as any)}
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white' }}>
          <option value="all">any result</option>
          <option value="home">picked home win</option>
          {hasDraw && <option value="draw">picked draw</option>}
          <option value="away">picked away win</option>
        </select>
      </div>

      {total === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>no picks match this filter.</p>
      ) : (
        <>
          <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
            <span style={{ fontWeight: 600, color: pct >= 50 ? '#2d7a2d' : 'var(--text-dim)' }}>{pct}%</span>
            <span style={{ color: 'var(--text-dim)' }}> ({hits}/{total} correct{team !== 'all' ? ` · ${team}` : ''}{outcome !== 'all' ? ` · picked ${outcome}` : ''})</span>
          </div>
          {staked > 0 ? (
            <div style={{ fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600, color: netPnl >= 0 ? '#2d7a2d' : '#C8102E' }}>{netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}</span>
              <span style={{ color: 'var(--text-dim)' }}> if you'd bet $1 on each of these {staked} picks at closing odds{oddsMissing > 0 ? ` (${oddsMissing} excluded — no odds recorded)` : ''}</span>
            </div>
          ) : (
            <p style={{ fontSize: '0.75rem', color: '#bbb' }}>no closing-odds data recorded yet for these picks.</p>
          )}
        </>
      )}
    </div>
  )
}

// "If your picks were always right" — a simulated Premier League table built entirely
// from the user's own predicted results (not actual ones), standard 3/1/0 points. Deliberately
// includes predictions for games that haven't been played yet — the whole point is
// pretending every pick, including future ones, came true.
function PLHypotheticalTable({ rows }: { rows: PLTableRow[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb' }}>
          🏆 the PL table if your picks were always right
        </span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ overflowX: 'auto' as const, marginTop: '0.6rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600 }}>#</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600 }}>team</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>P</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>W</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>D</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>L</td>
                <td style={{ padding: '0.3rem 0.5rem', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>Pts</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.3rem 0.5rem', color: '#aaa' }}>{i + 1}</td>
                  <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>{r.team}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' as const }}>{r.played}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' as const }}>{r.w}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' as const }}>{r.d}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' as const }}>{r.l}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' as const, fontWeight: 700, color: '#C8102E' }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '0.5rem' }}>
            built from your own predicted results, including games not played yet — not the real table.
          </p>
        </div>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [sportStats, setSportStats] = useState<SportStat[]>([])
  const [hasPartialCredit, setHasPartialCredit] = useState(false)
  const [soccerPicks, setSoccerPicks] = useState<WldPick[]>([])
  const [nflPicks, setNflPicks] = useState<WldPick[]>([])
  const [plHypoTable, setPlHypoTable] = useState<PLTableRow[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', user.id),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
      ])
      const poolIds = [...new Set([
        ...(adminPools || []).map(p => p.id),
        ...(memberRows || []).map(m => m.pool_id),
      ])]

      if (poolIds.length === 0) { setLoading(false); return }

      const [{ data: preds }, { data: categories }, { data: poolRules }, { data: pools }] = await Promise.all([
        supabase.from('predictions_v2')
          .select('pool_id, category_id, points_earned, is_correct, fixture_id, value_wld')
          .eq('user_id', user.id)
          .in('pool_id', poolIds)
          .not('points_earned', 'is', null),
        supabase.from('ruleset_categories').select('id, sport, name, sort_order'),
        supabase.from('pool_rules').select('pool_id, category_id, points, bonus_points').in('pool_id', poolIds),
        supabase.from('pools').select('id, tournament_id').in('id', poolIds),
      ])

      const categoryMap = new Map((categories || []).map(c => [c.id, c]))
      const poolToTournament = new Map((pools || []).map(p => [p.id, p.tournament_id]))
      const tournamentIds = [...new Set((pools || []).map(p => p.tournament_id))]
      const { data: tournaments } = tournamentIds.length
        ? await supabase.from('tournaments').select('id, name, status').in('id', tournamentIds)
        : { data: [] as { id: string; name: string; status: string }[] }
      const tournamentMap = new Map((tournaments || []).map(t => [t.id, t]))

      // ── "Explore your picks" — team/result filters + $1-per-pick P&L, soccer + NFL only ──
      // (see PicksExplorer below). Reuses `preds` (already graded — points_earned not
      // null) rather than a second query, since fixture_id/value_wld are now in that select.
      const wldPredsBySport: Record<string, typeof preds> = { soccer: [], nfl: [] }
      for (const p of preds || []) {
        if (p.category_id === 'soccer_result' && p.fixture_id != null) wldPredsBySport.soccer!.push(p)
        else if (p.category_id === 'nfl_result' && p.fixture_id != null) wldPredsBySport.nfl!.push(p)
      }

      // Separate, ungraded-inclusive fetch for the PL hypothetical table — "if my picks
      // were always right" simulates a world where every pick (including ones for games
      // not yet played) came true, so it can't reuse the graded-only `preds` fetch above.
      const { data: allPlResultPreds } = await supabase
        .from('predictions_v2')
        .select('pool_id, fixture_id, value_wld')
        .eq('user_id', user.id)
        .in('pool_id', poolIds)
        .eq('category_id', 'soccer_result')
        .not('fixture_id', 'is', null)

      const allWldFixtureIds = [...new Set([
        ...wldPredsBySport.soccer!.map(p => p.fixture_id as number),
        ...wldPredsBySport.nfl!.map(p => p.fixture_id as number),
        ...(allPlResultPreds || []).map(p => p.fixture_id as number),
      ])]

      const { data: wldFixtures } = allWldFixtureIds.length
        ? await supabase.from('fixtures')
            .select('id, tournament_id, home_team, away_team, home_score, away_score, status, closing_odds_home, closing_odds_draw, closing_odds_away')
            .in('id', allWldFixtureIds)
        : { data: [] as any[] }
      const fixtureMap = new Map((wldFixtures || []).map(f => [f.id, f]))

      const wldPicksBySport: Record<'soccer' | 'nfl', WldPick[]> = { soccer: [], nfl: [] }
      for (const sportKey of ['soccer', 'nfl'] as const) {
        for (const p of wldPredsBySport[sportKey] || []) {
          const f = fixtureMap.get(p.fixture_id as number)
          if (!f || !p.value_wld) continue
          wldPicksBySport[sportKey].push({
            fixtureId: f.id,
            tournamentId: f.tournament_id,
            homeTeam: f.home_team,
            awayTeam: f.away_team,
            predictedWld: p.value_wld as 'home' | 'away' | 'draw',
            isCorrect: !!p.is_correct,
            closingOddsHome: f.closing_odds_home,
            closingOddsDraw: f.closing_odds_draw,
            closingOddsAway: f.closing_odds_away,
          })
        }
      }

      // PL hypothetical table — one row per team that's appeared in a pl_2026 prediction,
      // tallied from predicted (not actual) results using standard 3/1/0 points.
      const plTableMap = new Map<string, { team: string; w: number; d: number; l: number; pts: number; played: number }>()
      function bump(team: string, outcome: 'w' | 'd' | 'l') {
        const row = plTableMap.get(team) || { team, w: 0, d: 0, l: 0, pts: 0, played: 0 }
        row.played += 1
        if (outcome === 'w') { row.w += 1; row.pts += 3 }
        else if (outcome === 'd') { row.d += 1; row.pts += 1 }
        else row.l += 1
        plTableMap.set(team, row)
      }
      for (const p of allPlResultPreds || []) {
        const f = fixtureMap.get(p.fixture_id as number)
        if (!f || f.tournament_id !== 'pl_2026' || !p.value_wld) continue
        if (p.value_wld === 'home') { bump(f.home_team, 'w'); bump(f.away_team, 'l') }
        else if (p.value_wld === 'away') { bump(f.away_team, 'w'); bump(f.home_team, 'l') }
        else { bump(f.home_team, 'd'); bump(f.away_team, 'd') }
      }
      const plHypoTable = [...plTableMap.values()].sort((a, b) => b.pts - a.pts || b.w - a.w)

      // f1_podium_order_1/_2/_3 are scored individually but configured as one pool_rules
      // row under the base 'f1_podium_order' id — mirrors the ruleMap remap in
      // app/api/f1/score/route.ts so lookups by the prediction's actual category_id work.
      const ruleLookup = new Map<string, { points: number; bonus_points: number }>()
      for (const r of poolRules || []) {
        const entry = { points: r.points, bonus_points: r.bonus_points || 0 }
        ruleLookup.set(`${r.pool_id}:${r.category_id}`, entry)
        if (r.category_id === 'f1_podium_order') {
          ruleLookup.set(`${r.pool_id}:f1_podium_order_1`, entry)
          ruleLookup.set(`${r.pool_id}:f1_podium_order_2`, entry)
          ruleLookup.set(`${r.pool_id}:f1_podium_order_3`, entry)
        }
      }

      function isFullyCorrect(p: { pool_id: string; category_id: string; points_earned: number | null; is_correct: boolean | null }): boolean {
        if (!PARTIAL_CREDIT_CATEGORIES.has(p.category_id)) return !!p.is_correct
        const rule = ruleLookup.get(`${p.pool_id}:${p.category_id}`)
        if (!rule || !rule.points) return !!p.is_correct // couldn't find the rule — fall back rather than guess
        const fullCredit = p.category_id.startsWith('f1_podium_order_')
          ? rule.points
          : rule.points * 2 + rule.bonus_points // soccer_exact_score / soccer_ht_exact_score: both digits + bonus
        return p.points_earned === fullCredit
      }

      const bySport: Record<string, Record<string, CategoryStat>> = {}
      const byCompetition: Record<string, Record<string, { hits: number; total: number }>> = {}
      let sawPartialCredit = false

      for (const p of preds || []) {
        const cat = categoryMap.get(p.category_id)
        if (!cat) continue
        if (PARTIAL_CREDIT_CATEGORIES.has(p.category_id)) sawPartialCredit = true
        const hit = isFullyCorrect(p)

        bySport[cat.sport] ??= {}
        bySport[cat.sport][p.category_id] ??= { categoryId: p.category_id, name: cat.name, sortOrder: cat.sort_order ?? 0, hits: 0, total: 0 }
        const stat = bySport[cat.sport][p.category_id]
        stat.total += 1
        if (hit) stat.hits += 1

        const tournamentId = poolToTournament.get(p.pool_id)
        if (tournamentId) {
          byCompetition[cat.sport] ??= {}
          byCompetition[cat.sport][tournamentId] ??= { hits: 0, total: 0 }
          byCompetition[cat.sport][tournamentId].total += 1
          if (hit) byCompetition[cat.sport][tournamentId].hits += 1
        }
      }

      const sports: SportStat[] = Object.entries(bySport).map(([sport, cats]) => {
        const categoryList = Object.values(cats).sort((a, b) => a.sortOrder - b.sortOrder)
        const hits = categoryList.reduce((sum, c) => sum + c.hits, 0)
        const total = categoryList.reduce((sum, c) => sum + c.total, 0)
        const competitions: CompetitionStat[] = Object.entries(byCompetition[sport] || {})
          .map(([tournamentId, stat]) => ({
            tournamentId,
            name: tournamentMap.get(tournamentId)?.name || tournamentId,
            status: tournamentMap.get(tournamentId)?.status || '',
            hits: stat.hits,
            total: stat.total,
          }))
          .sort((a, b) => b.total - a.total)
        return { sport, hits, total, groups: groupCategoriesForSport(categoryList), competitions }
      }).sort((a, b) => {
        const ai = SPORT_ORDER.indexOf(a.sport), bi = SPORT_ORDER.indexOf(b.sport)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })

      setSportStats(sports)
      setHasPartialCredit(sawPartialCredit)
      setSoccerPicks(wldPicksBySport.soccer)
      setNflPicks(wldPicksBySport.nfl)
      setPlHypoTable(plHypoTable)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  const totalPicks = sportStats.reduce((sum, s) => sum + s.total, 0)

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>your record</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>your prediction accuracy across every pool you've played, broken down by sport and prop.</p>
      </div>

      {totalPicks === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          no scored picks yet — check back once games kick off.
        </div>
      ) : (
        <>
          {sportStats.map(s => {
            const meta = SPORT_META[s.sport] || { emoji: '🏆', label: s.sport }
            const pct = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 0
            return (
              <section key={s.sport} style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{meta.label}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{pct}% · {s.hits}/{s.total}</span>
                  <div style={{ flex: 1, borderTop: '1px solid var(--border-light)' }} />
                </div>

                {s.competitions.length > 1 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
                    {s.competitions.map(c => {
                      const cPct = c.total > 0 ? Math.round((c.hits / c.total) * 100) : 0
                      return (
                        <div key={c.tournamentId} style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.4rem 0.65rem', fontSize: '0.75rem', background: 'var(--bg-subtle, #fafafa)', border: '1px solid var(--border-light)',
                        }}>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          {c.status && <span style={{ color: 'var(--text-faint)', textTransform: 'lowercase' as const }}>{c.status}</span>}
                          <span style={{ color: 'var(--text-dim)' }}>{cPct}% ({c.hits}/{c.total})</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {s.groups.map(group => (
                  <div key={group.label} style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.35rem' }}>{group.label}</div>
                    <div style={{ background: 'white', border: '1px solid var(--border)' }}>
                      {group.categories.map((c, i) => {
                        const catPct = c.total > 0 ? Math.round((c.hits / c.total) * 100) : 0
                        return (
                          <div key={c.categoryId} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.6rem 0.85rem', fontSize: '0.85rem',
                            borderTop: i === 0 ? 'none' : '1px solid var(--border-light)',
                          }}>
                            <span>{c.name}</span>
                            <span style={{ fontWeight: 600, color: catPct >= 50 ? '#2d7a2d' : 'var(--text-dim)' }}>{catPct}% <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({c.hits}/{c.total})</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {s.sport === 'soccer' && soccerPicks.length > 0 && (
                  <PicksExplorer picks={soccerPicks} hasDraw />
                )}
                {s.sport === 'soccer' && plHypoTable.length > 0 && (
                  <PLHypotheticalTable rows={plHypoTable} />
                )}
                {s.sport === 'nfl' && nflPicks.length > 0 && (
                  <PicksExplorer picks={nflPicks} hasDraw={false} />
                )}
              </section>
            )
          })}

          {hasPartialCredit && (
            <p style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '1rem' }}>
              exact-score and podium-order picks award partial credit toward your pool total even when not fully right — a "hit" here only counts the fully-correct ones, so it can read lower than your points in those pools.
            </p>
          )}
        </>
      )}
    </div>
  )
}
