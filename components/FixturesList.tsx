'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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
function PlayerSearch({ value, onChange, disabled }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const WC_PLAYERS = [
    'Hirving Lozano', 'Raúl Jiménez', 'Edson Álvarez', 'Henry Martín',
    'Percy Tau', 'Lyle Foster', 'Evidence Makgopa',
    'Robert Lewandowski', 'Piotr Zieliński',
    'Salem Al-Dawsari', 'Firas Al-Buraikan',
    'Kylian Mbappé', 'Antoine Griezmann', 'Ousmane Dembélé',
    'Harry Kane', 'Bukayo Saka', 'Jude Bellingham', 'Phil Foden',
    'Vinicius Jr.', 'Rodrygo', 'Richarlison',
    'Erling Haaland', 'Martin Ødegaard',
    'Mohamed Salah', 'Omar Marmoush',
    'Lamine Yamal', 'Pedri', 'Álvaro Morata',
    'Ciro Immobile', 'Federico Chiesa',
    'Kai Havertz', 'Florian Wirtz', 'Thomas Müller',
    'Romelu Lukaku', 'Kevin De Bruyne',
    'Christian Pulisic', 'Ricardo Pepi',
    'Lionel Messi', 'Julián Álvarez', 'Enzo Fernández',
  ]
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.length > 0
    ? WC_PLAYERS.filter(p => p.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={query}
        disabled={disabled}
        placeholder="search player..."
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit', boxSizing: 'border-box', background: disabled ? '#fafafa' : 'white' }}
      />
      {open && filtered.length > 0 && !disabled && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
          border: '1px solid #ddd', borderTop: 'none', zIndex: 100, maxHeight: 160, overflowY: 'auto',
        }}>
          {filtered.map(p => (
            <div key={p}
              onMouseDown={() => { onChange(p); setQuery(p); setOpen(false) }}
              style={{ padding: '5px 8px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >{p}</div>
          ))}
        </div>
      )}
    </div>
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
  const [scoreInputs, setScoreInputs] = useState<ScoreInputMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null) // fixtureId being saved
  const [saved, setSaved] = useState<Record<number, boolean>>({}) // fixtureId → confirmed saved
  const [sortMode, setSortMode] = useState<'date' | 'group'>('date')
  const [viewMode, setViewMode] = useState<'pages' | 'list'>('pages')
  const [currentPage, setCurrentPage] = useState(0)

  const isCustom = packageId === 'CUSTOM'

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
    const pts = keys.map(k => preds[k].points_earned ?? 0)
    if (pts.length === 0 || pts.every(p => p === 0 && preds[keys[0]]?.points_earned === null)) return null
    return pts.reduce((a, b) => a + b, 0)
  }

  // ── Sorted + paged ──────────────────────────────────────────────────────
  const sorted = [...fixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const dateMap: Record<string, Fixture[]> = {}
  const groupMap: Record<string, Fixture[]> = {}
  sorted.forEach(f => {
    const day = formatDatePT(f.date)
    if (!dateMap[day]) dateMap[day] = []
    dateMap[day].push(f)
    if (!groupMap[f.round]) groupMap[f.round] = []
    groupMap[f.round].push(f)
  })
  const pages = sortMode === 'date'
    ? Object.entries(dateMap).map(([label, fx]) => ({ label, sub: `${fx.length} game${fx.length > 1 ? 's' : ''}`, fixtures: fx }))
    : Object.entries(groupMap).map(([label, fx]) => ({ label, sub: [...new Set(fx.flatMap(f => [f.home_team, f.away_team]))].slice(0, 4).join(' · '), fixtures: fx }))
  const totalPages = pages.length
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1))

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
        flex: 1, padding: '5px 4px', fontSize: '11px', border: '1px solid',
        cursor: locked || finished ? 'default' : 'pointer',
        fontFamily: 'inherit',
        borderColor: active ? '#C8102E' : '#ddd',
        background: active ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
        color: active ? 'white' : '#555',
        opacity: locked && !active ? 0.6 : 1,
      }
    }

    // Points feedback
    const feedback = finished && pred?.points_earned !== null ? (
      <span style={{ fontSize: '10px', color: pred.points_earned! > 0 ? '#2d7a2d' : '#aaa', marginLeft: 6 }}>
        {pred.points_earned! > 0 ? `+${pred.points_earned} pts` : '✗'}
      </span>
    ) : null

    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{rule.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {rule.requires_line && !finished && (
              <span style={{ fontSize: '9px', color: '#bbb', fontStyle: 'italic' }}>line TBD 24h before</span>
            )}
            {feedback}
          </div>
        </div>

        {/* WLD */}
        {rule.input_type === 'wld' &&
          rule.category_id !== 'soccer_first_team_score' &&
          rule.category_id !== 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              {FLAGS[fixture.home_team]} {fixture.home_team}
            </button>
            {rule.category_id !== 'soccer_asian_handicap' && (
              <button style={{ ...btnStyle('draw'), borderRight: 'none' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'draw' })}>
                draw
              </button>
            )}
            <button style={btnStyle('away')}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              {fixture.away_team} {FLAGS[fixture.away_team]}
            </button>
          </div>
        )}

        {/* First team to score */}
        {rule.category_id === 'soccer_first_team_score' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              {FLAGS[fixture.home_team]} {fixture.home_team}
            </button>
            <button style={{ ...btnStyle('none' as any), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
              no goal
            </button>
            <button style={btnStyle('away')}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              {fixture.away_team} {FLAGS[fixture.away_team]}
            </button>
          </div>
        )}

        {/* First yellow card */}
        {rule.category_id === 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              {FLAGS[fixture.home_team]} {fixture.home_team}
            </button>
            <button style={{ ...btnStyle('none' as any), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
              no card
            </button>
            <button style={btnStyle('away')}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              {fixture.away_team} {FLAGS[fixture.away_team]}
            </button>
          </div>
        )}

        {/* Over / Under */}
        {rule.input_type === 'ou' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('over'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'over' })}>
              over {rule.requires_line ? '—' : '2.5'}
            </button>
            <button style={btnStyle('under')}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'under' })}>
              under {rule.requires_line ? '—' : '2.5'}
            </button>
          </div>
        )}

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
                style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white' }}
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
                style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white' }}
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

        {/* Player search */}
        {rule.input_type === 'player' && (
          <PlayerSearch
            value={pred?.value_text || ''}
            disabled={locked || finished}
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

  // ── Fixture card ─────────────────────────────────────────────────────────
  function FixtureCard({ fixture }: { fixture: Fixture }) {
    const locked = isLocked(fixture)
    const finished = fixture.status === 'FT'
    const perGameRules = poolRules.filter(r => r.prediction_type === 'per_game')
    const hasAnyPick = perGameRules.some(r => {
      const p = preds[`${fixture.id}:${r.category_id}`]
      return p?.value_wld || p?.value_ou || p?.value_text || p?.value_yesno !== null
    })
    const totalPts = totalPointsForFixture(fixture.id)

    return (
      <div style={{
        background: 'white',
        border: '1px solid #e0e0db',
        borderLeft: hasAnyPick ? '3px solid #C8102E' : '1px solid #e0e0db',
        marginBottom: 4,
        width: 480,
      }}>
        {/* Meta row */}
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

        {/* Team header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: perGameRules.length > 0 ? '1px solid #f5f5f5' : 'none' }}>
          <span style={{ fontWeight: 700, fontSize: '13px' }}>{FLAGS[fixture.home_team]} {fixture.home_team}</span>
          {finished
            ? <span style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{fixture.home_score} – {fixture.away_score}</span>
            : <span style={{ fontSize: '11px', color: '#ccc' }}>vs</span>
          }
          <span style={{ fontWeight: 700, fontSize: '13px' }}>{fixture.away_team} {FLAGS[fixture.away_team]}</span>
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
                    padding: '6px 16px', fontSize: '11px', fontWeight: 600,
                    background: saving === fixture.id ? '#ddd' : hasAnyPick ? '#111' : '#ddd',
                    color: 'white', border: 'none', cursor: hasAnyPick && saving !== fixture.id ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}>
                  {saving === fixture.id ? 'saving...' : 'save picks'}
                </button>
                {saved[fixture.id] && (
                  <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ picks saved</span>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 480 }}>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(['date', 'group'] as const).map((mode, i) => (
            <button key={mode} onClick={() => { setSortMode(mode); setCurrentPage(0) }}
              style={{ padding: '4px 12px', fontSize: '11px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: sortMode === mode ? '#111' : 'white', color: sortMode === mode ? 'white' : '#888' }}>
              by {mode}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(['pages', 'list'] as const).map((mode, i) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ padding: '4px 12px', fontSize: '11px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: viewMode === mode ? '#111' : 'white', color: viewMode === mode ? 'white' : '#888' }}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Pager */}
      {viewMode === 'pages' && pages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e0e0db', padding: '8px 14px', width: 480 }}>
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
            style={{ background: 'none', border: '1px solid #ddd', padding: '2px 10px', cursor: safePage === 0 ? 'default' : 'pointer', fontSize: '14px', color: safePage === 0 ? '#ddd' : '#555' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{pages[safePage]?.label}</div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>{safePage + 1} of {totalPages} · {pages[safePage]?.sub}</div>
          </div>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}
            style={{ background: 'none', border: '1px solid #ddd', padding: '2px 10px', cursor: safePage === totalPages - 1 ? 'default' : 'pointer', fontSize: '14px', color: safePage === totalPages - 1 ? '#ddd' : '#555' }}>›</button>
        </div>
      )}

      {/* Fixture cards */}
      <div>
        {viewMode === 'pages'
          ? pages[safePage]?.fixtures.map(f => <FixtureCard key={f.id} fixture={f} />)
          : pages.map(page => (
            <div key={page.label}>
              <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #e8e8e4', marginBottom: 4, width: 480 }}>
                {page.label} <span style={{ fontWeight: 400, textTransform: 'none', color: '#ccc' }}>{page.sub}</span>
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
