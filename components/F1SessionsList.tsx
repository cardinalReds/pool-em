'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── 2026 F1 Grid ─────────────────────────────────────────────────────────────
const F1_GRID = [
  {
    name: 'Red Bull Racing', color: '#3671C6',
    logo: 'https://media.api-sports.io/formula-1/teams/1.png',
    drivers: [
      { name: 'Max Verstappen', number: 1, photo: 'https://media.api-sports.io/formula-1/drivers/1.png' },
      { name: 'Yuki Tsunoda', number: 22, photo: 'https://media.api-sports.io/formula-1/drivers/822.png' },
    ],
  },
  {
    name: 'Ferrari', color: '#E8002D',
    logo: 'https://media.api-sports.io/formula-1/teams/2.png',
    drivers: [
      { name: 'Charles Leclerc', number: 16, photo: 'https://media.api-sports.io/formula-1/drivers/16.png' },
      { name: 'Lewis Hamilton', number: 44, photo: 'https://media.api-sports.io/formula-1/drivers/44.png' },
    ],
  },
  {
    name: 'Mercedes', color: '#27F4D2',
    logo: 'https://media.api-sports.io/formula-1/teams/3.png',
    drivers: [
      { name: 'George Russell', number: 63, photo: 'https://media.api-sports.io/formula-1/drivers/63.png' },
      { name: 'Kimi Antonelli', number: 12, photo: 'https://media.api-sports.io/formula-1/drivers/842.png' },
    ],
  },
  {
    name: 'McLaren', color: '#FF8000',
    logo: 'https://media.api-sports.io/formula-1/teams/4.png',
    drivers: [
      { name: 'Lando Norris', number: 4, photo: 'https://media.api-sports.io/formula-1/drivers/4.png' },
      { name: 'Oscar Piastri', number: 81, photo: 'https://media.api-sports.io/formula-1/drivers/827.png' },
    ],
  },
  {
    name: 'Aston Martin', color: '#229971',
    logo: 'https://media.api-sports.io/formula-1/teams/5.png',
    drivers: [
      { name: 'Fernando Alonso', number: 14, photo: 'https://media.api-sports.io/formula-1/drivers/14.png' },
      { name: 'Lance Stroll', number: 18, photo: 'https://media.api-sports.io/formula-1/drivers/18.png' },
    ],
  },
  {
    name: 'Alpine', color: '#0093CC',
    logo: 'https://media.api-sports.io/formula-1/teams/6.png',
    drivers: [
      { name: 'Pierre Gasly', number: 10, photo: 'https://media.api-sports.io/formula-1/drivers/10.png' },
      { name: 'Jack Doohan', number: 7, photo: 'https://media.api-sports.io/formula-1/drivers/841.png' },
    ],
  },
  {
    name: 'Haas', color: '#B6BABD',
    logo: 'https://media.api-sports.io/formula-1/teams/7.png',
    drivers: [
      { name: 'Nico Hülkenberg', number: 27, photo: 'https://media.api-sports.io/formula-1/drivers/27.png' },
      { name: 'Oliver Bearman', number: 87, photo: 'https://media.api-sports.io/formula-1/drivers/843.png' },
    ],
  },
  {
    name: 'RB', color: '#6692FF',
    logo: 'https://media.api-sports.io/formula-1/teams/8.png',
    drivers: [
      { name: 'Isack Hadjar', number: 6, photo: 'https://media.api-sports.io/formula-1/drivers/845.png' },
      { name: 'Liam Lawson', number: 30, photo: 'https://media.api-sports.io/formula-1/drivers/839.png' },
    ],
  },
  {
    name: 'Williams', color: '#64C4FF',
    logo: 'https://media.api-sports.io/formula-1/teams/9.png',
    drivers: [
      { name: 'Alexander Albon', number: 23, photo: 'https://media.api-sports.io/formula-1/drivers/23.png' },
      { name: 'Carlos Sainz', number: 55, photo: 'https://media.api-sports.io/formula-1/drivers/55.png' },
    ],
  },
  {
    name: 'Kick Sauber', color: '#52E252',
    logo: 'https://media.api-sports.io/formula-1/teams/10.png',
    drivers: [
      { name: 'Nico Hülkenberg', number: 27, photo: 'https://media.api-sports.io/formula-1/drivers/27.png' },
      { name: 'Gabriel Bortoleto', number: 5, photo: 'https://media.api-sports.io/formula-1/drivers/846.png' },
    ],
  },
]

const ALL_DRIVERS = F1_GRID.flatMap(t => t.drivers.map(d => ({ ...d, team: t.name, teamColor: t.color, teamLogo: t.logo })))

