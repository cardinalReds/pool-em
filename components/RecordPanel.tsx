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
  date: string
  predictedWld: 'home' | 'away' | 'draw'
  isCorrect: boolean
  pointsEarned: number | null
  closingOddsHome: number | null
  closingOddsDraw: number | null
  closingOddsAway: number | null
}

interface PLTableRow { team: string; w: number; d: number; l: number; pts: number; played: number }

interface CompareCandidate {
  id: string
  name: string
  sharedPoolCount: number // pools, among the viewer's own pools, this person is also in
  hitRatePct: number | null // rough accuracy across those shared pools — null if nothing graded yet
}

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

// Sequential single-hue ramp (green — this app's existing "correct" color) for hit-rate
// magnitude, light→dark, per the dataviz skill's sequential-encoding rule. Returns both
// the fill and a text color picked from the fill's actual luminance (not a fixed
// percentage threshold), so labels stay legible across the whole ramp.
function hitRateStyle(pct: number): { bg: string; text: string } {
  const t = Math.max(0, Math.min(1, pct / 100))
  const from = { r: 0xee, g: 0xf7, b: 0xee }
  const to = { r: 0x1c, g: 0x4d, b: 0x1c }
  const r = Math.round(from.r + (to.r - from.r) * t)
  const g = Math.round(from.g + (to.g - from.g) * t)
  const b = Math.round(from.b + (to.b - from.b) * t)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return { bg: `rgb(${r},${g},${b})`, text: luminance > 0.55 ? '#1a1a19' : '#fdfdfc' }
}

interface OutcomeColumn { id: string; label: string; match: (p: WldPick) => boolean }

// One column of the heatmap — a predicate over a pick, plus its header label. Domestic
// leagues (PL) and NFL/NCAAF group by predicted home/draw/away since that's a real,
// consistent advantage. Neutral-venue tournaments (World Cup) don't get that axis at
// all — "home"/"away" there is just an arbitrary data-feed label, not a real advantage,
// so grouping by it would be a meaningless (and confusing) pattern to go looking for.
const HOME_DRAW_AWAY_COLUMNS: OutcomeColumn[] = [
  { id: 'home', label: 'home win', match: p => p.predictedWld === 'home' },
  { id: 'draw', label: 'draw', match: p => p.predictedWld === 'draw' },
  { id: 'away', label: 'away win', match: p => p.predictedWld === 'away' },
]
const HOME_AWAY_COLUMNS: OutcomeColumn[] = HOME_DRAW_AWAY_COLUMNS.filter(c => c.id !== 'draw')
const SINGLE_RESULT_COLUMN: OutcomeColumn[] = [{ id: 'any', label: 'result', match: () => true }]
const NEUTRAL_VENUE_TOURNAMENTS = new Set(['wc_2026'])

function predictedTeamLabel(p: WldPick): string {
  if (p.predictedWld === 'draw') return 'draw'
  return p.predictedWld === 'home' ? p.homeTeam : p.awayTeam
}

interface ExplorerPerson { id: string; label: string; picks: WldPick[] }

