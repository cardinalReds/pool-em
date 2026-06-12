'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WC_SQUADS } from '@/lib/wc_squads'

interface Fixture {
  id: number
  date: string
  home_team: string
  away_team: string
  venue: string
  city: string
  status: string
  home_score: number | null
  away_score: number | null
  round: string
  first_scorer_name: string | null
  odds_home: number | null
  odds_draw: number | null
  odds_away: number | null
  line_total_goals: number | null
  line_total_corners: number | null
  line_card_points: number | null
  line_asian_handicap_home: number | null
  line_asian_handicap_away: number | null
}

// One row per category per fixture in predictions_v2
interface PredV2 {
  id?: string
  pool_id: string
  user_id: string
  fixture_id: number
  category_id: string
  value_wld: string | null
  value_number: number | null
  value_text: string | null
  value_ou: string | null
  value_yesno: boolean | null
  points_earned: number | null
  is_correct: boolean | null
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
  input_type: string
  name: string
  requires_line: boolean
  prediction_type: string  // 'per_game' | 'per_round'
}

const FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czechia': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Australia': '🇦🇺', 'Türkiye': '🇹🇷', 'Brazil': '🇧🇷', 'Morocco': '🇲🇦',
  'Germany': '🇩🇪', 'Curaçao': '🇨🇼', 'Netherlands': '🇳🇱', 'Japan': '🇯🇵',
  'Sweden': '🇸🇪', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'France': '🇫🇷', 'Senegal': '🇸🇳',
  'Iraq': '🇮🇶', 'Norway': '🇳🇴', 'Argentina': '🇦🇷', 'Algeria': '🇩🇿',
  'Austria': '🇦🇹', 'Jordan': '🇯🇴', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Portugal': '🇵🇹', 'Congo DR': '🇨🇩',
  'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸',
  'Poland': '🇵🇱', 'Chile': '🇨🇱', 'Venezuela': '🇻🇪', 'Nigeria': '🇳🇬',
  'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨', 'Peru': '🇵🇪', 'Costa Rica': '🇨🇷',
  'Jamaica': '🇯🇲', 'Honduras': '🇭🇳',
}

function formatPT(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: '2-digit',
  }) + ' PT'
}