// ── Session config ────────────────────────────────────────────────────────────
// Simplified: qualifying sessions are collapsed into one "Qualifying" entry
const SESSION_CATEGORIES: Record<string, string[]> = {
  'Race': ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_top6_teammate'],
  '3rd Qualifying': ['f1_pole_position', 'f1_top3_quali'],
  '1st Qualifying': ['f1_q1_eliminated'],
  'Sprint': ['f1_sprint_winner', 'f1_sprint_podium'],
  'Sprint Qualifying': ['f1_pole_position'],
}

const SESSION_EMOJI: Record<string, string> = {
  'Race': '🏁', '1st Qualifying': '⏱', '2nd Qualifying': '⏱',
  '3rd Qualifying': '⏱', 'Sprint': '⚡', 'Sprint Qualifying': '⚡',
}

const SESSION_LABEL: Record<string, string> = {
  '1st Qualifying': 'Q1', '2nd Qualifying': 'Q2', '3rd Qualifying': 'Qualifying (Q3)',
  'Sprint Qualifying': 'Sprint Qualifying', 'Sprint': 'Sprint', 'Race': 'Race',
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'America/Los_Angeles'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Driver Dropdown ───────────────────────────────────────────────────────────
function DriverDropdown({ value, onChange, disabled, exclude = [] }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  exclude?: string[]
}) {
  const [open, setOpen] = useState(false)
  const driver = ALL_DRIVERS.find(d => d.name === value)

  function select(name: string) {
    const scrollY = window.scrollY
    onChange(name)
    setOpen(false)
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
  }

  return (
    <div style={{ position: 'relative' as const }}>
      <button type="button" disabled={disabled}
        onMouseDown={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid',
          borderColor: value ? '#C8102E' : '#ddd',
          background: disabled ? '#fafafa' : 'white',
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit', textAlign: 'left' as const,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
        {driver ? (
          <>
            <img src={driver.photo} alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover' as const }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#111' }}>{driver.name}</div>
              <div style={{ fontSize: '10px', color: driver.teamColor }}>{driver.team}</div>
            </div>
            <span style={{ fontSize: '10px', color: '#C8102E', fontWeight: 700 }}>#{driver.number}</span>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: '#aaa' }}>select driver...</span>
        )}
        {!disabled && <span style={{ fontSize: '10px', color: '#aaa', marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>}
      </button>

      {open && (
        <div style={{
          position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1px solid #ddd', borderTop: 'none',
          maxHeight: 280, overflowY: 'auto' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {value && (
            <button type="button" onMouseDown={e => { e.preventDefault(); select('') }}
              style={{ width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f0f0f0', background: '#fafafa', color: '#aaa', fontSize: '11px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer' }}>
              — clear
            </button>
          )}
          {F1_GRID.map(team => (
            <div key={team.name}>
              {/* Team header */}
              <div style={{ padding: '6px 12px', background: '#f8f8f8', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f0f0f0' }}>
                <img src={team.logo} alt="" height={16} style={{ objectFit: 'contain' as const }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: team.color, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{team.name}</span>
              </div>
              {/* Drivers */}
              {team.drivers
                .filter(d => !exclude.includes(d.name))
                .map(d => (
                  <button key={d.name} type="button"
                    onMouseDown={e => { e.preventDefault(); select(d.name) }}
                    style={{
                      width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f5f5f5',
                      background: value === d.name ? '#fff5f5' : 'white',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                    <img src={d.photo} alt="" width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover' as const }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: value === d.name ? 700 : 400, color: value === d.name ? '#C8102E' : '#111' }}>{d.name}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>#{d.number}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Podium Order Picker (P1/P2/P3) ───────────────────────────────────────────
function PodiumOrderPicker({ p1, p2, p3, onChange, disabled }: {
  p1: string; p2: string; p3: string
  onChange: (pos: 1 | 2 | 3, driver: string) => void
  disabled: boolean
}) {
  const medals = ['🥇', '🥈', '🥉']
  const values = [p1, p2, p3]
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
      {([1, 2, 3] as const).map((pos, i) => (
        <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '18px', width: 28, textAlign: 'center' as const }}>{medals[i]}</span>
          <div style={{ flex: 1 }}>
            <DriverDropdown
              value={values[i]}
              disabled={disabled}
              exclude={values.filter((_, j) => j !== i).filter(Boolean)}
              onChange={v => onChange(pos, v)}
            />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
        5 pts for exact position · 2 pts for correct driver in top 3
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface F1Session {
  id: number; competition_id: number; competition_name: string
  season: number; session_type: string; date: string; status: string
  results: any; scored: boolean
}

interface PoolRule {
  category_id: string; points: number; bonus_points: number
  name: string; input_type: string; prediction_type: string
}

interface Pred {
  category_id: string; value_text: string | null; value_wld: string | null
  value_yesno: boolean | null; points_earned: number | null; is_correct: boolean | null
}

function isSessionLocked(session: F1Session, deadlineType: string, gpSessions: F1Session[]) {
  if (deadlineType === 'before_weekend') {
    const first = gpSessions.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    return first ? new Date(first.date) <= new Date() : false
  }
  return new Date(session.date) <= new Date()
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function F1SessionsList({ poolId, userId, deadlineType, tournamentId }: {
  poolId: string; userId: string; deadlineType: string; tournamentId: string
}) {
  const [sessions, setSessions] = useState<F1Session[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [expandedGP, setExpandedGP] = useState<string | null>(null)
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const predsRef = useRef(preds)
  useEffect(() => { predsRef.current = preds }, [preds])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [sessionsRes, rulesRes, predsRes] = await Promise.all([
        supabase.from('f1_sessions').select('*').eq('tournament_id', tournamentId).order('date'),
        supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type, prediction_type)').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId).limit(10000),
      ])
      setSessions(sessionsRes.data || [])
      setPoolRules((rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id, points: r.points, bonus_points: r.bonus_points || 0,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'player',
        prediction_type: r.ruleset_categories?.prediction_type || 'per_game',
      })))
      const predMap: Record<string, any> = {}
      for (const p of predsRes.data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
      setPreds(predMap)
      const upcoming = (sessionsRes.data || []).find(s => new Date(s.date) > new Date())
      if (upcoming) setExpandedGP(upcoming.competition_name)
      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  function updatePred(sessionId: number, categoryId: string, value: any) {
    const scrollY = window.scrollY
    const key = `${sessionId}:${categoryId}`
    setPreds(prev => ({ ...prev, [key]: { ...prev[key], category_id: categoryId, ...value } }))
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
    if (saveTimers.current[sessionId]) clearTimeout(saveTimers.current[sessionId])
    saveTimers.current[sessionId] = setTimeout(() => savePreds(sessionId), 800)
  }

  const savePreds = useCallback(async (sessionId: number) => {
    setSaving(sessionId)
    const supabase = createClient()
    const currentPreds = predsRef.current
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    const catIds = SESSION_CATEGORIES[session.session_type] || []

    const rows: any[] = []
    for (const r of poolRules.filter(r => catIds.includes(r.category_id))) {
      if (r.category_id === 'f1_podium_order') {
        // Store as three separate rows: f1_podium_order_1, f1_podium_order_2, f1_podium_order_3
        for (const pos of [1, 2, 3]) {
          const val = currentPreds[`${sessionId}:f1_podium_order_${pos}`]?.value_text
          if (val) rows.push({ pool_id: poolId, user_id: userId, fixture_id: sessionId, category_id: `f1_podium_order_${pos}`, value_text: val, value_wld: null, value_yesno: null, value_number: null, value_ou: null, submitted_at: new Date().toISOString() })
        }
        continue
      }
      const pred = currentPreds[`${sessionId}:${r.category_id}`]
      if (pred?.value_text || pred?.value_wld || pred?.value_yesno !== null && pred?.value_yesno !== undefined)
        rows.push({ pool_id: poolId, user_id: userId, fixture_id: sessionId, category_id: r.category_id, value_text: pred.value_text ?? null, value_wld: pred.value_wld ?? null, value_yesno: pred.value_yesno ?? null, value_number: null, value_ou: null, submitted_at: new Date().toISOString() })
    }

    if (rows.length > 0) await supabase.from('predictions_v2').upsert(rows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
    setSaving(null)
  }, [poolId, userId, poolRules, sessions])

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px', padding: 16 }}>loading sessions...</div>

  // Group by GP, only show sessions that have categories configured
  const gpMap: Record<string, F1Session[]> = {}
  for (const s of sessions) {
    const hasCats = (SESSION_CATEGORIES[s.session_type] || []).some(c => poolRules.find(r => r.category_id === c))
    if (!hasCats) continue
    if (!gpMap[s.competition_name]) gpMap[s.competition_name] = []
    gpMap[s.competition_name].push(s)
  }

  return (
    <div>
      {Object.entries(gpMap).map(([gpName, gpSessions]) => {
        const sorted = gpSessions.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        const race = sorted.find(s => s.session_type === 'Race')
        const isExpanded = expandedGP === gpName
        const isCompleted = race?.status === 'Completed'

        // Count picks
        const pickCount = sorted.reduce((acc, s) => {
          const cats = SESSION_CATEGORIES[s.session_type] || []
          return acc + cats.filter(c => {
            if (c === 'f1_podium_order') return !!(preds[`${s.id}:f1_podium_order_1`]?.value_text)
            const p = preds[`${s.id}:${c}`]
            return p && (p.value_text || p.value_wld || p.value_yesno !== null)
          }).length
        }, 0)

        return (
          <div key={gpName} style={{ marginBottom: 8, border: '1px solid #e0e0db', background: 'white' }}>
            <button type="button" onClick={() => setExpandedGP(isExpanded ? null : gpName)}
              style={{ width: '100%', padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '18px' }}>🏎</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111' }}>{gpName}</div>
                  <div style={{ fontSize: '10px', color: '#aaa', marginTop: 1 }}>
                    {race ? formatDate(race.date) : ''}
                    {isCompleted && <span style={{ color: '#2d7a2d', marginLeft: 6 }}>✓ completed</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pickCount > 0 && <span style={{ fontSize: '10px', color: '#C8102E', fontWeight: 700 }}>{pickCount} picks</span>}
                <span style={{ color: '#aaa', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {isExpanded && (
              <div style={{ borderTop: '1px solid #f0f0f0' }}>
                {sorted.map(session => {
                  const locked = isSessionLocked(session, deadlineType, gpSessions)
                  const catIds = SESSION_CATEGORIES[session.session_type] || []
                  const sessionRules = poolRules.filter(r => catIds.includes(r.category_id) || (r.category_id === 'f1_podium_order' && catIds.includes('f1_podium_order')))
                  if (sessionRules.length === 0) return null

                  return (
                    <div key={session.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f5f5f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{SESSION_EMOJI[session.session_type] || '🏁'}</span>
                          <span style={{ fontWeight: 700, fontSize: '13px' }}>{SESSION_LABEL[session.session_type] || session.session_type}</span>
                          {locked && <span style={{ fontSize: '10px', color: '#aaa' }}>🔒</span>}
                          {saving === session.id && <span style={{ fontSize: '10px', color: '#aaa' }}>saving...</span>}
                        </div>
                        <span style={{ fontSize: '10px', color: '#aaa' }}>{formatDate(session.date)}</span>
                      </div>

                      {sessionRules.map(rule => {
                        const key = `${session.id}:${rule.category_id}`
                        const pred = preds[key]
                        const p1 = preds[`${session.id}:f1_podium_order_1`]?.value_text || ''
                        const p2 = preds[`${session.id}:f1_podium_order_2`]?.value_text || ''
                        const p3 = preds[`${session.id}:f1_podium_order_3`]?.value_text || ''

                        return (
                          <div key={rule.category_id} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>{rule.name}</span>
                              <span style={{ fontSize: '11px', color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                            </div>

                            {rule.category_id === 'f1_podium_order' ? (
                              <PodiumOrderPicker
                                p1={p1} p2={p2} p3={p3} disabled={locked}
                                onChange={(pos, driver) => updatePred(session.id, `f1_podium_order_${pos}`, { value_text: driver })}
                              />
                            ) : rule.input_type === 'player' ? (
                              <DriverDropdown
                                value={pred?.value_text || ''}
                                disabled={locked}
                                onChange={v => updatePred(session.id, rule.category_id, { value_text: v })}
                              />
                            ) : rule.input_type === 'yesno' ? (
                              <div style={{ display: 'flex', gap: 0 }}>
                                {['yes', 'no'].map((opt, i) => {
                                  const val = opt === 'yes'
                                  const active = pred?.value_yesno === val
                                  return (
                                    <button key={opt} type="button" disabled={locked}
                                      onClick={() => !locked && updatePred(session.id, rule.category_id, { value_yesno: val })}
                                      style={{
                                        flex: 1, padding: '8px', border: '1px solid',
                                        borderRight: i === 0 ? 'none' : undefined,
                                        borderColor: active ? '#C8102E' : '#ddd',
                                        background: active ? '#C8102E' : locked ? '#fafafa' : 'white',
                                        color: active ? 'white' : '#555',
                                        fontSize: '12px', fontFamily: 'inherit', cursor: locked ? 'default' : 'pointer',
                                      }}>
                                      {opt}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}

                            {pred?.is_correct !== null && pred?.is_correct !== undefined && (
                              <div style={{ fontSize: '10px', marginTop: 3, color: pred.is_correct ? '#2d7a2d' : '#aaa' }}>
                                {pred.is_correct ? `✓ +${pred.points_earned} pts` : '✗ no points'}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