// A "mad libs" sentence-plus-dropdowns query over one or more people's graded W/D/L picks,
// replacing an earlier team × outcome heatmap grid that was accurate but unreadable at a
// glance — a wall of colored cells doesn't answer "am I good at predicting away wins?" any
// faster than scanning for the one cell that matters. This states the answer as a sentence
// ("you're 75% (9/12) predicting away wins for Arsenal") with the two variables — outcome
// and team — as inline dropdowns, so changing the question is one click, not a re-scan. A
// "best/worst team" line is computed automatically alongside it (single-person view only)
// since that specific question — "what team am I good at" — was the whole reason the old
// grid existed, and shouldn't require manually flipping through every team by hand.
function PicksExplorer({ people, defaultColumns, competitions, primaryId, availableToAdd, onAddPerson, onRemovePerson }: {
  people: ExplorerPerson[] // one entry per person shown
  defaultColumns: OutcomeColumn[] // this sport's normal breakdown, e.g. home/draw/away
  competitions: { id: string; name: string; status: string }[] // union of competitions anyone here has picks in
  primaryId: string // the subject of the page — never removable from the sentence
  availableToAdd: { id: string; name: string }[] // pool-mates not currently in `people`, offered via "+ add someone"
  onAddPerson: (id: string) => void
  onRemovePerson: (id: string) => void
}) {
  const isMulti = people.length > 1
  const [selectedTeam, setSelectedTeam] = useState<string>('all')
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all')
  const [competitionId, setCompetitionId] = useState<string>(() => {
    // Default to a currently-active competition over a finished one (a completed World
    // Cup run has way more accumulated picks than a season just getting started, but
    // it's not the one worth landing on) — most-picks is just the tiebreak among
    // active competitions, or the fallback if none are active.
    const counts = new Map<string, number>()
    for (const p of people) for (const pick of p.picks) counts.set(pick.tournamentId, (counts.get(pick.tournamentId) || 0) + 1)
    const byPickCount = (a: string, b: string) => (counts.get(b) || 0) - (counts.get(a) || 0)
    const active = competitions.filter(c => c.status === 'active').map(c => c.id).sort(byPickCount)
    if (active.length > 0) return active[0]
    const allIds = competitions.map(c => c.id).sort(byPickCount)
    return allIds[0] || competitions[0]?.id || ''
  })

  const columns = NEUTRAL_VENUE_TOURNAMENTS.has(competitionId) ? SINGLE_RESULT_COLUMN : defaultColumns
  const scoped = people.map(p => ({ ...p, scoped: p.picks.filter(x => x.tournamentId === competitionId) }))
  const teams = [...new Set(scoped.flatMap(p => p.scoped.flatMap(x => [x.homeTeam, x.awayTeam])))].sort()

  // Real recent form (not predictions) — last 5 finished results for every team
  // currently shown as a row, independent of who's being compared or what they picked.
  // Fetched fresh per competition rather than derived from `people`'s picks, since a
  // person's own picks are a partial, possibly-sparse subset of a team's actual games.
  const [teamForm, setTeamForm] = useState<Map<string, { opponent: string; result: 'W' | 'D' | 'L'; scoreLabel: string }[]>>(new Map())
  useEffect(() => {
    if (!competitionId) { setTeamForm(new Map()); return }
    let cancelled = false
    async function loadForm() {
      const supabase = createClient()
      const { data } = await supabase.from('fixtures')
        .select('home_team, away_team, home_score, away_score, date')
        .eq('tournament_id', competitionId)
        .eq('status', 'FT')
        .order('date', { ascending: false })
      if (cancelled) return
      const byTeam = new Map<string, { opponent: string; result: 'W' | 'D' | 'L'; scoreLabel: string }[]>()
      for (const f of data || []) {
        if (f.home_score == null || f.away_score == null) continue
        const homeResult: 'W' | 'D' | 'L' = f.home_score > f.away_score ? 'W' : f.home_score < f.away_score ? 'L' : 'D'
        const awayResult: 'W' | 'D' | 'L' = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
        const scoreLabel = `${f.home_score}-${f.away_score}`
        const entries: [string, string, 'W' | 'D' | 'L'][] = [[f.home_team, f.away_team, homeResult], [f.away_team, f.home_team, awayResult]]
        for (const [team, opponent, result] of entries) {
          const list = byTeam.get(team) || []
          if (list.length < 5) list.push({ opponent, result, scoreLabel })
          byTeam.set(team, list)
        }
      }
      // Rows above were built newest-first (most recent 5 kept); reverse each team's list
      // to chronological order so the form bar reads oldest-to-newest, left to right.
      for (const [team, list] of byTeam) byTeam.set(team, [...list].reverse())
      setTeamForm(byTeam)
    }
    loadForm()
    return () => { cancelled = true }
  }, [competitionId])

  // Current real standings — rank, points, goals for/against — not predictions, and only
  // available for pl_2026: it's the only tournament with a synced real-table source
  // (pl_teams, refreshed daily by app/api/pl/standings/route.ts from the actual
  // API-Football table). No equivalent table exists for the World Cup or NFL, so this
  // stays empty (and unrendered) for any other competition.
  const [teamStandings, setTeamStandings] = useState<Map<string, { position: number; points: number; goalsFor: number; goalsAgainst: number }>>(new Map())
  useEffect(() => {
    if (competitionId !== 'pl_2026') { setTeamStandings(new Map()); return }
    let cancelled = false
    async function loadStandings() {
      const supabase = createClient()
      const { data } = await supabase.from('pl_teams').select('name, position, points, goals_for, goals_against')
      if (cancelled) return
      const map = new Map<string, { position: number; points: number; goalsFor: number; goalsAgainst: number }>()
      for (const t of data || []) {
        if (t.position == null) continue
        map.set(t.name, { position: t.position, points: t.points ?? 0, goalsFor: t.goals_for ?? 0, goalsAgainst: t.goals_against ?? 0 })
      }
      setTeamStandings(map)
    }
    loadStandings()
    return () => { cancelled = true }
  }, [competitionId])

  function statsFor(rows: WldPick[]) {
    const hits = rows.filter(p => p.isCorrect).length
    return { hits, total: rows.length, pct: rows.length > 0 ? Math.round((hits / rows.length) * 100) : null }
  }

  const matchesOutcome = (x: WldPick) => selectedOutcome === 'all' || (columns.find(c => c.id === selectedOutcome)?.match(x) ?? false)
  const matchesTeam = (x: WldPick) => selectedTeam === 'all' || x.homeTeam === selectedTeam || x.awayTeam === selectedTeam
  const filterPicks = (rows: WldPick[]) => rows.filter(x => matchesTeam(x) && matchesOutcome(x))

  // "What team am I good at predicting" was the whole reason the old heatmap existed — a
  // sorted bar per team (reacting to the outcome dropdown, ignoring the team dropdown since
  // its job here is "rank every team", not filter down to one) answers it as a picture
  // instead of a grid someone has to scan cell by cell.
  function teamBreakdown(rows: WldPick[]): { team: string; pct: number; hits: number; total: number; picks: WldPick[] }[] {
    const byTeam = new Map<string, WldPick[]>()
    for (const p of rows.filter(matchesOutcome)) {
      for (const t of [p.homeTeam, p.awayTeam]) {
        const list = byTeam.get(t) ?? []
        list.push(p)
        byTeam.set(t, list)
      }
    }
    return [...byTeam.entries()]
      .map(([team, picks]) => ({ team, picks, ...statsFor(picks) }))
      .filter((r): r is { team: string; picks: WldPick[]; pct: number; hits: number; total: number } => r.total > 0 && r.pct != null)
      .sort((a, b) => b.pct - a.pct)
  }

  // A bar's length can only ever say "40%" — it can't say which four games those were.
  // Hover exposes the actual matches so "further detail" is a mouse-rest away instead of
  // a separate click into the drill-down list below.
  function fixtureTitle(picks: WldPick[]): string {
    return [...picks]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(p => `${new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}  ${p.awayTeam} @ ${p.homeTeam} — picked ${predictedTeamLabel(p)} ${p.isCorrect ? '✓' : '✗'}`)
      .join('\n')
  }

  // "Tight games with big favorites, or the opposite" — the exact same closing-odds data
  // already used for the $1-bet simulation splits picks by whether the pick was favored
  // (implied probability ≥ 50%, i.e. odds ≤ 2.0) or the underdog. This is standard practice
  // in prediction-model evaluation (see calibration/reliability analysis, and favorite-
  // longshot-bias studies in sports betting) precisely because raw accuracy alone hides
  // whether someone's hit rate comes from correctly backing chalk or from calling upsets.
  function favoriteUnderdogBreakdown(rows: WldPick[]): { key: 'favorite' | 'underdog'; label: string; pct: number; hits: number; total: number; picks: WldPick[] }[] {
    const buckets: Record<'favorite' | 'underdog', WldPick[]> = { favorite: [], underdog: [] }
    for (const p of rows) {
      const odds = p.predictedWld === 'home' ? p.closingOddsHome : p.predictedWld === 'away' ? p.closingOddsAway : p.closingOddsDraw
      if (odds == null) continue
      buckets[odds <= 2.0 ? 'favorite' : 'underdog'].push(p)
    }
    return (['favorite', 'underdog'] as const)
      .map(key => ({ key, label: key === 'favorite' ? 'picked the favorite' : 'picked the underdog', picks: buckets[key], ...statsFor(buckets[key]) }))
      .filter((b): b is { key: 'favorite' | 'underdog'; label: string; picks: WldPick[]; pct: number; hits: number; total: number } => b.total > 0 && b.pct != null)
  }

  const perPerson = scoped.map(p => ({ ...p, stats: statsFor(filterPicks(p.scoped)) }))

  const selectedTagged = perPerson
    .flatMap(p => filterPicks(p.scoped).map(x => ({ ...x, ownerId: p.id, ownerLabel: p.label })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  let staked = 0
  let netPnl = 0
  let oddsMissing = 0
  for (const p of selectedTagged) {
    const odds = p.predictedWld === 'home' ? p.closingOddsHome : p.predictedWld === 'away' ? p.closingOddsAway : p.closingOddsDraw
    if (odds == null) { oddsMissing++; continue }
    staked += 1
    netPnl += p.isCorrect ? (odds - 1) : -1
  }

  const scopedOwnerIds = new Set(selectedTagged.map(p => p.ownerId))
  const singleOwner = scopedOwnerIds.size === 1 ? perPerson.find(p => p.id === [...scopedOwnerIds][0])?.label ?? null : null
  const hadBet = singleOwner ? (singleOwner === 'you' ? "you'd" : `${singleOwner} had`) : 'the group had'

  const isFiltered = selectedTeam !== 'all' || selectedOutcome !== 'all'
  const outcomeLabel = selectedOutcome === 'all' ? 'any result' : columns.find(c => c.id === selectedOutcome)?.label
  const selectDots: React.CSSProperties = {
    fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 700, color: '#C8102E',
    border: 'none', borderBottom: '1.5px dotted #C8102E', background: 'none',
    padding: '0 2px', cursor: 'pointer', appearance: 'none' as const, WebkitAppearance: 'none' as const,
  }

  // Single person: rank every team they've picked, so the chart answers "what am I good
  // at" directly. Comparing people: rank people instead, at whatever team/outcome the
  // dropdowns above are set to, so the chart answers "who's better at this" directly.
  const teamBars = !isMulti ? teamBreakdown(perPerson[0]?.scoped || []) : []
  const personBars = isMulti
    ? perPerson.filter(p => p.stats.total > 0).map(p => ({ id: p.id, label: p.label, pct: p.stats.pct as number, hits: p.stats.hits, total: p.stats.total, picks: filterPicks(p.scoped) })).sort((a, b) => b.pct - a.pct)
    : []
  const teamContext = selectedTeam !== 'all' ? teamStandings.get(selectedTeam) : undefined
  const teamContextForm = selectedTeam !== 'all' ? teamForm.get(selectedTeam) : undefined
  const favBreakdown = favoriteUnderdogBreakdown(selectedTagged)

  // Bar length is the ONLY channel encoding pct here — color used to also ramp with pct
  // (via hitRateStyle), which meant length, fill color, and the text label all repeated
  // the identical number. Fill is now a flat neutral so color is free to mean something
  // else: the red inset ring for "currently selected", nothing more. Hover exposes the
  // underlying picks (native title tooltip) since a bar alone can't show which games it's made of.
  function BarRow({ label, pct, hits, total, highlighted, onClick, title }: { label: string; pct: number; hits: number; total: number; highlighted: boolean; onClick?: () => void; title?: string }) {
    return (
      <div onClick={onClick} title={title} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2.5px 0', cursor: onClick ? 'pointer' : 'default' }}>
        <span style={{
          width: 100, flexShrink: 0, fontSize: '0.72rem', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          fontWeight: highlighted ? 700 : 400, color: highlighted ? '#111' : '#666',
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 12, background: '#eee', borderRadius: 3, overflow: 'hidden', boxShadow: highlighted ? 'inset 0 0 0 1.5px #C8102E' : 'none' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: highlighted ? '#C8102E' : '#999' }} />
        </div>
        <span style={{ width: 64, flexShrink: 0, fontSize: '0.68rem', color: '#999', textAlign: 'right' as const }}>{pct}% ({hits}/{total})</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.6rem' }}>
        {isMulti ? 'explore picks' : `explore ${people[0].label === 'you' ? 'your' : `${people[0].label}'s`} picks`}
      </div>

      {competitions.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '0.7rem' }}>
          {competitions.map(c => (
            <button key={c.id} onClick={() => { setCompetitionId(c.id); setSelectedTeam('all'); setSelectedOutcome('all') }}
              style={{
                fontSize: '0.75rem', padding: '4px 10px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                borderColor: competitionId === c.id ? '#C8102E' : 'var(--border)',
                background: competitionId === c.id ? '#fff5f5' : 'white',
                color: competitionId === c.id ? '#C8102E' : '#555',
                fontWeight: competitionId === c.id ? 700 : 400,
              }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* The sentence — the two variables (outcome, team) are inline dropdowns, so asking
          a different question is one click, not a re-scan of a grid. */}
      <div style={{ background: '#fafafa', border: '1px solid var(--border-light)', padding: '0.75rem 0.9rem' }}>
        <div style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>
          predicting{' '}
          <select value={selectedOutcome} onChange={e => setSelectedOutcome(e.target.value)} style={selectDots}>
            <option value="all">any result</option>
            {columns.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
          </select>
          {' '}for{' '}
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={selectDots}>
            <option value="all">any team</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.2rem' }}>
          {perPerson.map(p => {
            const name = p.label === 'you' ? 'You' : p.label
            const removable = p.id !== primaryId
            const removeBtn = removable && (
              <span onClick={() => onRemovePerson(p.id)} title={`stop comparing ${name}`}
                style={{ cursor: 'pointer', color: '#ccc', fontWeight: 700, fontSize: '0.8rem', marginLeft: 2 }}>×</span>
            )
            if (p.stats.total === 0) {
              return (
                <div key={p.id} style={{ fontSize: '0.85rem', color: '#bbb', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {name} {p.label === 'you' ? "haven't" : "hasn't"} made a matching pick. {removeBtn}
                </div>
              )
            }
            const style = hitRateStyle(p.stats.pct ?? 0)
            return (
              <div key={p.id} style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' as const }}>
                <span>
                  <span style={{ fontWeight: 700 }}>{name}</span>
                  <span style={{ color: '#888' }}>{p.label === 'you' ? "'re" : "'s"}</span>
                </span>
                {/* Sequential-ramp badge (background + paired text color) rather than
                    using the ramp as bare text color — the light end of that ramp reads
                    fine as a fill with contrasting text, but is nearly invisible as text
                    on this panel's own light background. */}
                <span style={{ fontWeight: 700, background: style.bg, color: style.text, padding: '1px 8px', borderRadius: 4 }}>{p.stats.pct}%</span>
                <span style={{ color: '#888', fontSize: '0.85rem' }}>({p.stats.hits}/{p.stats.total})</span>
                {removeBtn}
              </div>
            )
          })}
          {/* Add a pool-mate right from the sentence — mirrors the standalone "compare"
              panel elsewhere on the page, but inline so comparing someone new doesn't
              require leaving the question you're currently exploring. */}
          {availableToAdd.length > 0 && (
            <div style={{ fontSize: '0.85rem', marginTop: 2 }}>
              <select value="" onChange={e => { if (e.target.value) onAddPerson(e.target.value) }} style={selectDots}>
                <option value="">+ add someone to compare</option>
                {availableToAdd.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* The visualization — updates live as the sentence's dropdowns change. Single
            person: one bar per team, ranked, so "what am I good at" is a shape, not a
            number you have to look up. Comparing people: one bar per person instead, at
            whatever team/outcome is currently selected, so "who's better at this" is
            equally a shape. Clicking a team bar selects it in the sentence above. */}
        {!isMulti && teamBars.length > 0 && (
          <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px dashed var(--border-light)' }}>
            <div style={{ fontSize: '0.68rem', color: '#aaa', marginBottom: 5 }}>
              every team{selectedOutcome !== 'all' ? `, ${outcomeLabel}` : ''} — click a bar to focus it above
            </div>
            {teamBars.map(row => (
              <BarRow key={row.team} label={row.team} pct={row.pct} hits={row.hits} total={row.total}
                highlighted={selectedTeam === row.team} title={fixtureTitle(row.picks)}
                onClick={() => setSelectedTeam(selectedTeam === row.team ? 'all' : row.team)} />
            ))}
          </div>
        )}
        {isMulti && personBars.length > 1 && (
          <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px dashed var(--border-light)' }}>
            <div style={{ fontSize: '0.68rem', color: '#aaa', marginBottom: 5 }}>by person</div>
            {personBars.map(row => (
              <BarRow key={row.id} label={row.label} pct={row.pct} hits={row.hits} total={row.total} highlighted={false} title={fixtureTitle(row.picks)} />
            ))}
          </div>
        )}

        {/* Favorite vs. underdog — the same closing-odds data behind the $1-bet number
            below, split by whether the pick was favored (implied probability ≥ 50%) or
            not. Answers "am I actually good, or just good at picking chalk" — a question
            the plain hit-rate above can't answer on its own. */}
        {favBreakdown.length > 0 && (
          <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px dashed var(--border-light)' }}>
            <div style={{ fontSize: '0.68rem', color: '#aaa', marginBottom: 5 }}>favorite vs. underdog, by closing odds</div>
            {favBreakdown.map(row => (
              <BarRow key={row.key} label={row.label} pct={row.pct} hits={row.hits} total={row.total} highlighted={false} title={fixtureTitle(row.picks)} />
            ))}
          </div>
        )}

        {selectedTeam !== 'all' && (teamContext || (teamContextForm?.length ?? 0) > 0) && (
          <div style={{ marginTop: '0.5rem', paddingTop: '0.45rem', borderTop: '1px dashed var(--border-light)' }}>
            {teamContext && (
              <div style={{ fontSize: '0.72rem', color: '#999', marginBottom: teamContextForm?.length ? 4 : 0 }}>
                #{teamContext.position} · {teamContext.points}pts · GF {teamContext.goalsFor} · GA {teamContext.goalsAgainst}
              </div>
            )}
            {(teamContextForm?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 2 }}>
                {teamContextForm!.map((f, i) => {
                  const c = f.result === 'W' ? { bg: '#2d7a2d', text: 'white' } : f.result === 'L' ? { bg: '#C8102E', text: 'white' } : { bg: '#ccc', text: '#444' }
                  const word = f.result === 'W' ? 'won' : f.result === 'L' ? 'lost' : 'drew'
                  return (
                    <span key={i} title={`${word} vs ${f.opponent} (${f.scoreLabel})`}
                      style={{ width: 16, height: 16, borderRadius: 2, background: c.bg, color: c.text, fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>
                      {f.result}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drill-down — exact picks behind the sentence above */}
      <div style={{ marginTop: '0.85rem', paddingTop: '0.7rem', borderTop: '1px dashed var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {selectedTeam !== 'all' && selectedOutcome !== 'all' ? `${selectedTeam} · ${outcomeLabel}` : selectedTeam !== 'all' ? selectedTeam : selectedOutcome !== 'all' ? outcomeLabel : 'all picks'}
          </span>
          {isFiltered && (
            <button onClick={() => { setSelectedTeam('all'); setSelectedOutcome('all') }}
              style={{ fontSize: '0.7rem', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              clear
            </button>
          )}
        </div>

        {selectedTagged.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>no picks in this selection.</p>
        ) : (
          <>
            {staked > 0 ? (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                <span style={{ fontWeight: 600, color: netPnl >= 0 ? '#2d7a2d' : '#C8102E' }}>{netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}</span>
                <span style={{ color: 'var(--text-dim)' }}> if {hadBet} bet $1 on each of these {staked} picks at closing odds{oddsMissing > 0 ? ` (${oddsMissing} excluded — no odds recorded)` : ''}</span>
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#bbb', marginBottom: '0.6rem' }}>no closing-odds data recorded yet for these picks.</p>
            )}

            <div style={{ border: '1px solid var(--border-light)', maxHeight: 240, overflowY: 'auto' as const }}>
              {selectedTagged.map(p => {
                const odds = p.predictedWld === 'home' ? p.closingOddsHome : p.predictedWld === 'away' ? p.closingOddsAway : p.closingOddsDraw
                const oddsDetail = odds != null ? `closing odds ${odds.toFixed(2)} (${Math.round(100 / odds)}% implied) — ${odds <= 2.0 ? 'favorite' : 'underdog'}` : 'no closing odds recorded'
                return (
                  <div key={`${p.ownerId}:${p.fixtureId}`} title={oddsDetail} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.4rem 0.6rem', borderTop: '1px solid var(--border-light)', fontSize: '0.78rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {p.awayTeam} @ {p.homeTeam} <span style={{ color: '#bbb' }}>· {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{isMulti ? ` · ${p.ownerLabel}` : ''}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ color: '#888' }}>picked {predictedTeamLabel(p)}</span>
                      <span style={{ fontWeight: 600, color: p.isCorrect ? '#2d7a2d' : '#aaa' }}>
                        {p.isCorrect ? '✓' : '✗'}{p.pointsEarned != null ? ` +${p.pointsEarned}` : ''}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// "If your picks were always right" — a simulated Premier League table built entirely
// from each person's own predicted results (not actual ones) for games that have already
// been decided, standard 3/1/0 points. Grows one game at a time as the season plays out.
// With more than one person, each gets their own fully-ranked table stacked below the
// last (divided by a border) rather than merged into shared columns — team order here
// is a real ranking by that person's points, and merging several people's independently-
// ordered rankings into one row set would make the table unreadable as a "standings" list.
function PLHypotheticalTable({ people }: { people: { id: string; label: string; rows: PLTableRow[] }[] }) {
  const isMulti = people.length > 1
  const [open, setOpen] = useState(false)
  const headerLabel = isMulti
    ? `🏆 the PL table if everyone's picks were always right`
    : `🏆 the PL table if ${people[0].label === 'you' ? 'your' : `${people[0].label}'s`} picks were always right`

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb' }}>
          {headerLabel}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && people.map((person, pi) => {
        const possessive = person.label === 'you' ? 'your' : `${person.label}'s`
        return (
          <div key={person.id} style={{ overflowX: 'auto' as const, marginTop: pi === 0 ? '0.6rem' : '1rem', paddingTop: pi === 0 ? 0 : '0.85rem', borderTop: pi === 0 ? 'none' : '1px dashed var(--border-light)' }}>
            {isMulti && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555', marginBottom: '0.4rem' }}>{person.label}</div>}
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
                {person.rows.map((r, i) => (
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
              built from {possessive} predicted results for games decided so far — not the real table.
            </p>
          </div>
        )
      })}
    </div>
  )
}

interface PersonStats {
  sportStats: SportStat[]
  hasPartialCredit: boolean
  soccerPicks: WldPick[]
  nflPicks: WldPick[]
  plHypoTable: PLTableRow[]
}

// Side-by-side sport/category accuracy — the actual "compare" ask: each selected
// person's numbers in their own column, never merged into one shared total. One table
// per sport actually present among the people being compared, plus an "overall" row.
function CompareTable({ people }: { people: { id: string; label: string; sportStats: SportStat[] }[] }) {
  const sportsPresent = SPORT_ORDER.filter(sport => people.some(p => p.sportStats.some(s => s.sport === sport)))

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {sportsPresent.map(sport => {
        const meta = SPORT_META[sport] || { emoji: '🏆', label: sport }

        // Only people with picks in this sport get a column — a sport not everyone's
        // played (F1, say) shouldn't drag in an all-dashes column for whoever hasn't.
        const sportPeople = people.filter(p => p.sportStats.some(s => s.sport === sport))

        // Union of categories across everyone being compared, so a category only one
        // person has picks in still gets a row — it just reads "—" for the others.
        const catMeta = new Map<string, { name: string; sortOrder: number }>()
        for (const p of sportPeople) {
          const s = p.sportStats.find(x => x.sport === sport)
          if (!s) continue
          for (const g of s.groups) for (const c of g.categories) {
            if (!catMeta.has(c.categoryId)) catMeta.set(c.categoryId, { name: c.name, sortOrder: c.sortOrder })
          }
        }
        const cats = [...catMeta.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder)

        function statFor(sportStats: SportStat[], categoryId?: string): { hits: number; total: number } | null {
          const s = sportStats.find(x => x.sport === sport)
          if (!s) return null
          if (!categoryId) return { hits: s.hits, total: s.total }
          const c = s.groups.flatMap(g => g.categories).find(x => x.categoryId === categoryId)
          return c || null
        }

        function cell(sportStats: SportStat[], categoryId: string | undefined, key: string, bold?: boolean) {
          const st = statFor(sportStats, categoryId)
          const pct = st && st.total > 0 ? Math.round((st.hits / st.total) * 100) : null
          const style = pct != null ? hitRateStyle(pct) : { bg: '#f7f7f5', text: '#ccc' }
          return (
            <td key={key} style={{ padding: '5px 10px', textAlign: 'center' as const, background: style.bg, color: style.text, fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' as const }}>
              {st && st.total > 0 ? (bold ? `${pct}%` : `${pct}% (${st.hits}/${st.total})`) : '—'}
            </td>
          )
        }

        return (
          <div key={sport} style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{meta.label}</span>
            </div>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <td style={{ padding: '5px 10px' }} />
                    {sportPeople.map(p => (
                      <td key={p.id} style={{ padding: '5px 10px', textAlign: 'center' as const, fontWeight: 700, color: '#333', whiteSpace: 'nowrap' as const }}>{p.label}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 10px', color: '#888', fontWeight: 600, whiteSpace: 'nowrap' as const }}>overall</td>
                    {sportPeople.map(p => cell(p.sportStats, undefined, p.id, true))}
                  </tr>
                  {cats.map(([categoryId, m]) => (
                    <tr key={categoryId} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '5px 10px', color: '#555', whiteSpace: 'nowrap' as const }}>{m.name}</td>
                      {sportPeople.map(p => cell(p.sportStats, categoryId, p.id))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// "If everyone bet $1 on each pick" — one row per person, summed across every graded
// win/draw/loss pick (soccer + NFL, every competition) that has a recorded closing
// price, not scoped to whichever competition toggle happens to be selected in the
// heatmap below. Sorted by net P&L so it doubles as "who's actually the best bettor."
function MoneyCompareTable({ people }: { people: { id: string; label: string; picks: WldPick[] }[] }) {
  // Raw net P&L rewards volume, not skill — someone who staked 40 picks can show a bigger
  // dollar number than someone who staked 8 purely by having made more picks, even if the
  // second person's bets performed better per-dollar. ROI (net P&L ÷ picks staked, as a
  // percentage) is the normalized, volume-independent comparison — a toggle, not a
  // replacement, since "who actually made/lost the most" is a real question too.
  const [normalized, setNormalized] = useState(false)

  const rows = people.map(p => {
    let staked = 0
    let netPnl = 0
    let oddsMissing = 0
    for (const pk of p.picks) {
      const odds = pk.predictedWld === 'home' ? pk.closingOddsHome : pk.predictedWld === 'away' ? pk.closingOddsAway : pk.closingOddsDraw
      if (odds == null) { oddsMissing++; continue }
      staked += 1
      netPnl += pk.isCorrect ? (odds - 1) : -1
    }
    const roiPct = staked > 0 ? (netPnl / staked) * 100 : 0
    return { id: p.id, label: p.label, staked, netPnl, roiPct, oddsMissing }
  }).filter(r => r.staked > 0).sort((a, b) => normalized ? b.roiPct - a.roiPct : b.netPnl - a.netPnl)

  if (rows.length === 0) return null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' as const, gap: 6 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#bbb' }}>
          if everyone bet $1 on each pick
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', fontSize: '0.68rem' }}>
          <button type="button" onClick={() => setNormalized(false)}
            title="total dollars won or lost"
            style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: !normalized ? '#111' : 'white', color: !normalized ? 'white' : '#888' }}>
            total $
          </button>
          <button type="button" onClick={() => setNormalized(true)}
            title="return per $1 staked — fair when people made different numbers of picks"
            style={{ padding: '3px 8px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', background: normalized ? '#111' : 'white', color: normalized ? 'white' : '#888' }}>
            normalized (ROI)
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' as const }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
          <thead>
            <tr>
              <td style={{ padding: '5px 10px' }} />
              <td style={{ padding: '5px 10px', textAlign: 'center' as const, color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}>picks staked</td>
              <td style={{ padding: '5px 10px', textAlign: 'center' as const, color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                {normalized ? 'ROI per pick' : 'net P&L'}
              </td>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-light)' }}>
                <td style={{ padding: '6px 10px', fontWeight: 700 }}>{r.label}</td>
                <td style={{ padding: '6px 10px', textAlign: 'center' as const, color: '#888' }}>
                  {r.staked}
                  {r.oddsMissing > 0 && <span style={{ color: '#ccc' }}> ({r.oddsMissing} no odds)</span>}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' as const, fontWeight: 700, color: (normalized ? r.roiPct : r.netPnl) >= 0 ? '#2d7a2d' : '#C8102E' }}>
                  {normalized
                    ? `${r.roiPct >= 0 ? '+' : ''}${r.roiPct.toFixed(1)}%`
                    : `${r.netPnl >= 0 ? '+' : ''}$${r.netPnl.toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.7rem', color: '#bbb', marginTop: '0.5rem' }}>
        at closing odds, across every graded win/draw/loss pick with recorded odds.
        {normalized && ' ROI = net P&L ÷ picks staked — comparable even when people made different numbers of picks.'}
      </p>
    </div>
  )
}

// The full prediction-record panel — sport breakdown, picks-explorer heatmap, and the PL
// hypothetical table — for one target user, scoped to a fixed set of pools (the caller
// decides which: every pool the target's in for a self-view, or only the pools shared
// with the viewer for someone else's). Used by /dashboard/profile (self, with a "viewing"
// switcher around it) and /dashboard/u/[userId] (anyone sharing a pool with you).
export default function RecordPanel({ targetUserId, poolIds, subjectLabel, viewerId }: {
  targetUserId: string
  poolIds: string[]
  subjectLabel: string // "you" or the person's display name
  viewerId: string // who's looking at this page — scopes the "compare" candidate list to their own pools
}) {
  const [loading, setLoading] = useState(true)
  // Keyed by user_id — each person's stats are computed independently, never merged, so
  // "compare with roy" shows roy's numbers next to yours rather than a blended total.
  const [statsByUser, setStatsByUser] = useState<Map<string, PersonStats>>(new Map())

  // "Compare" — expands the dataset above from just targetUserId to targetUserId plus
  // whoever's selected here, drawn from every real member across every pool the viewer
  // (not necessarily the target) is in. Candidates are never listed alphabetically —
  // that's an arbitrary order for a page whose whole point is performance, so the
  // default order is by accuracy, with a toggle to sort by pools-shared-with-you instead.
  const [viewerPoolIds, setViewerPoolIds] = useState<string[]>([])
  const [compareCandidates, setCompareCandidates] = useState<CompareCandidate[]>([])
  const [selectedCompareIds, setSelectedCompareIds] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSort, setCompareSort] = useState<'accuracy' | 'pools'>('accuracy')

  useEffect(() => {
    setSelectedCompareIds(new Set())
  }, [targetUserId])

  useEffect(() => {
    if (!viewerId) return
    async function loadCandidates() {
      const supabase = createClient()
      const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', viewerId),
        supabase.from('pool_members').select('pool_id').eq('user_id', viewerId),
      ])
      const vpIds = [...new Set([...(adminPools || []).map(p => p.id), ...(memberRows || []).map(m => m.pool_id)])]
      setViewerPoolIds(vpIds)
      if (vpIds.length === 0) { setCompareCandidates([]); return }

      const [{ data: allMembers }, { data: allGhosts }, { data: gradedPreds }] = await Promise.all([
        supabase.from('pool_members').select('user_id, pool_id, display_name').in('pool_id', vpIds).neq('user_id', viewerId),
        // Ghosts are candidates too — predictions_v2.user_id already accepts a
        // ghost_entries.id (see the scoring routes/RecordPanel's own query below), so the
        // accuracy query right after this already counts their picks with no changes.
        supabase.from('ghost_entries').select('id, pool_id, name').in('pool_id', vpIds),
        supabase.from('predictions_v2').select('user_id, is_correct').in('pool_id', vpIds).not('points_earned', 'is', null),
      ])

      const poolsByUser = new Map<string, Set<string>>()
      const nameByUser = new Map<string, string>()
      for (const m of allMembers || []) {
        nameByUser.set(m.user_id, m.display_name)
        if (!poolsByUser.has(m.user_id)) poolsByUser.set(m.user_id, new Set())
        poolsByUser.get(m.user_id)!.add(m.pool_id)
      }
      for (const g of allGhosts || []) {
        if (!g.pool_id) continue
        nameByUser.set(g.id, `${g.name}*`)
        if (!poolsByUser.has(g.id)) poolsByUser.set(g.id, new Set())
        poolsByUser.get(g.id)!.add(g.pool_id)
      }

      // Rough accuracy for ordering purposes only — is_correct rather than the exact
      // partial-credit reconstruction used for the real stats below, since this is just
      // deciding list order, not a number shown anywhere.
      const hitsByUser = new Map<string, { hits: number; total: number }>()
      for (const p of gradedPreds || []) {
        const row = hitsByUser.get(p.user_id) || { hits: 0, total: 0 }
        row.total += 1
        if (p.is_correct) row.hits += 1
        hitsByUser.set(p.user_id, row)
      }

      const candidates: CompareCandidate[] = [...nameByUser.entries()].map(([id, name]) => {
        const h = hitsByUser.get(id)
        return {
          id, name,
          sharedPoolCount: poolsByUser.get(id)?.size || 0,
          hitRatePct: h && h.total > 0 ? Math.round((h.hits / h.total) * 100) : null,
        }
      })
      setCompareCandidates(candidates)
    }
    loadCandidates()
  }, [viewerId])

  const compareKey = [...selectedCompareIds].sort().join(',')
  const effectiveUserIds = [targetUserId, ...selectedCompareIds]
  const effectivePoolIds = selectedCompareIds.size > 0 ? viewerPoolIds : poolIds

  useEffect(() => {
    if (!targetUserId || effectivePoolIds.length === 0) { setLoading(false); return }
    async function load() {
      setLoading(true)
      const supabase = createClient()

      const [{ data: preds }, { data: categories }, { data: poolRules }, { data: pools }] = await Promise.all([
        supabase.from('predictions_v2')
          .select('pool_id, category_id, points_earned, is_correct, fixture_id, value_wld, user_id')
          .in('user_id', effectiveUserIds)
          .in('pool_id', effectivePoolIds)
          .not('points_earned', 'is', null),
        supabase.from('ruleset_categories').select('id, sport, name, sort_order'),
        supabase.from('pool_rules').select('pool_id, category_id, points, bonus_points').in('pool_id', effectivePoolIds),
        supabase.from('pools').select('id, tournament_id').in('id', effectivePoolIds),
      ])

      const categoryMap = new Map((categories || []).map(c => [c.id, c]))
      const poolToTournament = new Map((pools || []).map(p => [p.id, p.tournament_id]))
      const tournamentIds = [...new Set((pools || []).map(p => p.tournament_id))]
      const { data: tournaments } = tournamentIds.length
        ? await supabase.from('tournaments').select('id, name, status').in('id', tournamentIds)
        : { data: [] as { id: string; name: string; status: string }[] }
      const tournamentMap = new Map((tournaments || []).map(t => [t.id, t]))

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

      // WLD fixtures (soccer_result / nfl_result picks) — fetched once for the union of
      // everyone being looked at, then split back out per person below in
      // buildPersonStats. "Explore your picks" and the PL hypothetical table are
      // inherently single-person views (each is its own heatmap/table), so unlike the
      // sport/category breakdown below (which genuinely compares side by side), these
      // stay scoped to whichever person is currently focused.
      const allWldFixtureIds = [...new Set(
        (preds || [])
          .filter(p => (p.category_id === 'soccer_result' || p.category_id === 'nfl_result') && p.fixture_id != null)
          .map(p => p.fixture_id as number)
      )]
      const { data: wldFixtures } = allWldFixtureIds.length
        ? await supabase.from('fixtures')
            .select('id, tournament_id, home_team, away_team, date, home_score, away_score, status, closing_odds_home, closing_odds_draw, closing_odds_away')
            .in('id', allWldFixtureIds)
        : { data: [] as any[] }
      const fixtureMap = new Map((wldFixtures || []).map(f => [f.id, f]))

      type PredRow = NonNullable<typeof preds>[number]
      const predsByUser = new Map<string, PredRow[]>()
      for (const p of preds || []) {
        if (!predsByUser.has(p.user_id)) predsByUser.set(p.user_id, [])
        predsByUser.get(p.user_id)!.push(p)
      }

      // Everything below runs once per person being looked at (just the target when not
      // comparing) — each person's dedup, WLD picks, PL hypothetical table, and
      // sport/category breakdown are computed entirely from their own predictions_v2
      // rows, never mixed with anyone else's.
      function buildPersonStats(userPreds: PredRow[]): PersonStats {
        // Deduped by fixture_id — a user in several pools for the same tournament makes
        // one predictions_v2 row per pool for the same real-world match, which would
        // otherwise count that one match's pick multiple times here (verified: one user
        // had 15 rows on a single fixture from 15 different pools). Every pool-level
        // pick is still fully counted in the per-sport hit-rate section below; this
        // dedup is scoped to just the picks explorer/hypothetical-table, where the unit
        // is "a real match," not "a pool's copy of a prediction."
        const seenFixture: Record<'soccer' | 'nfl', Set<number>> = { soccer: new Set(), nfl: new Set() }
        const wldPicksBySport: Record<'soccer' | 'nfl', WldPick[]> = { soccer: [], nfl: [] }
        for (const p of userPreds) {
          const sportKey = p.category_id === 'soccer_result' ? 'soccer' : p.category_id === 'nfl_result' ? 'nfl' : null
          if (!sportKey || p.fixture_id == null || !p.value_wld) continue
          if (seenFixture[sportKey].has(p.fixture_id)) continue
          seenFixture[sportKey].add(p.fixture_id)
          const f = fixtureMap.get(p.fixture_id)
          if (!f) continue
          wldPicksBySport[sportKey].push({
            fixtureId: f.id,
            tournamentId: f.tournament_id,
            homeTeam: f.home_team,
            awayTeam: f.away_team,
            date: f.date,
            predictedWld: p.value_wld as 'home' | 'away' | 'draw',
            isCorrect: !!p.is_correct,
            pointsEarned: p.points_earned,
            closingOddsHome: f.closing_odds_home,
            closingOddsDraw: f.closing_odds_draw,
            closingOddsAway: f.closing_odds_away,
          })
        }

        // PL hypothetical table — one row per team with a graded pl_2026 prediction so
        // far, tallied from predicted (not actual) results using standard 3/1/0 points.
        // Only decided games count — a game predicted but not yet played doesn't add a
        // "phantom" result to either team's tally.
        const plTableMap = new Map<string, { team: string; w: number; d: number; l: number; pts: number; played: number }>()
        function bump(team: string, outcome: 'w' | 'd' | 'l') {
          const row = plTableMap.get(team) || { team, w: 0, d: 0, l: 0, pts: 0, played: 0 }
          row.played += 1
          if (outcome === 'w') { row.w += 1; row.pts += 3 }
          else if (outcome === 'd') { row.d += 1; row.pts += 1 }
          else row.l += 1
          plTableMap.set(team, row)
        }
        for (const p of wldPicksBySport.soccer) {
          if (p.tournamentId !== 'pl_2026') continue
          if (p.predictedWld === 'home') { bump(p.homeTeam, 'w'); bump(p.awayTeam, 'l') }
          else if (p.predictedWld === 'away') { bump(p.awayTeam, 'w'); bump(p.homeTeam, 'l') }
          else { bump(p.homeTeam, 'd'); bump(p.awayTeam, 'd') }
        }
        const plHypoTable = [...plTableMap.values()].sort((a, b) => b.pts - a.pts || b.w - a.w)

        const bySport: Record<string, Record<string, CategoryStat>> = {}
        const byCompetition: Record<string, Record<string, { hits: number; total: number }>> = {}
        let sawPartialCredit = false

        for (const p of userPreds) {
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

        const sportStats: SportStat[] = Object.entries(bySport).map(([sport, cats]) => {
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

        return { sportStats, hasPartialCredit: sawPartialCredit, soccerPicks: wldPicksBySport.soccer, nflPicks: wldPicksBySport.nfl, plHypoTable }
      }

      const newStatsByUser = new Map<string, PersonStats>()
      for (const uid of effectiveUserIds) {
        newStatsByUser.set(uid, buildPersonStats(predsByUser.get(uid) || []))
      }

      setStatsByUser(newStatsByUser)
      setLoading(false)
    }
    load()
  }, [targetUserId, poolIds, compareKey, viewerPoolIds])

  // Collapsed by default beyond the first sport — a member with picks across several
  // sports otherwise dumps every category breakdown, heatmap, and hypothetical table on
  // screen at once. `null` means "not yet touched by the user" so the first sport still
  // defaults open once stats load, without needing an effect to seed real state.
  const [openSports, setOpenSports] = useState<Set<string> | null>(null)
  function toggleSport(sport: string, defaultSport: string | undefined) {
    setOpenSports(prev => {
      const base = prev ?? new Set(defaultSport ? [defaultSport] : [])
      const next = new Set(base)
      if (next.has(sport)) next.delete(sport); else next.add(sport)
      return next
    })
  }

  // Only blank the page on a true first load (no data at all yet) — a compare-selection
  // change re-triggers this same fetch and flips loading back to true, but replacing
  // already-visible content with a two-line placeholder collapses the page height out
  // from under the reader's scroll position, which is what made "select someone to
  // compare" feel like it was jumping back to the top every time. A background refresh
  // just dims what's already there instead.
  if (loading && statsByUser.size === 0) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>
  }

  const otherCandidates = compareCandidates.filter(c => c.id !== targetUserId)
  const availableToAdd = otherCandidates.filter(c => !selectedCompareIds.has(c.id)).map(c => ({ id: c.id, name: c.name }))
  const addComparePerson = (id: string) => setSelectedCompareIds(prev => new Set(prev).add(id))
  const removeComparePerson = (id: string) => setSelectedCompareIds(prev => { const next = new Set(prev); next.delete(id); return next })
  const sortedCandidates = [...otherCandidates].sort((a, b) => {
    if (compareSort === 'accuracy') {
      const diff = (b.hitRatePct ?? -1) - (a.hitRatePct ?? -1)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    }
    const diff = b.sharedPoolCount - a.sharedPoolCount
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
  const isComparing = selectedCompareIds.size > 0

  function labelFor(uid: string): string {
    if (uid === targetUserId) return subjectLabel
    return otherCandidates.find(c => c.id === uid)?.name || 'them'
  }

  const totalPicks = [...statsByUser.values()].reduce((sum, ps) => sum + ps.sportStats.reduce((s, x) => s + x.total, 0), 0)
  const possessiveCaps = subjectLabel === 'you' ? 'Your' : `${subjectLabel}'s`
  // Union of sports anyone currently in view has data for, in the app's canonical order —
  // when not comparing this is just the target's own sports (effectiveUserIds has one
  // entry), so this collapses to the exact same list as before.
  const sportsPresent = SPORT_ORDER.filter(sport => effectiveUserIds.some(uid => statsByUser.get(uid)?.sportStats.some(s => s.sport === sport)))
  const effectiveOpenSports = openSports ?? new Set(sportsPresent[0] ? [sportsPresent[0]] : [])

  const compareBlock = otherCandidates.length > 0 && (
    <div style={{ marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
      <div onClick={() => setCompareOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', cursor: 'pointer', background: '#fafafa' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#888' }}>
          compare{isComparing ? ` (${selectedCompareIds.size})` : ''}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>{compareOpen ? '▲' : '▼'}</span>
      </div>

      {!compareOpen && isComparing && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, padding: '0.6rem 0.85rem', borderTop: '1px solid var(--border-light)' }}>
          {otherCandidates.filter(c => selectedCompareIds.has(c.id)).map(c => (
            <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '3px 8px', background: '#fff5f5', border: '1px solid #C8102E', color: '#C8102E' }}>
              {c.name}
              <span onClick={() => setSelectedCompareIds(prev => { const next = new Set(prev); next.delete(c.id); return next })}
                style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
            </span>
          ))}
        </div>
      )}

      {compareOpen && (
        <div style={{ padding: '0.7rem 0.85rem', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
            {(['accuracy', 'pools'] as const).map(mode => (
              <button key={mode} onClick={() => setCompareSort(mode)}
                style={{
                  fontSize: '0.72rem', padding: '3px 9px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: compareSort === mode ? '#C8102E' : 'var(--border)',
                  background: compareSort === mode ? '#fff5f5' : 'white',
                  color: compareSort === mode ? '#C8102E' : '#666',
                  fontWeight: compareSort === mode ? 700 : 400,
                }}>
                {mode === 'accuracy' ? 'sort by accuracy' : 'sort by pools shared'}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', borderBottom: '1px solid var(--border-light)', marginBottom: '0.3rem' }}>
            <input type="checkbox"
              checked={selectedCompareIds.size === otherCandidates.length}
              onChange={() => setSelectedCompareIds(selectedCompareIds.size === otherCandidates.length ? new Set() : new Set(otherCandidates.map(c => c.id)))} />
            everyone
          </label>

          <div style={{ maxHeight: 220, overflowY: 'auto' as const }}>
            {sortedCandidates.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.35rem 0', fontSize: '0.8rem', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={selectedCompareIds.has(c.id)}
                    onChange={() => setSelectedCompareIds(prev => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next })} />
                  {c.name}
                </span>
                <span style={{ color: '#aaa', fontSize: '0.72rem' }}>
                  {compareSort === 'accuracy' ? (c.hitRatePct != null ? `${c.hitRatePct}%` : 'no picks yet') : `${c.sharedPoolCount} pool${c.sharedPoolCount === 1 ? '' : 's'}`}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (totalPicks === 0) {
    return (
      <div>
        {compareBlock}
        <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          {subjectLabel === 'you' ? 'no scored picks yet — check back once games kick off.' : `${subjectLabel} doesn't have any scored picks yet.`}
        </div>
      </div>
    )
  }

  const comparePeople = effectiveUserIds.map(uid => ({ id: uid, label: labelFor(uid), sportStats: statsByUser.get(uid)?.sportStats || [] }))
  const anyPartialCredit = effectiveUserIds.some(uid => statsByUser.get(uid)?.hasPartialCredit)

  // Builds one sport's picks-explorer person list — every selected person's picks for
  // that sport, skipping anyone with none, plus the union of competitions they're
  // spread across (so the toggle covers every tournament anyone here has picks in).
  function explorerPeopleFor(sport: 'soccer' | 'nfl'): { people: ExplorerPerson[]; competitions: { id: string; name: string; status: string }[] } {
    const people: ExplorerPerson[] = effectiveUserIds
      .map(uid => {
        const ps = statsByUser.get(uid)
        const picks = sport === 'soccer' ? ps?.soccerPicks : ps?.nflPicks
        return { id: uid, label: labelFor(uid), picks: picks || [] }
      })
      .filter(p => p.picks.length > 0)

    const seenComps = new Map<string, { id: string; name: string; status: string }>()
    for (const uid of effectiveUserIds) {
      const s = statsByUser.get(uid)?.sportStats.find(x => x.sport === sport)
      if (!s) continue
      for (const c of s.competitions) {
        if (!seenComps.has(c.tournamentId) && people.some(p => p.picks.some(pk => pk.tournamentId === c.tournamentId))) {
          seenComps.set(c.tournamentId, { id: c.tournamentId, name: c.name, status: c.status })
        }
      }
    }
    return { people, competitions: [...seenComps.values()] }
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      {compareBlock}

      {isComparing && <CompareTable people={comparePeople} />}

      {isComparing && (
        <MoneyCompareTable people={effectiveUserIds.map(uid => {
          const ps = statsByUser.get(uid)
          return { id: uid, label: labelFor(uid), picks: [...(ps?.soccerPicks || []), ...(ps?.nflPicks || [])] }
        })} />
      )}

      {sportsPresent.map(sport => {
        const meta = SPORT_META[sport] || { emoji: '🏆', label: sport }
        const soloStat = !isComparing ? statsByUser.get(targetUserId)?.sportStats.find(s => s.sport === sport) : undefined
        const isOpen = effectiveOpenSports.has(sport)
        return (
          <section key={sport} style={{ marginBottom: '2rem' }}>
            <div onClick={() => toggleSport(sport, sportsPresent[0])} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
              <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{meta.label}</span>
              {soloStat && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{soloStat.total > 0 ? Math.round((soloStat.hits / soloStat.total) * 100) : 0}% · {soloStat.hits}/{soloStat.total}</span>}
              <div style={{ flex: 1, borderTop: '1px solid var(--border-light)' }} />
              <span style={{ fontSize: '0.75rem', color: '#888' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && <>
            {soloStat && soloStat.competitions.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
                {soloStat.competitions.map(c => {
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

            {/* Skip the per-category breakdown while comparing — CompareTable above
                already shows this same information, side by side, for everyone. */}
            {soloStat && soloStat.groups.map(group => (
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

            {sport === 'soccer' && (() => {
              const { people, competitions } = explorerPeopleFor('soccer')
              return people.length > 0 && <PicksExplorer people={people} defaultColumns={HOME_DRAW_AWAY_COLUMNS} competitions={competitions}
                primaryId={targetUserId} availableToAdd={availableToAdd} onAddPerson={addComparePerson} onRemovePerson={removeComparePerson} />
            })()}
            {sport === 'soccer' && (() => {
              const plPeople = effectiveUserIds
                .map(uid => ({ id: uid, label: labelFor(uid), rows: statsByUser.get(uid)?.plHypoTable || [] }))
                .filter(p => p.rows.length > 0)
              return plPeople.length > 0 && <PLHypotheticalTable people={plPeople} />
            })()}
            {sport === 'nfl' && (() => {
              const { people, competitions } = explorerPeopleFor('nfl')
              return people.length > 0 && <PicksExplorer people={people} defaultColumns={HOME_AWAY_COLUMNS} competitions={competitions}
                primaryId={targetUserId} availableToAdd={availableToAdd} onAddPerson={addComparePerson} onRemovePerson={removeComparePerson} />
            })()}
            </>}
          </section>
        )
      })}

      {anyPartialCredit && (
        <p style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '1rem' }}>
          exact-score and podium-order picks award partial credit toward {isComparing ? 'pool totals' : (subjectLabel === 'you' ? 'your' : `${subjectLabel}'s`) + ' pool total'} even when not fully right — a "hit" here only counts the fully-correct ones, so it can read lower than {isComparing ? 'actual' : (possessiveCaps === 'Your' ? 'your' : 'their')} points in those pools.
        </p>
      )}
    </div>
  )
}