function formatDatePT(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// Keyed as `${fixtureId}:${categoryId}` → PredV2
type PredMap = Record<string, PredV2>

// For exact score we store home/away separately in local state
// key: `${fixtureId}:${categoryId}:home` / `:away`
type ScoreInputMap = Record<string, string>

// PlayerSearch component — outside FixturesList to avoid remount
const POSITION_ORDER = ['Attacker', 'Midfielder', 'Defender', 'Goalkeeper']

function PlayerDropdown({ value, onChange, disabled, homeTeam, awayTeam }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  homeTeam: string
  awayTeam: string
}) {
  function getPlayers(team: string) {
    return (WC_SQUADS[team] || [])
      .slice()
      .sort((a, b) => {
        const ai = POSITION_ORDER.indexOf(a.position)
        const bi = POSITION_ORDER.indexOf(b.position)
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return a.name.localeCompare(b.name)
      })
  }

  const homePlayers = getPlayers(homeTeam)
  const awayPlayers = getPlayers(awayTeam)

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', border: '1px solid #ddd', padding: '8px',
        fontSize: '14px', fontFamily: 'inherit',
        background: disabled ? '#fafafa' : 'white', minHeight: 44,
      }}
    >
      <option value="">select player...</option>
      {homePlayers.length > 0 && (
        <optgroup label={homeTeam}>
          {homePlayers.map(p => (
            <option key={p.name} value={p.name}>{p.name} ({p.position})</option>
          ))}
        </optgroup>
      )}
      {awayPlayers.length > 0 && (
        <optgroup label={awayTeam}>
          {awayPlayers.map(p => (
            <option key={p.name} value={p.name}>{p.name} ({p.position})</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export default function FixturesList({
  poolId, userId, packageId, deadlineType, tournamentId,
}: {
  poolId: string
  userId: string
  packageId: string
  deadlineType: string
  scope?: string
  tournamentId?: string
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<PredMap>({})
  const [memberPreds, setMemberPreds] = useState<PredMap>({})
  const [members, setMembers] = useState<Record<string, string>>({})
  const [scoreInputs, setScoreInputs] = useState<ScoreInputMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [roundSpecialPicks, setRoundSpecialPicks] = useState<Record<string, Record<string, string>>>({})
  const [roundSpecialSaving, setRoundSpecialSaving] = useState<string | null>(null)
  const [roundSpecialSaved, setRoundSpecialSaved] = useState<Record<string, boolean>>({})
  const [sortMode, setSortMode] = useState<'date' | 'group' | 'round'>('date')
  const [viewMode, setViewMode] = useState<'pages' | 'list'>('pages')
  const [currentPage, setCurrentPage] = useState(0)

  const isCustom = packageId?.toUpperCase() === 'CUSTOM'
  const hasPerGame = poolRules.some(r => r.prediction_type === 'per_game')
  const hasPerRound = poolRules.some(r => r.prediction_type === 'per_round')
  const onlyRoundSpecials = isCustom && hasPerRound && !hasPerGame

  // Auto-switch to round view if only round specials
  useEffect(() => {
    if (onlyRoundSpecials) { setSortMode('round'); setCurrentPage(0) }
  }, [onlyRoundSpecials])

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Fixtures
      const res = await fetch(`/api/fixtures?tournament_id=${tournamentId || 'wc_2026'}`)
      const data = await res.json()
      setFixtures(data.fixtures || [])

      if (isCustom) {
        // Load pool_rules joined with ruleset_categories for input_type etc.
        const { data: rules } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points, ruleset_categories(name, input_type, requires_line, prediction_type)')
          .eq('pool_id', poolId)

        const mapped: PoolRule[] = (rules || []).map((r: any) => ({
          category_id: r.category_id,
          points: r.points,
          bonus_points: r.bonus_points ?? 0,
          name: r.ruleset_categories?.name ?? r.category_id,
          input_type: r.ruleset_categories?.input_type ?? 'wld',
          requires_line: r.ruleset_categories?.requires_line ?? false,
          prediction_type: r.ruleset_categories?.prediction_type ?? 'per_game',
        }))
        setPoolRules(mapped)

        // Load predictions_v2
        const { data: v2preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', poolId)
          .eq('user_id', userId)

        const predMap: PredMap = {}
        const scoreMap: ScoreInputMap = {}
        ;(v2preds || []).forEach((p: PredV2) => {
          predMap[`${p.fixture_id}:${p.category_id}`] = p
          // Restore exact score inputs
          if (p.value_text?.includes('-')) {
            const [h, a] = p.value_text.split('-')
            scoreMap[`${p.fixture_id}:${p.category_id}:home`] = h
            scoreMap[`${p.fixture_id}:${p.category_id}:away`] = a
          }
        })
        setPreds(predMap)
        setScoreInputs(scoreMap)

        // Load round special picks (no fixture_id)
        const roundPicks: Record<string, Record<string, string>> = {}
        ;(v2preds || []).filter((p: any) => !p.fixture_id && p.matchday).forEach((p: any) => {
          if (!roundPicks[p.matchday]) roundPicks[p.matchday] = {}
          roundPicks[p.matchday][p.category_id] = p.value_text || p.value_wld || ''
        })
        setRoundSpecialPicks(roundPicks)

        // Fetch all members' display names
        const { data: memberRows } = await supabase
          .from('pool_members')
          .select('user_id, display_name')
          .eq('pool_id', poolId)
        const memberMap: Record<string, string> = {}
        ;(memberRows || []).forEach((m: any) => { memberMap[m.user_id] = m.display_name })
        setMembers(memberMap)

        // Fetch all members' picks for locked/finished fixtures (everyone's picks, not just ours)
        const { data: allPreds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', poolId)
        const allPredMap: PredMap = {}
        ;(allPreds || []).forEach((p: PredV2) => {
          allPredMap[`${p.user_id}:${p.fixture_id}:${p.category_id}`] = p
        })
        setMemberPreds(allPredMap)
      } else {
        // Legacy: load from predictions table
        const { data: legacyPreds } = await supabase
          .from('predictions')
          .select('*')
          .eq('pool_id', poolId)
          .eq('user_id', userId)

        // Shim into PredMap using synthetic category ids
        const predMap: PredMap = {}
        ;(legacyPreds || []).forEach((p: any) => {
          if (p.predicted_result) {
            predMap[`${p.fixture_id}:legacy_result`] = {
              pool_id: poolId, user_id: userId, fixture_id: p.fixture_id,
              category_id: 'legacy_result',
              value_wld: p.predicted_result, value_number: null, value_text: null,
              value_ou: null, value_yesno: null,
              points_earned: p.points_earned, is_correct: null,
            }
          }
        })
        setPreds(predMap)
      }

      setLoading(false)
    }
    load()
  }, [poolId, userId, isCustom])

  // Update local state only — no DB write until save button pressed
  const updateLocal = useCallback((
    fixtureId: number,
    categoryId: string,
    fields: Partial<PredV2>,
  ) => {
    const key = `${fixtureId}:${categoryId}`
    setPreds(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { pool_id: poolId, user_id: userId, fixture_id: fixtureId, category_id: categoryId, points_earned: null, is_correct: null }),
        ...fields,
      } as PredV2,
    }))
    // Clear saved confirmation when picks change
    setSaved(prev => ({ ...prev, [fixtureId]: false }))
  }, [poolId, userId])

  // Write all categories for a fixture to DB at once
  const saveFixture = useCallback(async (fixtureId: number) => {
    setSaving(fixtureId)
    const supabase = createClient()
    const perGameRules = poolRules.filter(r => r.prediction_type === 'per_game')
    const rows = perGameRules.map(rule => {
      const key = `${fixtureId}:${rule.category_id}`
      const pred = preds[key]
      return {
        pool_id: poolId,
        user_id: userId,
        fixture_id: fixtureId,
        category_id: rule.category_id,
        value_wld: pred?.value_wld ?? null,
        value_number: pred?.value_number ?? null,
        value_text: pred?.value_text ?? null,
        value_ou: pred?.value_ou ?? null,
        value_yesno: pred?.value_yesno ?? null,
        submitted_at: new Date().toISOString(),
      }
    }).filter(r =>
      r.value_wld || r.value_text || r.value_ou || r.value_yesno !== null
    )

    if (rows.length > 0) {
      await supabase.from('predictions_v2').upsert(rows, {
        onConflict: 'pool_id,user_id,fixture_id,category_id',
      })
    }

    setSaving(null)
    setSaved(prev => ({ ...prev, [fixtureId]: true }))
    // Clear confirmation after 3 seconds
    setTimeout(() => setSaved(prev => ({ ...prev, [fixtureId]: false })), 3000)
  }, [poolId, userId, poolRules, preds])

  function isLocked(f: Fixture) {
    if (deadlineType === 'before_tournament') return false
    return new Date(f.date) <= new Date()
  }

  function totalPointsForFixture(fixtureId: number): number | null {
    const keys = Object.keys(preds).filter(k => k.startsWith(`${fixtureId}:`))
    const pts = keys.map(k => preds[k]?.points_earned ?? 0)
    if (pts.length === 0 || pts.every(p => p === 0 && preds[keys[0]]?.points_earned === null)) return null
    return pts.reduce((a, b) => a + b, 0)
  }

  // ── Matchday round definitions ──────────────────────────────────────────
  const MATCHDAY_ROUNDS = [
    { id: 'round_1', label: 'Round 1', start: '2026-06-11', end: '2026-06-17' },
    { id: 'round_2', label: 'Round 2', start: '2026-06-18', end: '2026-06-23' },
    { id: 'round_3', label: 'Round 3', start: '2026-06-24', end: '2026-06-27' },
    { id: 'round_of_32', label: 'Round of 32', start: '2026-06-28', end: '2026-07-03' },
    { id: 'round_of_16', label: 'Round of 16', start: '2026-07-04', end: '2026-07-07' },
    { id: 'quarter_final', label: 'Quarter-finals', start: '2026-07-09', end: '2026-07-11' },
    { id: 'semi_final', label: 'Semi-finals', start: '2026-07-14', end: '2026-07-15' },
    { id: 'bronze_final', label: 'Bronze Final', start: '2026-07-18', end: '2026-07-18' },
    { id: 'final', label: 'Final', start: '2026-07-19', end: '2026-07-19' },
  ]
  function getRoundId(iso: string) {
    return MATCHDAY_ROUNDS.find(r => iso >= r.start && iso <= r.end)?.id ?? null
  }

  // ── Sorted + paged ──────────────────────────────────────────────────────
  const sorted = [...fixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const dateMap: Record<string, Fixture[]> = {}
  const dateIsoMap: Record<string, string> = {}
  const groupMap: Record<string, Fixture[]> = {}
  const roundMap: Record<string, Fixture[]> = {}
  sorted.forEach(f => {
    const day = formatDatePT(f.date)
    const iso = f.date.slice(0, 10)
    if (!dateMap[day]) { dateMap[day] = []; dateIsoMap[day] = iso }
    dateMap[day].push(f)
    if (!groupMap[f.round]) groupMap[f.round] = []
    groupMap[f.round].push(f)
    const rid = getRoundId(iso)
    if (rid) { if (!roundMap[rid]) roundMap[rid] = []; roundMap[rid].push(f) }
  })
  const pages = sortMode === 'date'
    ? Object.entries(dateMap).map(([label, fx]) => ({ label, isoDate: dateIsoMap[label], roundId: null as string | null, sub: `${fx.length} game${fx.length > 1 ? 's' : ''}`, fixtures: fx }))
    : sortMode === 'round'
    ? MATCHDAY_ROUNDS.filter(r => roundMap[r.id]?.length > 0).map(r => ({ label: r.label, isoDate: r.start, roundId: r.id, sub: `${roundMap[r.id]?.length ?? 0} games`, fixtures: roundMap[r.id] || [] }))
    : Object.entries(groupMap).map(([label, fx]) => ({ label, isoDate: null as string | null, roundId: null as string | null, sub: [...new Set(fx.flatMap(f => [f.home_team, f.away_team]))].slice(0, 4).join(' · '), fixtures: fx }))
  const totalPages = pages.length
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1))

  // ── Round specials save ────────────────────────────────────────────────────
  async function saveRoundSpecials(matchday: string) {
    setRoundSpecialSaving(matchday)
    const supabase = createClient()
    const picks = roundSpecialPicks[matchday] || {}
    for (const [categoryId, value] of Object.entries(picks)) {
      if (!value) continue
      const { data: existing } = await supabase
        .from('predictions_v2')
        .select('id')
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .eq('category_id', categoryId)
        .eq('matchday', matchday)
        .is('fixture_id', null)
        .maybeSingle()
      const row: any = { pool_id: poolId, user_id: userId, fixture_id: null, category_id: categoryId, matchday, value_text: value, submitted_at: new Date().toISOString() }
      if (existing?.id) await supabase.from('predictions_v2').update(row).eq('id', existing.id)
      else await supabase.from('predictions_v2').insert(row)
    }
    setRoundSpecialSaving(null)
    setRoundSpecialSaved(prev => ({ ...prev, [matchday]: true }))
    setTimeout(() => setRoundSpecialSaved(prev => ({ ...prev, [matchday]: false })), 3000)
  }

  // ── Round Specials Card ────────────────────────────────────────────────────
  function RoundSpecialsCard({ matchday, locked }: { matchday: string; locked: boolean }) {
    const roundRules = poolRules.filter(r => r.prediction_type === 'per_round')
    if (roundRules.length === 0) return null
    const picks = roundSpecialPicks[matchday] || {}
    const [braceTeam, setBraceTeam] = useState('')
    const allTeams = Object.keys(WC_SQUADS).sort()

    function updatePick(categoryId: string, value: string) {
      setRoundSpecialPicks(prev => ({ ...prev, [matchday]: { ...(prev[matchday] || {}), [categoryId]: value } }))
    }

    return (
      <div style={{ background: 'white', border: '1px solid #e0e0db', borderLeft: '3px solid #111', marginBottom: 8 }}>
        <div style={{ background: '#f9f9f9', padding: '6px 10px', borderBottom: '1px solid #e0e0db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#555' }}>round specials</span>
          <span style={{ fontSize: '10px', color: '#aaa' }}>one pick per round</span>
        </div>
        <div style={{ padding: '10px' }}>
          {roundRules.map(rule => {
            const val = picks[rule.category_id] || ''
            const isBrace = rule.category_id === 'soccer_brace_round' || rule.input_type === 'player'
            return (
              <div key={rule.category_id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{rule.name}</span>
                  <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                </div>
                {isBrace ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={braceTeam} disabled={locked} onChange={e => setBraceTeam(e.target.value)}
                      style={{ flex: 1, border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                      <option value="">select team...</option>
                      {allTeams.map(t => <option key={t} value={t}>{FLAGS[t] || ''} {t}</option>)}
                    </select>
                    <select value={val} disabled={locked || !braceTeam} onChange={e => updatePick(rule.category_id, e.target.value)}
                      style={{ flex: 1, border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                      <option value="">select player...</option>
                      {(WC_SQUADS[braceTeam] || []).map(p => <option key={p.name} value={p.name}>{p.name} ({p.position})</option>)}
                    </select>
                  </div>
                ) : (
                  <select value={val} disabled={locked} onChange={e => updatePick(rule.category_id, e.target.value)}
                    style={{ width: '100%', border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                    <option value="">select team...</option>
                    {allTeams.map(t => <option key={t} value={t}>{FLAGS[t] || ''} {t}</option>)}
                  </select>
                )}
              </div>
            )
          })}
          {!locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => saveRoundSpecials(matchday)} disabled={roundSpecialSaving === matchday}
                style={{ padding: '8px 20px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                {roundSpecialSaving === matchday ? 'saving...' : 'save round picks'}
              </button>
              {roundSpecialSaved[matchday] && <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ saved</span>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Per-category input inside a fixture card ─────────────────────────────
  function CategoryInput({ fixture, rule }: { fixture: Fixture; rule: PoolRule }) {
    const key = `${fixture.id}:${rule.category_id}`
    const pred = preds[key]
    const locked = isLocked(fixture)
    const finished = fixture.status === 'FT'
    const isExact = rule.input_type === 'exact'

    const btnStyle = (val: string | boolean): React.CSSProperties => {
      const active = pred?.value_wld === val || pred?.value_ou === val
      return {
        flex: 1, padding: '8px 4px', fontSize: '12px', border: '1px solid',
        cursor: locked || finished ? 'default' : 'pointer',
        fontFamily: 'inherit', minHeight: 44,
        borderColor: active ? '#C8102E' : '#ddd',
        background: active ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
        color: active ? 'white' : '#555',
        opacity: locked && !active ? 0.6 : 1,
      }
    }

    // Points feedback
    const feedback = finished && pred?.points_earned !== null && pred?.points_earned !== undefined ? (
      <span style={{ fontSize: '10px', color: pred.points_earned > 0 ? '#2d7a2d' : '#aaa', marginLeft: 6 }}>
        {pred.points_earned > 0 ? `+${pred.points_earned} pts` : '✗'}
      </span>
    ) : null

    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{rule.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {rule.requires_line && !finished && (() => {
              let line: number | null = null
              if (rule.category_id === 'soccer_total_goals_ou') line = fixture.line_total_goals
              else if (rule.category_id === 'soccer_total_corners_ou') line = fixture.line_total_corners
              else if (rule.category_id === 'soccer_card_points_ou') line = fixture.line_card_points
              else if (rule.category_id === 'soccer_asian_handicap') line = fixture.line_asian_handicap_home
              if (line != null) return null // line shown inline on buttons
              return <span style={{ fontSize: '9px', color: '#bbb', fontStyle: 'italic' }}>line TBD 24h before</span>
            })()}
            {feedback}
          </div>
        </div>

        {/* WLD */}
        {rule.input_type === 'wld' &&
          rule.category_id !== 'soccer_first_team_score' &&
          rule.category_id !== 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {FLAGS[fixture.home_team]} {fixture.home_team}
                {rule.category_id === 'soccer_asian_handicap' && fixture.line_asian_handicap_home != null && (
                  <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 3 }}>
                    ({fixture.line_asian_handicap_home > 0 ? '+' : ''}{fixture.line_asian_handicap_home})
                  </span>
                )}
              </span>
            </button>
            {rule.category_id !== 'soccer_asian_handicap' && (
              <button style={{ ...btnStyle('draw'), borderRight: 'none', flexShrink: 0, flex: '0 0 60px' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'draw' })}>
                draw
              </button>
            )}
            <button style={{ ...btnStyle('away'), overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {fixture.away_team} {FLAGS[fixture.away_team]}
                {rule.category_id === 'soccer_asian_handicap' && fixture.line_asian_handicap_away != null && (
                  <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 3 }}>
                    ({fixture.line_asian_handicap_away > 0 ? '+' : ''}{fixture.line_asian_handicap_away})
                  </span>
                )}
              </span>
            </button>
          </div>
        )}

        {/* First team to score */}
        {rule.category_id === 'soccer_first_team_score' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {FLAGS[fixture.home_team]} {fixture.home_team}
              </span>
            </button>
            <button style={{ ...btnStyle('none' as any), borderRight: 'none', flexShrink: 0, flex: '0 0 70px' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
              no goal
            </button>
            <button style={{ ...btnStyle('away'), overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {fixture.away_team} {FLAGS[fixture.away_team]}
              </span>
            </button>
          </div>
        )}

        {/* First yellow card */}
        {rule.category_id === 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {FLAGS[fixture.home_team]} {fixture.home_team}
              </span>
            </button>
            <button style={{ ...btnStyle('none' as any), borderRight: 'none', flexShrink: 0, flex: '0 0 70px' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
              no card
            </button>
            <button style={{ ...btnStyle('away'), overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                {fixture.away_team} {FLAGS[fixture.away_team]}
              </span>
            </button>
          </div>
        )}

        {/* Over / Under */}
        {rule.input_type === 'ou' && (() => {
          // Pick the right line based on category
          let line: number | null = null
          if (rule.category_id === 'soccer_total_goals_ou') line = fixture.line_total_goals
          else if (rule.category_id === 'soccer_total_corners_ou') line = fixture.line_total_corners
          else if (rule.category_id === 'soccer_card_points_ou') line = fixture.line_card_points
          const lineLabel = line != null ? line.toString() : '—'
          return (
            <div style={{ display: 'flex', gap: 0 }}>
              <button style={{ ...btnStyle('over'), borderRight: 'none' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'over' })}>
                over {lineLabel}
              </button>
              <button style={btnStyle('under')}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'under' })}>
                under {lineLabel}
              </button>
            </div>
          )
        })()}

        {/* Exact score */}
        {isExact && (() => {
          const homeKey = `${fixture.id}:${rule.category_id}:home`
          const awayKey = `${fixture.id}:${rule.category_id}:away`
          const homeVal = scoreInputs[homeKey] ?? ''
          const awayVal = scoreInputs[awayKey] ?? ''
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <input
                type="number" min="0" max="15"
                value={homeVal}
                placeholder="0"
                disabled={locked || finished}
                style={{ width: 52, border: '1px solid #ddd', padding: '8px 4px', textAlign: 'center', fontSize: '16px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white' }}
                onChange={e => {
                  const v = e.target.value
                  setScoreInputs(prev => {
                    const away = prev[awayKey] ?? ''
                    const newInputs = { ...prev, [homeKey]: v }
                    const combined = `${v}-${away}`
                    updateLocal(fixture.id, rule.category_id, { value_text: combined })
                    return newInputs
                  })
                }}
              />
              <span style={{ color: '#aaa' }}>–</span>
              <input
                type="number" min="0" max="15"
                value={awayVal}
                placeholder="0"
                disabled={locked || finished}
                style={{ width: 52, border: '1px solid #ddd', padding: '8px 4px', textAlign: 'center', fontSize: '16px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white' }}
                onChange={e => {
                  const v = e.target.value
                  setScoreInputs(prev => {
                    const home = prev[homeKey] ?? ''
                    const newInputs = { ...prev, [awayKey]: v }
                    const combined = `${home}-${v}`
                    updateLocal(fixture.id, rule.category_id, { value_text: combined })
                    return newInputs
                  })
                }}
              />
              {finished && fixture.home_score !== null && (
                <span style={{ fontSize: '10px', color: '#aaa', marginLeft: 4 }}>
                  actual: {fixture.home_score}–{fixture.away_score}
                </span>
              )}
            </div>
          )
        })()}

        {/* Yes / No */}
        {rule.input_type === 'yesno' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button
              style={{ ...btnStyle(true), borderRight: 'none',
                borderColor: pred?.value_yesno === true ? '#C8102E' : '#ddd',
                background: pred?.value_yesno === true ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
                color: pred?.value_yesno === true ? 'white' : '#555',
              }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: true })}>
              yes
            </button>
            <button
              style={{ ...btnStyle(false),
                borderColor: pred?.value_yesno === false ? '#C8102E' : '#ddd',
                background: pred?.value_yesno === false ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
                color: pred?.value_yesno === false ? 'white' : '#555',
              }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: false })}>
              no
            </button>
          </div>
        )}

        {/* Player dropdown */}
        {rule.input_type === 'player' && (
          <PlayerDropdown
            value={pred?.value_text || ''}
            disabled={locked || finished}
            homeTeam={fixture.home_team}
            awayTeam={fixture.away_team}
            onChange={v => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: v })}
          />
        )}

        {/* Team text */}
        {rule.input_type === 'team' && (
          <input
            value={pred?.value_text || ''}
            placeholder="team name..."
            disabled={locked || finished}
            style={{ width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white', boxSizing: 'border-box' }}
            onChange={e => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: e.target.value })}
          />
        )}
      </div>
    )
  }

  function formatPickValue(pred: PredV2 | undefined, rule: PoolRule, fixture: Fixture): string {
    if (!pred) return '—'
    if (rule.input_type === 'wld' || rule.category_id === 'soccer_first_team_score' || rule.category_id === 'soccer_first_yellow_team') {
      if (!pred.value_wld) return '—'
      if (pred.value_wld === 'home') return `${FLAGS[fixture.home_team] || ''} ${fixture.home_team}`
      if (pred.value_wld === 'away') return `${fixture.away_team} ${FLAGS[fixture.away_team] || ''}`
      if (pred.value_wld === 'draw') return 'draw'
      if (pred.value_wld === 'none') return rule.category_id === 'soccer_first_yellow_team' ? 'no card' : 'no goal'
      return pred.value_wld
    }
    if (rule.input_type === 'exact') return pred.value_text || '—'
    if (rule.input_type === 'ou') return pred.value_ou ? `${pred.value_ou}` : '—'
    if (rule.input_type === 'yesno') return pred.value_yesno === null ? '—' : pred.value_yesno ? 'yes' : 'no'
    if (rule.input_type === 'player' || rule.input_type === 'team') return pred.value_text || '—'
    return '—'
  }

  // ── Fixture card ─────────────────────────────────────────────────────────
  function FixtureCard({ fixture }: { fixture: Fixture }) {
    const locked = isLocked(fixture)
    const finished = fixture.status === 'FT'
    const isLive = fixture.status === 'live'
    const perGameRules = poolRules.filter(r => r.prediction_type === 'per_game')
    const hasAnyPick = perGameRules.some(r => {
      const p = preds[`${fixture.id}:${r.category_id}`]
      return p?.value_wld || p?.value_ou || p?.value_text || p?.value_yesno !== null
    })
    const totalPts = totalPointsForFixture(fixture.id)
    const [showMemberPicks, setShowMemberPicks] = useState(false)

    useEffect(() => {
      const hasPlayerRule = perGameRules.some(r => r.input_type === 'player')
    }, [fixture.id])

    return (
      <div style={{
        background: 'white',
        border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
        borderLeft: isLive ? '4px solid #2d7a2d' : hasAnyPick ? '3px solid #C8102E' : '1px solid #e0e0db',
        marginBottom: 4,
        width: '100%',
      }}>

        {/* Live banner */}
        {isLive && (
          <div style={{ background: '#2d7a2d', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
              LIVE
            </span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>{fixture.city}</span>
          </div>
        )}

        {/* Meta row */}
        {!isLive && (
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid #f0f0f0',
            fontSize: '10px', color: '#aaa',
          }}>
            <span>{formatPT(fixture.date)}</span>
            <span>{fixture.city}</span>
            {totalPts !== null && (
              <span style={{ color: totalPts > 0 ? '#C8102E' : '#aaa', fontWeight: 600 }}>
                {totalPts > 0 ? `+${totalPts} pts` : '0 pts'}
              </span>
            )}
            {locked && !finished && <span style={{ color: '#aaa' }}>locked</span>}
          </div>
        )}

        {/* Team header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: perGameRules.length > 0 ? '1px solid #f5f5f5' : 'none', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{FLAGS[fixture.home_team]} {fixture.home_team}</span>
          {(finished || isLive)
            ? <span style={{ fontWeight: 700, fontSize: isLive ? '18px' : '14px', color: isLive ? '#2d7a2d' : '#111', flexShrink: 0, padding: '0 8px' }}>{fixture.home_score} – {fixture.away_score}</span>
            : <span style={{ fontSize: '11px', color: '#ccc', flexShrink: 0, padding: '0 8px' }}>vs</span>
          }
          <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, textAlign: 'right' as const }}>{fixture.away_team} {FLAGS[fixture.away_team]}</span>
        </div>

        {/* Per-game predictions */}
        {perGameRules.length > 0 && (
          <div style={{ padding: '8px 10px' }}>
            {perGameRules.map(rule => (
              <CategoryInput key={rule.category_id} fixture={fixture} rule={rule} />
            ))}
            {!locked && !finished && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => saveFixture(fixture.id)}
                  disabled={saving === fixture.id || !hasAnyPick}
                  style={{
                    padding: '10px 20px', fontSize: '13px', fontWeight: 600,
                    background: saving === fixture.id ? '#ddd' : hasAnyPick ? '#111' : '#ddd',
                    color: 'white', border: 'none', cursor: hasAnyPick && saving !== fixture.id ? 'pointer' : 'default',
                    fontFamily: 'inherit', minHeight: 44, flex: 1,
                  }}>
                  {saving === fixture.id ? 'saving...' : 'save picks'}
                </button>
                {saved[fixture.id] && (
                  <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ picks saved</span>
                )}
              </div>
            )}

            {/* Member picks comparison — visible once locked or live */}
            {(locked || finished || isLive) && Object.keys(members).length > 0 && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb' }}>
                    everyone's picks
                  </div>
                  {isLive && (
                    <button onClick={() => setShowMemberPicks(p => !p)}
                      style={{ fontSize: '10px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {showMemberPicks ? 'hide' : 'show'}
                    </button>
                  )}
                </div>
                {(!isLive || showMemberPicks) && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}></td>
                        {perGameRules.map(rule => (
                          <td key={rule.category_id} style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const, textAlign: 'center' as const }}>
                            {rule.name}
                          </td>
                        ))}
                        {finished && <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>pts</td>}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(members).map(([memberId, displayName]) => {
                        const isMe = memberId === userId
                        const memberTotalPts = perGameRules.reduce((sum, rule) => {
                          const p = memberPreds[`${memberId}:${fixture.id}:${rule.category_id}`]
                          return sum + (p?.points_earned ?? 0)
                        }, 0)
                        return (
                          <tr key={memberId} style={{ background: isMe ? '#fff5f5' : 'transparent' }}>
                            <td style={{ padding: '4px 6px', fontWeight: isMe ? 700 : 400, color: isMe ? '#C8102E' : '#555', whiteSpace: 'nowrap' as const, borderTop: '1px solid #f5f5f5' }}>
                              {displayName}{isMe ? ' (you)' : ''}
                            </td>
                            {perGameRules.map(rule => {
                              const p = memberPreds[`${memberId}:${fixture.id}:${rule.category_id}`]
                              const isCorrect = p?.is_correct
                              return (
                                <td key={rule.category_id} style={{
                                  padding: '4px 6px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
                                  borderTop: '1px solid #f5f5f5',
                                  color: finished ? (isCorrect ? '#2d7a2d' : isCorrect === false ? '#aaa' : '#555') : '#555',
                                }}>
                                  {formatPickValue(p, rule, fixture)}
                                  {finished && isCorrect && <span style={{ marginLeft: 3 }}>✓</span>}
                                </td>
                              )
                            })}
                            {finished && (
                              <td style={{ padding: '4px 6px', textAlign: 'center' as const, fontWeight: 700, color: memberTotalPts > 0 ? '#C8102E' : '#aaa', borderTop: '1px solid #f5f5f5' }}>
                                {memberTotalPts > 0 ? `+${memberTotalPts}` : '0'}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px' }}>loading fixtures...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(onlyRoundSpecials ? ['round'] : ['date', 'group', 'round'] as const).map((mode, i) => (
            <button key={mode} onClick={() => { setSortMode(mode as any); setCurrentPage(0) }}
              style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: sortMode === mode ? '#111' : 'white', color: sortMode === mode ? 'white' : '#888', minHeight: 44 }}>
              by {mode}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(['pages', 'list'] as const).map((mode, i) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: viewMode === mode ? '#111' : 'white', color: viewMode === mode ? 'white' : '#888', minHeight: 44 }}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Live fixtures — always shown at top */}
      {fixtures.filter(f => f.status === 'live').length > 0 && (
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#2d7a2d', padding: '4px 0', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', display: 'inline-block' }} />
            live now
          </div>
          {fixtures.filter(f => f.status === 'live').map(f => <FixtureCard key={f.id} fixture={f} />)}
        </div>
      )}

      {/* Pager */}
      {viewMode === 'pages' && pages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e0e0db', padding: '8px 14px', width: '100%' }}>
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
            style={{ background: 'none', border: '1px solid #ddd', padding: '8px 16px', cursor: safePage === 0 ? 'default' : 'pointer', fontSize: '18px', color: safePage === 0 ? '#ddd' : '#555', minHeight: 44 }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{pages[safePage]?.label}</div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>{safePage + 1} of {totalPages} · {pages[safePage]?.sub}</div>
          </div>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}
            style={{ background: 'none', border: '1px solid #ddd', padding: '8px 16px', cursor: safePage === totalPages - 1 ? 'default' : 'pointer', fontSize: '18px', color: safePage === totalPages - 1 ? '#ddd' : '#555', minHeight: 44 }}>›</button>
        </div>
      )}

      {/* Fixture cards */}
      <div>
        {viewMode === 'pages' ? (() => {
          const page = pages[safePage]
          if (!page) return null
          if (sortMode === 'round' && page.roundId) {
            // Group fixtures by day within the round
            const dayMap: Record<string, Fixture[]> = {}
            const dayIsoMap: Record<string, string> = {}
            page.fixtures.forEach(f => {
              const day = formatDatePT(f.date)
              if (!dayMap[day]) { dayMap[day] = []; dayIsoMap[day] = f.date.slice(0, 10) }
              dayMap[day].push(f)
            })
            return (
              <>
                {isCustom && <RoundSpecialsCard matchday={page.roundId} locked={false} />}
                {Object.entries(dayMap).map(([day, fx]) => (
                  <div key={day}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #eee', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      {day} <span style={{ fontWeight: 400, textTransform: 'none' as const, color: '#ccc' }}>· {fx.length} game{fx.length > 1 ? 's' : ''}</span>
                    </div>
                    {fx.map(f => <FixtureCard key={f.id} fixture={f} />)}
                  </div>
                ))}
              </>
            )
          }
          return <>{page.fixtures.map(f => <FixtureCard key={f.id} fixture={f} />)}</>
        })()
        : pages.map(page => (
          <div key={page.label}>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #e8e8e4', marginBottom: 4, width: '100%' }}>
              {page.label} <span style={{ fontWeight: 400, textTransform: 'none' as const, color: '#ccc' }}>{page.sub}</span>
            </div>
            {page.fixtures.map(f => <FixtureCard key={f.id} fixture={f} />)}
            <div style={{ marginBottom: 10 }} />
          </div>
        ))
        }
      </div>
    </div>
  )
}
