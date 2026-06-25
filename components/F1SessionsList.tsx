'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface F1Session {
  id: number
  competition_id: number
  competition_name: string
  season: number
  session_type: string
  date: string
  status: string
  results: any
  scored: boolean
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
  name: string
  input_type: string
  prediction_type: string
}

interface Pred {
  category_id: string
  value_text: string | null
  value_wld: string | null
  value_yesno: boolean | null
  points_earned: number | null
  is_correct: boolean | null
}

const SESSION_ORDER = ['1st Qualifying', '2nd Qualifying', '3rd Qualifying', 'Sprint Qualifying', 'Sprint', 'Race']
const SESSION_EMOJI: Record<string, string> = {
  'Race': '🏁',
  '1st Qualifying': '⏱',
  '2nd Qualifying': '⏱',
  '3rd Qualifying': '⏱',
  'Sprint': '⚡',
  'Sprint Qualifying': '⚡',
}

// Which categories apply to which session types
const SESSION_CATEGORIES: Record<string, string[]> = {
  'Race': ['f1_race_winner', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win'],
  '1st Qualifying': ['f1_pole_position', 'f1_top3_quali', 'f1_q1_eliminated'],
  '2nd Qualifying': ['f1_pole_position', 'f1_top3_quali'],
  '3rd Qualifying': ['f1_pole_position', 'f1_top3_quali'],
  'Sprint': ['f1_sprint_winner', 'f1_sprint_podium'],
  'Sprint Qualifying': ['f1_pole_position', 'f1_top3_quali'],
}

// 2026 F1 drivers
const F1_DRIVERS = [
  'Max Verstappen', 'Yuki Tsunoda',
  'Lewis Hamilton', 'Charles Leclerc',
  'George Russell', 'Kimi Antonelli',
  'Lando Norris', 'Oscar Piastri',
  'Fernando Alonso', 'Lance Stroll',
  'Pierre Gasly', 'Jack Doohan',
  'Nico Hülkenberg', 'Oliver Bearman',
  'Isack Hadjar', 'Liam Lawson',
  'Alexander Albon', 'Carlos Sainz',
  'Esteban Ocon', 'Kevin Magnussen',
].sort()

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'America/Los_Angeles'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function isLocked(session: F1Session, deadlineType: string, gpSessions: F1Session[]) {
  if (deadlineType === 'before_weekend') {
    // Lock all sessions once the first session of the weekend has started
    const firstSession = gpSessions
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    return firstSession ? new Date(firstSession.date) <= new Date() : false
  }
  // before_session: lock each session individually
  return new Date(session.date) <= new Date()
}

interface DriverPickerProps {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}

function DriverPicker({ value, onChange, disabled }: DriverPickerProps) {
  const [open, setOpen] = useState(false)

  function select(v: string) {
    const scrollY = window.scrollY
    onChange(v)
    setOpen(false)
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid',
          borderColor: value ? '#C8102E' : '#ddd',
          background: value ? '#fff5f5' : disabled ? '#fafafa' : 'white',
          color: value ? '#C8102E' : '#aaa', fontSize: '12px',
          fontFamily: 'inherit', textAlign: 'left' as const,
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: value ? 700 : 400 }}>{value || 'select driver...'}</span>
        {!disabled && <span style={{ fontSize: '10px', color: '#aaa' }}>{open ? '▲' : '▼'}</span>}
      </button>
      {open && (
        <div style={{ border: '1px solid #eee', borderTop: 'none', maxHeight: 200, overflowY: 'auto' as const }}>
          {value && (
            <button type="button" onMouseDown={e => { e.preventDefault(); select('') }}
              style={{ width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f5f5f5', background: '#fafafa', color: '#aaa', fontSize: '11px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer' }}>
              — clear
            </button>
          )}
          {F1_DRIVERS.map(driver => (
            <button key={driver} type="button" onMouseDown={e => { e.preventDefault(); select(driver) }}
              style={{
                width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f5f5f5',
                background: value === driver ? '#fff5f5' : 'white',
                color: value === driver ? '#C8102E' : '#111',
                fontWeight: value === driver ? 700 : 400,
                fontSize: '12px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer',
              }}>
              {driver}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function F1SessionsList({
  poolId, userId, deadlineType, tournamentId
}: {
  poolId: string
  userId: string
  deadlineType: string
  tournamentId: string
}) {
  const [sessions, setSessions] = useState<F1Session[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, Pred>>({}) // key: `${sessionId}:${categoryId}`
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [expandedGP, setExpandedGP] = useState<string | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [sessionsRes, rulesRes, predsRes] = await Promise.all([
        supabase.from('f1_sessions')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('date'),
        supabase.from('pool_rules')
          .select('category_id, points, bonus_points, ruleset_categories(name, input_type, prediction_type)')
          .eq('pool_id', poolId),
        supabase.from('predictions_v2')
          .select('*')
          .eq('pool_id', poolId)
          .eq('user_id', userId)
          .limit(10000),
      ])

      setSessions(sessionsRes.data || [])

      const rules = (rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id,
        points: r.points,
        bonus_points: r.bonus_points || 0,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'player',
        prediction_type: r.ruleset_categories?.prediction_type || 'per_game',
      }))
      setPoolRules(rules)

      const predMap: Record<string, Pred> = {}
      for (const p of predsRes.data || []) {
        predMap[`${p.fixture_id}:${p.category_id}`] = p
      }
      setPreds(predMap)

      // Auto-expand the next upcoming GP
      const upcoming = (sessionsRes.data || []).find(s => new Date(s.date) > new Date())
      if (upcoming) setExpandedGP(upcoming.competition_name)

      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  function updatePred(sessionId: number, categoryId: string, value: Partial<Pred>) {
    const scrollY = window.scrollY
    const key = `${sessionId}:${categoryId}`
    setPreds(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        category_id: categoryId,
        ...value,
      } as Pred,
    }))
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))

    // Debounced save
    const timerKey = `${sessionId}`
    if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey])
    saveTimers.current[timerKey] = setTimeout(() => savePreds(sessionId), 800)
  }

  const savePreds = useCallback(async (sessionId: number) => {
    setSaving(sessionId)
    const supabase = createClient()

    const rows = poolRules
      .filter(r => SESSION_CATEGORIES[getSessionType(sessionId)]?.includes(r.category_id))
      .map(r => {
        const key = `${sessionId}:${r.category_id}`
        const pred = preds[key]
        return {
          pool_id: poolId,
          user_id: userId,
          fixture_id: sessionId,
          category_id: r.category_id,
          value_text: pred?.value_text ?? null,
          value_wld: pred?.value_wld ?? null,
          value_yesno: pred?.value_yesno ?? null,
          value_number: null,
          value_ou: null,
          submitted_at: new Date().toISOString(),
        }
      })
      .filter(r => r.value_text || r.value_wld || r.value_yesno !== null)

    if (rows.length > 0) {
      await supabase.from('predictions_v2').upsert(rows, {
        onConflict: 'pool_id,user_id,fixture_id,category_id',
      })
    }
    setSaving(null)
  }, [poolId, userId, poolRules, preds])

  function getSessionType(sessionId: number): string {
    return sessions.find(s => s.id === sessionId)?.session_type || ''
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px', padding: 16 }}>loading sessions...</div>

  // Group sessions by Grand Prix
  const gpMap: Record<string, F1Session[]> = {}
  for (const s of sessions) {
    if (!gpMap[s.competition_name]) gpMap[s.competition_name] = []
    gpMap[s.competition_name].push(s)
  }

  return (
    <div>
      {Object.entries(gpMap).map(([gpName, gpSessions]) => {
        const sortedSessions = gpSessions.slice().sort((a, b) =>
          SESSION_ORDER.indexOf(a.session_type) - SESSION_ORDER.indexOf(b.session_type)
        )
        const raceSession = sortedSessions.find(s => s.session_type === 'Race')
        const isCompleted = raceSession?.status === 'Completed'
        const isUpcoming = raceSession && new Date(raceSession.date) > new Date()
        const isExpanded = expandedGP === gpName

        // Count user picks for this GP
        const pickCount = sortedSessions.reduce((acc, s) => {
          const cats = SESSION_CATEGORIES[s.session_type] || []
          return acc + cats.filter(c => {
            const p = preds[`${s.id}:${c}`]
            return p && (p.value_text || p.value_wld || p.value_yesno !== null)
          }).length
        }, 0)

        return (
          <div key={gpName} style={{
            marginBottom: 8, border: '1px solid #e0e0db',
            background: 'white',
          }}>
            {/* GP Header */}
            <button
              type="button"
              onClick={() => setExpandedGP(isExpanded ? null : gpName)}
              style={{
                width: '100%', padding: '12px 14px', border: 'none', background: 'none',
                cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '18px' }}>🏎</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111' }}>{gpName}</div>
                  <div style={{ fontSize: '10px', color: '#aaa', marginTop: 1 }}>
                    {raceSession ? formatDate(raceSession.date) : ''}
                    {isCompleted && <span style={{ color: '#2d7a2d', marginLeft: 6 }}>✓ completed</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pickCount > 0 && (
                  <span style={{ fontSize: '10px', color: '#C8102E', fontWeight: 700 }}>{pickCount} picks</span>
                )}
                <span style={{ color: '#aaa', fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Sessions */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #f0f0f0' }}>
                {sortedSessions.map(session => {
                  const locked = isLocked(session, deadlineType, gpSessions)
                  const sessionCatIds = SESSION_CATEGORIES[session.session_type] || []
                  const sessionRules = poolRules.filter(r => sessionCatIds.includes(r.category_id))
                  if (sessionRules.length === 0) return null

                  return (
                    <div key={session.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f5f5f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{SESSION_EMOJI[session.session_type] || '🏁'}</span>
                          <span style={{ fontWeight: 600, fontSize: '12px' }}>{session.session_type}</span>
                          {locked && <span style={{ fontSize: '10px', color: '#aaa' }}>🔒</span>}
                          {saving === session.id && <span style={{ fontSize: '10px', color: '#aaa' }}>saving...</span>}
                        </div>
                        <span style={{ fontSize: '10px', color: '#aaa' }}>
                          {formatDate(session.date)}
                        </span>
                      </div>

                      {sessionRules.map(rule => {
                        const key = `${session.id}:${rule.category_id}`
                        const pred = preds[key]

                        return (
                          <div key={rule.category_id} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#555' }}>{rule.name}</span>
                              <span style={{ fontSize: '10px', color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                            </div>

                            {rule.input_type === 'player' && (
                              <DriverPicker
                                value={pred?.value_text || ''}
                                disabled={locked}
                                onChange={v => updatePred(session.id, rule.category_id, { value_text: v })}
                              />
                            )}

                            {rule.input_type === 'yesno' && (
                              <div style={{ display: 'flex', gap: 0 }}>
                                {['yes', 'no'].map((opt, i) => {
                                  const val = opt === 'yes'
                                  const active = pred?.value_yesno === val
                                  return (
                                    <button key={opt} type="button"
                                      disabled={locked}
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
                            )}

                            {/* Show result if scored */}
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
