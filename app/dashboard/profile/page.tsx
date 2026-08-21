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

interface OutcomeColumn { id: string; label: string; match: (p: WldPick) => boolean }

function predictedTeamLabel(p: WldPick): string {
  if (p.predictedWld === 'draw') return 'draw'
  return p.predictedWld === 'home' ? p.homeTeam : p.awayTeam
}

type PickSelection =
  | { kind: 'all' }
  | { kind: 'team'; team: string }
  | { kind: 'outcome'; outcome: string }
  | { kind: 'cell'; team: string; outcome: string }

// Team × predicted-outcome heatmap over a sport's graded W/D/L picks — built to be
// scanned for patterns (which teams/outcomes you're best or worst at calling) rather
// than looked up one filter at a time. Click any row, column, or cell to drill into the
// exact picks behind it, including a $1-per-pick P&L using closing odds.
function PicksExplorer({ picks, defaultColumns, competitions, subjectLabel }: {
  picks: WldPick[]
  defaultColumns: OutcomeColumn[] // this sport's normal breakdown, e.g. home/draw/away
  competitions: { id: string; name: string; status: string }[] // only the ones this user actually has picks in
  subjectLabel: string // "you" or the member's name being viewed, for copy like "if you'd bet..."
}) {
  const possessive = subjectLabel === 'you' ? 'your' : `${subjectLabel}'s`
  const hadBet = subjectLabel === 'you' ? "you'd" : `${subjectLabel} had`
  const [selection, setSelection] = useState<PickSelection>({ kind: 'all' })
  const [competitionId, setCompetitionId] = useState<string>(() => {
    // Default to a currently-active competition over a finished one (a completed World
    // Cup run has way more accumulated picks than a season just getting started, but
    // it's not the one worth landing on) — most-picks is just the tiebreak among
    // active competitions, or the fallback if none are active.
    const counts = new Map<string, number>()
    for (const p of picks) counts.set(p.tournamentId, (counts.get(p.tournamentId) || 0) + 1)
    const byPickCount = (a: string, b: string) => (counts.get(b) || 0) - (counts.get(a) || 0)
    const active = competitions.filter(c => c.status === 'active').map(c => c.id).sort(byPickCount)
    if (active.length > 0) return active[0]
    const allIds = competitions.map(c => c.id).sort(byPickCount)
    return allIds[0] || competitions[0]?.id || ''
  })

  const scopedPicks = picks.filter(p => p.tournamentId === competitionId)
  const columns = NEUTRAL_VENUE_TOURNAMENTS.has(competitionId) ? SINGLE_RESULT_COLUMN : defaultColumns
  const teams = [...new Set(scopedPicks.flatMap(p => [p.homeTeam, p.awayTeam]))].sort()

  function statsFor(rows: WldPick[]) {
    const hits = rows.filter(p => p.isCorrect).length
    return { hits, total: rows.length, pct: rows.length > 0 ? Math.round((hits / rows.length) * 100) : null }
  }

  const selectedPicks = scopedPicks.filter(p => {
    if (selection.kind === 'team') return p.homeTeam === selection.team || p.awayTeam === selection.team
    if (selection.kind === 'outcome') return columns.find(c => c.id === selection.outcome)?.match(p) ?? false
    if (selection.kind === 'cell') return (p.homeTeam === selection.team || p.awayTeam === selection.team) && (columns.find(c => c.id === selection.outcome)?.match(p) ?? false)
    return true
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const { hits, total, pct } = statsFor(selectedPicks)

  let staked = 0
  let netPnl = 0
  let oddsMissing = 0
  for (const p of selectedPicks) {
    const odds = p.predictedWld === 'home' ? p.closingOddsHome : p.predictedWld === 'away' ? p.closingOddsAway : p.closingOddsDraw
    if (odds == null) { oddsMissing++; continue }
    staked += 1
    netPnl += p.isCorrect ? (odds - 1) : -1
  }

  const selectionLabel = selection.kind === 'all' ? 'all picks'
    : selection.kind === 'team' ? selection.team
    : selection.kind === 'outcome' ? `picked ${columns.find(c => c.id === selection.outcome)?.label}`
    : `${selection.team} · ${columns.find(c => c.id === selection.outcome)?.label}`

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.15rem' }}>explore {possessive} picks</div>
      <div style={{ fontSize: '0.72rem', color: '#bbb', marginBottom: '0.55rem' }}>click a team, a result, or a cell to drill in</div>

      {competitions.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '0.7rem' }}>
          {competitions.map(c => (
            <button key={c.id} onClick={() => { setCompetitionId(c.id); setSelection({ kind: 'all' }) }}
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

      {/* Sequential legend — one hue, light→dark, no series to name so no legend box */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.7rem', fontSize: '0.65rem', color: '#999' }}>
        <span>hit rate</span>
        <span style={{ width: 90, height: 8, borderRadius: 2, background: `linear-gradient(to right, ${hitRateStyle(0).bg}, ${hitRateStyle(100).bg})`, border: '1px solid var(--border-light)' }} />
        <span>0% → 100%</span>
      </div>

      <div style={{ overflowX: 'auto' as const }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <td style={{ padding: '3px 8px' }} />
              {columns.map(col => {
                const active = selection.kind === 'outcome' && selection.outcome === col.id
                return (
                  <td key={col.id} onClick={() => setSelection(active ? { kind: 'all' } : { kind: 'outcome', outcome: col.id })}
                    style={{ padding: '3px 8px', textAlign: 'center' as const, cursor: 'pointer', color: active ? '#111' : '#888', fontWeight: active ? 700 : 500, textDecoration: active ? 'underline' : 'none', whiteSpace: 'nowrap' as const }}>
                    {col.label}
                  </td>
                )
              })}
              {columns.length > 1 && <td style={{ padding: '3px 8px', textAlign: 'center' as const, color: '#ccc' }}>all</td>}
            </tr>
          </thead>
          <tbody>
            {teams.map(team => {
              const rowActive = selection.kind === 'team' && selection.team === team
              const rowStats = statsFor(scopedPicks.filter(p => p.homeTeam === team || p.awayTeam === team))
              return (
                <tr key={team}>
                  <td onClick={() => setSelection(rowActive ? { kind: 'all' } : { kind: 'team', team })}
                    style={{ padding: '3px 8px', cursor: 'pointer', color: rowActive ? '#111' : '#333', fontWeight: rowActive ? 700 : 500, textDecoration: rowActive ? 'underline' : 'none', whiteSpace: 'nowrap' as const }}>
                    {team}
                  </td>
                  {columns.map(col => {
                    const cellStats = statsFor(scopedPicks.filter(p => (p.homeTeam === team || p.awayTeam === team) && col.match(p)))
                    const cellActive = selection.kind === 'cell' && selection.team === team && selection.outcome === col.id
                    const style = cellStats.pct != null ? hitRateStyle(cellStats.pct) : { bg: '#f7f7f5', text: '#ccc' }
                    return (
                      <td key={col.id}
                        onClick={() => cellStats.total > 0 && setSelection(cellActive ? { kind: 'all' } : { kind: 'cell', team, outcome: col.id })}
                        title={cellStats.total > 0 ? `${team} · ${col.label}: ${cellStats.hits}/${cellStats.total} (${cellStats.pct}%)` : `${team} · ${col.label}: no picks`}
                        style={{
                          padding: '6px 10px', textAlign: 'center' as const, minWidth: 56,
                          cursor: cellStats.total > 0 ? 'pointer' : 'default',
                          background: style.bg, color: style.text,
                          fontWeight: cellActive ? 700 : 400,
                          boxShadow: cellActive ? 'inset 0 0 0 2px #C8102E' : 'none',
                        }}>
                        {cellStats.total > 0 ? `${cellStats.hits}/${cellStats.total}` : '—'}
                      </td>
                    )
                  })}
                  {columns.length > 1 && <td style={{ padding: '6px 10px', textAlign: 'center' as const, color: '#888' }}>{rowStats.total > 0 ? `${rowStats.hits}/${rowStats.total}` : '—'}</td>}
                </tr>
              )
            })}
            {columns.length > 1 && (
              <tr>
                <td style={{ padding: '4px 8px', color: '#ccc' }}>all</td>
                {columns.map(col => {
                  const colStats = statsFor(scopedPicks.filter(col.match))
                  return <td key={col.id} style={{ padding: '4px 8px', textAlign: 'center' as const, color: '#888' }}>{colStats.total > 0 ? `${colStats.hits}/${colStats.total}` : '—'}</td>
                })}
                <td style={{ padding: '4px 8px', textAlign: 'center' as const, color: '#ccc' }}>{scopedPicks.filter(p => p.isCorrect).length}/{scopedPicks.length}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drill-down — exact values behind whatever's selected above */}
      <div style={{ marginTop: '0.85rem', paddingTop: '0.7rem', borderTop: '1px dashed var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{selectionLabel}</span>
          {selection.kind !== 'all' && (
            <button onClick={() => setSelection({ kind: 'all' })}
              style={{ fontSize: '0.7rem', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              clear selection
            </button>
          )}
        </div>

        {total === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>no picks in this selection.</p>
        ) : (
          <>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 600, color: pct != null && pct >= 50 ? '#2d7a2d' : 'var(--text-dim)' }}>{pct}%</span>
              <span style={{ color: 'var(--text-dim)' }}> ({hits}/{total} correct)</span>
            </div>
            {staked > 0 ? (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                <span style={{ fontWeight: 600, color: netPnl >= 0 ? '#2d7a2d' : '#C8102E' }}>{netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}</span>
                <span style={{ color: 'var(--text-dim)' }}> if {hadBet} bet $1 on each of these {staked} picks at closing odds{oddsMissing > 0 ? ` (${oddsMissing} excluded — no odds recorded)` : ''}</span>
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#bbb', marginBottom: '0.6rem' }}>no closing-odds data recorded yet for these picks.</p>
            )}

            <div style={{ border: '1px solid var(--border-light)', maxHeight: 240, overflowY: 'auto' as const }}>
              {selectedPicks.map(p => (
                <div key={p.fixtureId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.4rem 0.6rem', borderTop: '1px solid var(--border-light)', fontSize: '0.78rem' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {p.awayTeam} @ {p.homeTeam} <span style={{ color: '#bbb' }}>· {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ color: '#888' }}>picked {predictedTeamLabel(p)}</span>
                    <span style={{ fontWeight: 600, color: p.isCorrect ? '#2d7a2d' : '#aaa' }}>
                      {p.isCorrect ? '✓' : '✗'}{p.pointsEarned != null ? ` +${p.pointsEarned}` : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// "If your picks were always right" — a simulated Premier League table built entirely
// from the user's own predicted results (not actual ones) for games that have already
// been decided, standard 3/1/0 points. Grows one game at a time as the season plays out.
function PLHypotheticalTable({ rows, subjectLabel }: { rows: PLTableRow[]; subjectLabel: string }) {
  const possessive = subjectLabel === 'you' ? 'your' : `${subjectLabel}'s`
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb' }}>
          🏆 the PL table if {possessive} picks were always right
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
            built from {possessive} predicted results for games decided so far — not the real table.
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

  // "Viewing" — defaults to your own record, but anyone sharing a pool with you can be
  // selected instead. This intentionally exposes nothing new: any pool member can
  // already see every other member's picks per-fixture in that pool's "everyone's
  // picks" tables (F1SessionsList, FixturesList, etc.) — this just aggregates the same
  // already-visible data into the same views as your own record, for a shared pool.
  // Ghost entries aren't selectable — they don't have a profile of their own to view.
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [poolIds, setPoolIds] = useState<string[]>([])
  const [otherMembers, setOtherMembers] = useState<{ id: string; name: string }[]>([])
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)

  // Establish who's logged in, which pools they're in, and who else shares those pools.
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', user.id),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
      ])
      const ids = [...new Set([
        ...(adminPools || []).map(p => p.id),
        ...(memberRows || []).map(m => m.pool_id),
      ])]

      setViewerId(user.id)
      setPoolIds(ids)
      setViewingUserId(user.id)

      if (ids.length > 0) {
        const { data: allMembers } = await supabase
          .from('pool_members')
          .select('user_id, display_name')
          .in('pool_id', ids)
          .neq('user_id', user.id)
        const seen = new Set<string>()
        const others: { id: string; name: string }[] = []
        for (const m of allMembers || []) {
          if (seen.has(m.user_id)) continue
          seen.add(m.user_id)
          others.push({ id: m.user_id, name: m.display_name })
        }
        setOtherMembers(others.sort((a, b) => a.name.localeCompare(b.name)))
      }
    }
    init()
  }, [])

  // Loads the full record for whichever user is currently selected, scoped to only the
  // pools the viewer themselves belongs to (so switching to someone else's record can
  // never surface a pool the viewer isn't actually in with them).
  useEffect(() => {
    if (!viewingUserId || poolIds.length === 0) { if (viewingUserId) setLoading(false); return }
    async function load(targetUserId: string) {
      setLoading(true)
      const supabase = createClient()

      const [{ data: preds }, { data: categories }, { data: poolRules }, { data: pools }] = await Promise.all([
        supabase.from('predictions_v2')
          .select('pool_id, category_id, points_earned, is_correct, fixture_id, value_wld')
          .eq('user_id', targetUserId)
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
      // The hypothetical table below deliberately reuses this same graded-only set too —
      // "if my picks were always right" tallies only games that have actually been
      // decided so far, not speculative future picks (a table entry only exists once a
      // real result exists to compare it against).
      // Deduped by fixture_id — a user in several pools for the same tournament makes
      // one predictions_v2 row per pool for the same real-world match, which would
      // otherwise count that one match's pick multiple times here (verified: one user
      // had 15 rows on a single fixture from 15 different pools). Every pool-level pick
      // is still fully counted in the per-sport hit-rate section above; this dedup is
      // scoped to just the picks explorer/hypothetical-table, where the unit is "a real
      // match," not "a pool's copy of a prediction."
      const seenFixture: Record<'soccer' | 'nfl', Set<number>> = { soccer: new Set(), nfl: new Set() }
      const wldPredsBySport: Record<string, typeof preds> = { soccer: [], nfl: [] }
      for (const p of preds || []) {
        const sportKey = p.category_id === 'soccer_result' ? 'soccer' : p.category_id === 'nfl_result' ? 'nfl' : null
        if (!sportKey || p.fixture_id == null) continue
        if (seenFixture[sportKey].has(p.fixture_id)) continue
        seenFixture[sportKey].add(p.fixture_id)
        wldPredsBySport[sportKey]!.push(p)
      }

      const allWldFixtureIds = [...new Set([
        ...wldPredsBySport.soccer!.map(p => p.fixture_id as number),
        ...wldPredsBySport.nfl!.map(p => p.fixture_id as number),
      ])]

      const { data: wldFixtures } = allWldFixtureIds.length
        ? await supabase.from('fixtures')
            .select('id, tournament_id, home_team, away_team, date, home_score, away_score, status, closing_odds_home, closing_odds_draw, closing_odds_away')
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
            date: f.date,
            predictedWld: p.value_wld as 'home' | 'away' | 'draw',
            isCorrect: !!p.is_correct,
            pointsEarned: p.points_earned,
            closingOddsHome: f.closing_odds_home,
            closingOddsDraw: f.closing_odds_draw,
            closingOddsAway: f.closing_odds_away,
          })
        }
      }

      // PL hypothetical table — one row per team with a graded pl_2026 prediction so far,
      // tallied from predicted (not actual) results using standard 3/1/0 points. Only
      // decided games count — a game the user predicted but hasn't happened yet doesn't
      // add a "phantom" result to either team's tally.
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
    load(viewingUserId)
  }, [viewingUserId, poolIds])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  const totalPicks = sportStats.reduce((sum, s) => sum + s.total, 0)
  const isSelf = viewingUserId === viewerId
  const viewingName = isSelf ? null : otherMembers.find(m => m.id === viewingUserId)?.name || 'this member'

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>{isSelf ? 'your record' : `${viewingName}'s record`}</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          {isSelf ? "your prediction accuracy across every pool you've played" : `${viewingName}'s prediction accuracy across every pool you share`}, broken down by sport and prop.
        </p>
      </div>

      {otherMembers.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, marginBottom: '1.5rem' }}>
          <button onClick={() => setViewingUserId(viewerId)}
            style={{
              fontSize: '0.78rem', padding: '4px 10px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
              borderColor: isSelf ? '#C8102E' : 'var(--border)',
              background: isSelf ? '#fff5f5' : 'white',
              color: isSelf ? '#C8102E' : '#555',
              fontWeight: isSelf ? 700 : 400,
            }}>
            you
          </button>
          {otherMembers.map(m => {
            const active = viewingUserId === m.id
            return (
              <button key={m.id} onClick={() => setViewingUserId(m.id)}
                style={{
                  fontSize: '0.78rem', padding: '4px 10px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: active ? '#C8102E' : 'var(--border)',
                  background: active ? '#fff5f5' : 'white',
                  color: active ? '#C8102E' : '#555',
                  fontWeight: active ? 700 : 400,
                }}>
                {m.name}
              </button>
            )
          })}
        </div>
      )}

      {totalPicks === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          {isSelf ? 'no scored picks yet — check back once games kick off.' : `${viewingName} doesn't have any scored picks yet.`}
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
                  <PicksExplorer picks={soccerPicks} defaultColumns={HOME_DRAW_AWAY_COLUMNS} subjectLabel={isSelf ? 'you' : (viewingName || 'this member')}
                    competitions={s.competitions.filter(c => soccerPicks.some(p => p.tournamentId === c.tournamentId)).map(c => ({ id: c.tournamentId, name: c.name, status: c.status }))} />
                )}
                {s.sport === 'soccer' && plHypoTable.length > 0 && (
                  <PLHypotheticalTable rows={plHypoTable} subjectLabel={isSelf ? 'you' : (viewingName || 'this member')} />
                )}
                {s.sport === 'nfl' && nflPicks.length > 0 && (
                  <PicksExplorer picks={nflPicks} defaultColumns={HOME_AWAY_COLUMNS} subjectLabel={isSelf ? 'you' : (viewingName || 'this member')}
                    competitions={s.competitions.filter(c => nflPicks.some(p => p.tournamentId === c.tournamentId)).map(c => ({ id: c.tournamentId, name: c.name, status: c.status }))} />
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
