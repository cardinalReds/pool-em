'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── 2026 F1 Grid — 11 teams, 22 drivers ──────────────────────────────────────
const F1_GRID = [
  {
    name: 'McLaren', color: '#FF8000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/mclaren-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Lando Norris', number: 4, photo: 'https://media.api-sports.io/formula-1/drivers/49.png' },
      { name: 'Oscar Piastri', number: 81, photo: 'https://media.api-sports.io/formula-1/drivers/97.png' },
    ],
  },
  {
    name: 'Ferrari', color: '#E8002D',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/ferrari-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Charles Leclerc', number: 16, photo: 'https://media.api-sports.io/formula-1/drivers/34.png' },
      { name: 'Lewis Hamilton', number: 44, photo: 'https://media.api-sports.io/formula-1/drivers/20.png' },
    ],
  },
  {
    name: 'Red Bull', color: '#3671C6',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/red-bull-racing-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Max Verstappen', number: 1, photo: 'https://media.api-sports.io/formula-1/drivers/25.png' },
      { name: 'Isack Hadjar', number: 6, photo: 'https://media.api-sports.io/formula-1/drivers/100.png' },
    ],
  },
  {
    name: 'Mercedes', color: '#27F4D2',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/mercedes-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'George Russell', number: 63, photo: 'https://media.api-sports.io/formula-1/drivers/51.png' },
      { name: 'Kimi Antonelli', number: 12, photo: 'https://media.api-sports.io/formula-1/drivers/106.png' },
    ],
  },
  {
    name: 'Aston Martin', color: '#229971',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/aston-martin-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Fernando Alonso', number: 14, photo: 'https://media.api-sports.io/formula-1/drivers/4.png' },
      { name: 'Lance Stroll', number: 18, photo: 'https://media.api-sports.io/formula-1/drivers/31.png' },
    ],
  },
  {
    name: 'Williams', color: '#64C4FF',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/williams-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Alexander Albon', number: 23, photo: 'https://media.api-sports.io/formula-1/drivers/50.png' },
      { name: 'Carlos Sainz', number: 55, photo: 'https://media.api-sports.io/formula-1/drivers/24.png' },
    ],
  },
  {
    name: 'Alpine', color: '#0093CC',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/alpine-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Pierre Gasly', number: 10, photo: 'https://media.api-sports.io/formula-1/drivers/36.png' },
      { name: 'Franco Colapinto', number: 43, photo: 'https://media.api-sports.io/formula-1/drivers/105.png' },
    ],
  },
  {
    name: 'Haas', color: '#B6BABD',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/haas-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Esteban Ocon', number: 31, photo: 'https://media.api-sports.io/formula-1/drivers/28.png' },
      { name: 'Oliver Bearman', number: 87, photo: 'https://media.api-sports.io/formula-1/drivers/101.png' },
    ],
  },
  {
    name: 'Racing Bulls', color: '#6692FF',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/racing-bulls-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Liam Lawson', number: 30, photo: 'https://media.api-sports.io/formula-1/drivers/89.png' },
      { name: 'Arvid Lindblad', number: 41, photo: 'https://media.api-sports.io/formula-1/drivers/114.png' },
    ],
  },
  {
    name: 'Audi', color: '#C00000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/audi-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Nico Hülkenberg', number: 27, photo: 'https://media.api-sports.io/formula-1/drivers/6.png' },
      { name: 'Gabriel Bortoleto', number: 5, photo: 'https://media.api-sports.io/formula-1/drivers/110.png' },
    ],
  },
  {
    name: 'Cadillac', color: '#CC0000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/cadillac-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Sergio Pérez', number: 11, photo: 'https://media.api-sports.io/formula-1/drivers/10.png' },
      { name: 'Valtteri Bottas', number: 77, photo: 'https://media.api-sports.io/formula-1/drivers/5.png' },
    ],
  },
]

// ── Session config ────────────────────────────────────────────────────────────
// Only show Q3 qualifying (pole) and Race sessions — simplified UX
const SESSION_CATEGORIES: Record<string, string[]> = {
  'Race':           ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_first_pit_lap', 'f1_teammate_battle'],
  '3rd Qualifying': ['f1_pole_position', 'f1_top3_quali', 'f1_q1_eliminated', 'f1_q3_qualifier'],
  '3rd Sprint Shootout': ['f1_pole_position', 'f1_top3_quali', 'f1_q1_eliminated', 'f1_q3_qualifier'],
  'Sprint':         ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_first_pit_lap', 'f1_teammate_battle'],
}

const SESSION_LABEL: Record<string, string> = {
  '3rd Qualifying': 'Qualifying', 'Race': 'Race', 'Sprint': 'Sprint',
  '1st Sprint Shootout': 'Sprint Q1', '2nd Sprint Shootout': 'Sprint Q2', '3rd Sprint Shootout': 'Sprint Q3',
}

function driverNameMatches(pick: string, actual: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const p = norm(pick), a = norm(actual)
  if (p === a) return true
  if (a.includes(p) || p.includes(a)) return true
  const pLast = p.split(' ').pop() || ''
  const aLast = a.split(' ').pop() || ''
  return pLast.length > 3 && pLast === aLast
}

// Excluded from Q1 pick (expected to make Q2 — everyone else has a shot)
const Q1_EXCLUDED_TEAMS = ['Cadillac', 'Aston Martin']
// Excluded from Q3 pick (expected to be there — no value in picking them)
const Q3_EXCLUDED_TEAMS = ['Ferrari', 'McLaren', 'Red Bull', 'Mercedes']

// Teammate battle teams — one assigned per race weekend randomly
const TEAMMATE_BATTLE_TEAMS = ['Alpine', 'Audi', 'Williams', 'Haas', 'Racing Bulls']

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles'

function fmt(dateStr: string) {
  const date = new Date(dateStr)
  const time = date.toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const tz = date.toLocaleTimeString('en-US', { timeZone: USER_TZ, timeZoneName: 'short' }).split(' ').pop()
  return `${time} ${tz}`
}

function fmtShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: USER_TZ, month: 'short', day: 'numeric',
  })
}

// ── Driver Dropdown ───────────────────────────────────────────────────────────
function PitStopLapPicker({ value, disabled, totalLaps, onChange }: {
  value: number; disabled: boolean; totalLaps?: number | null; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <button type="button" disabled={disabled}
          onClick={() => !disabled && onChange(Math.max(1, value - 1))}
          style={{ width: 40, height: 40, border: '1px solid #ddd', background: disabled ? '#fafafa' : 'white', fontSize: '20px', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' }}>−</button>
        <span style={{ fontSize: '24px', fontWeight: 700, minWidth: 48, textAlign: 'center' as const }}>{value || '?'}</span>
        <button type="button" disabled={disabled}
          onClick={() => !disabled && onChange(totalLaps ? Math.min(totalLaps, value + 1) : value + 1)}
          style={{ width: 40, height: 40, border: '1px solid #ddd', background: disabled ? '#fafafa' : 'white', fontSize: '20px', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' }}>+</button>
        <span style={{ fontSize: '11px', color: '#aaa' }}>lap</span>
      </div>
      {totalLaps && (
        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'center' as const, marginTop: 4 }}>race is {totalLaps} laps</div>
      )}
    </div>
  )
}

function TeammateBattlePicker({ assignedTeam, value, disabled, onChange }: {
  assignedTeam: string | null; value: string; disabled: boolean; onChange: (v: string) => void
}) {
  if (!assignedTeam) return <div style={{ fontSize: '11px', color: '#aaa' }}>team assigned before qualifying</div>
  const teamDrivers = F1_GRID.find(t => t.name === assignedTeam)?.drivers || []
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#888', marginBottom: 6 }}>{assignedTeam}</div>
      <div style={{ display: 'flex', gap: 0 }}>
        {teamDrivers.map((driver, i) => {
          const active = value === driver.name
          return (
            <button key={driver.name} type="button" disabled={disabled}
              onClick={() => !disabled && onChange(driver.name)}
              style={{ flex: 1, padding: '8px 4px', border: '1px solid', borderRight: i === 0 ? 'none' : undefined, borderColor: active ? '#C8102E' : '#ddd', background: active ? '#C8102E' : disabled ? '#fafafa' : 'white', color: active ? 'white' : '#555', fontSize: '11px', fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' as const }}>
              <img src={driver.photo} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' as const }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              {driver.name.split(' ').pop()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DriverDropdown({ value, onChange, disabled, exclude = [], excludeTeams = [] }: {
  value: string; onChange: (v: string) => void; disabled: boolean; exclude?: string[]; excludeTeams?: string[]
}) {
  const [open, setOpen] = useState(false)
  const driver = F1_GRID.flatMap(t => t.drivers).find(d => d.name === value)
  const team = F1_GRID.find(t => t.drivers.some(d => d.name === value))
  const filteredGrid = excludeTeams.length > 0 ? F1_GRID.filter(t => !excludeTeams.includes(t.name)) : F1_GRID

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
          cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
          textAlign: 'left' as const, display: 'flex', alignItems: 'center', gap: 8,
        }}>
        {driver && team ? (
          <>
            <img src={driver.photo} alt="" width={28} height={28}
              style={{ borderRadius: '50%', objectFit: 'cover' as const, flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{driver.name}</div>
              <div style={{ fontSize: '10px', color: team.color }}>{team.name}</div>
            </div>
            <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>#{driver.number}</span>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: '#aaa', flex: 1 }}>select driver...</span>
        )}
        {!disabled && <span style={{ fontSize: '10px', color: '#aaa', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>}
      </button>

      {open && (
        <div style={{
          position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', border: '1px solid #ddd', borderTop: 'none',
          maxHeight: 300, overflowY: 'auto' as const, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {value && (
            <button type="button" onMouseDown={e => { e.preventDefault(); select('') }}
              style={{ width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f0f0f0', background: '#fafafa', color: '#aaa', fontSize: '11px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer' }}>
              — clear
            </button>
          )}
          {filteredGrid.map(t => (
            <div key={t.name}>
              <div style={{ padding: '5px 12px 4px', background: '#f8f8f8', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src={t.logo} alt="" height={14} style={{ objectFit: 'contain' as const }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: t.color, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t.name}</span>
              </div>
              {t.drivers.filter(d => !exclude.includes(d.name)).map(d => (
                <button key={d.name} type="button"
                  onMouseDown={e => { e.preventDefault(); select(d.name) }}
                  style={{
                    width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f5f5f5',
                    background: value === d.name ? '#fff5f5' : 'white',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <img src={d.photo} alt="" width={30} height={30}
                    style={{ borderRadius: '50%', objectFit: 'cover' as const, flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: value === d.name ? 700 : 400, color: value === d.name ? '#C8102E' : '#111' }}>{d.name}</span>
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

// ── Podium Order Picker ───────────────────────────────────────────────────────
function PodiumOrderPicker({ p1, p2, p3, onChange, disabled }: {
  p1: string; p2: string; p3: string
  onChange: (pos: 1 | 2 | 3, driver: string) => void
  disabled: boolean
}) {
  const labels = ['🥇 P1', '🥈 P2', '🥉 P3']
  const values = [p1, p2, p3]
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
      {([1, 2, 3] as const).map((pos, i) => (
        <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#555', width: 28, flexShrink: 0 }}>{labels[i]}</span>
          <div style={{ flex: 1 }}>
            <DriverDropdown
              value={values[i]} disabled={disabled}
              exclude={values.filter((_, j) => j !== i).filter(Boolean)}
              onChange={v => onChange(pos, v)}
            />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
        5 pts exact position · 2 pts correct driver wrong position
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface F1Session { id: number; competition_id: number; competition_name: string; season: number; session_type: string; date: string; status: string; results: any; scored: boolean; teammate_battle_team?: string | null; total_laps?: number | null }
interface PoolRule { category_id: string; points: number; bonus_points: number; name: string; input_type: string }

function isLocked(session: F1Session, deadlineType: string, gpSessions: F1Session[]) {
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
  const [memberPreds, setMemberPreds] = useState<Record<string, any>>({})
  const [members, setMembers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [gpIndex, setGpIndex] = useState(0)
  const LS_KEY = `f1_preds_${poolId}_${userId}`
  const autoSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const predsRef = useRef(preds)
  const poolRulesRef = useRef(poolRules)
  const sessionsRef = useRef(sessions)
  useEffect(() => { predsRef.current = preds }, [preds])
  useEffect(() => { poolRulesRef.current = poolRules }, [poolRules])
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  // Use a ref for saveSession so updatePred always calls the latest version
  const saveSessionRef = useRef<(sessionId: number) => Promise<void>>(async () => {})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [sessionsRes, rulesRes, myPredsRes, allPredsRes, membersRes] = await Promise.all([
        supabase.from('f1_sessions').select('*').eq('tournament_id', tournamentId).order('date'),
        supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId).limit(10000),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).limit(10000),
        supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
      ])

      const allSessions = sessionsRes.data || []
      setSessions(allSessions)
      setPoolRules((rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id, points: r.points, bonus_points: r.bonus_points || 0,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'player',
      })))

      // Load my predictions
      const predMap: Record<string, any> = {}
      for (const p of myPredsRes.data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
      
      // Merge localStorage backup — push any picks not yet in DB
      try {
        const lsKey = `f1_preds_${poolId}_${userId}`
        const lsRaw = localStorage.getItem(lsKey)
        if (lsRaw) {
          const lsPreds: Record<string, any> = JSON.parse(lsRaw)
          // Snapshot DB keys BEFORE mutating predMap
          const dbKeys = new Set(Object.keys(predMap))
          const rowsToInsert: any[] = []
          Object.entries(lsPreds).forEach(([key, lsPred]: [string, any]) => {
            if (!lsPred?.value_text) return
            if (dbKeys.has(key)) return // already in DB
            predMap[key] = lsPred
            const fixtureId = lsPred.fixture_id ?? parseInt(key.split(':')[0])
            const categoryId = lsPred.category_id ?? key.split(':').slice(1).join(':')
            if (!fixtureId || isNaN(fixtureId) || !categoryId) return
            rowsToInsert.push({
              pool_id: poolId, user_id: userId,
              fixture_id: fixtureId, category_id: categoryId,
              value_text: lsPred.value_text, value_wld: null, value_yesno: null,
              value_number: null, value_ou: null, submitted_at: new Date().toISOString(),
            })
          })
          if (rowsToInsert.length > 0) {
            const { error } = await supabase.from('predictions_v2').insert(rowsToInsert)
            if (error) console.error('localStorage merge error:', error.message)
          }
        }
      } catch (e) { console.error('localStorage merge error:', e) }

      setPreds(predMap)

      // Load all members' predictions for display after sessions are locked
      const allPredMap: Record<string, any> = {}
      for (const p of allPredsRes.data || []) {
        allPredMap[`${p.user_id}:${p.fixture_id}:${p.category_id}`] = p
      }
      setMemberPreds(allPredMap)

      // Load member names
      const memberMap: Record<string, string> = {}
      for (const m of membersRes.data || []) memberMap[m.user_id] = m.display_name
      setMembers(memberMap)

      // Find the current live GP first, then next upcoming
      const gpNames = [...new Set(allSessions.map((s: F1Session) => s.competition_name))]
      const now = new Date()
      // Prefer a GP with a live session
      const liveIdx = gpNames.findIndex(gp =>
        allSessions.some((s: F1Session) => s.competition_name === gp && s.status === 'In Progress')
      )
      if (liveIdx >= 0) {
        setGpIndex(liveIdx)
      } else {
        const nextIdx = gpNames.findIndex(gp => {
          const gpSessions = allSessions.filter((s: F1Session) => s.competition_name === gp)
          const race = gpSessions.find((s: F1Session) => s.session_type === 'Race')
          return race && new Date(race.date) > now
        })
        setGpIndex(nextIdx >= 0 ? nextIdx : Math.max(0, gpNames.length - 1))
      }
      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  function updatePred(sessionId: number, categoryId: string, value: any) {
    const scrollY = window.scrollY
    const key = `${sessionId}:${categoryId}`
    setPreds(prev => {
      const updated = { ...prev, [key]: { ...(prev[key] || { fixture_id: sessionId, category_id: categoryId }), ...value } }
      // Persist to localStorage as backup
      try {
        const toStore: Record<string, any> = {}
        Object.entries(updated).forEach(([k, v]: [string, any]) => {
          if (v.value_text || v.value_wld || v.value_yesno !== null) toStore[k] = v
        })
        localStorage.setItem(LS_KEY, JSON.stringify(toStore))
      } catch {}
      return updated
    })
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
    if (autoSaveTimers.current[sessionId]) clearTimeout(autoSaveTimers.current[sessionId])
    autoSaveTimers.current[sessionId] = setTimeout(() => saveSessionRef.current(sessionId), 800)
  }

  const saveSession = useCallback(async (sessionId: number) => {
    setSaving(sessionId)
    const supabase = createClient()
    const currentPreds = predsRef.current
    const currentRules = poolRulesRef.current
    const currentSessions = sessionsRef.current
    const session = currentSessions.find(s => s.id === sessionId)
    if (!session) { setSaving(null); return }
    const catIds = SESSION_CATEGORIES[session.session_type] || []
    const rows: any[] = []

    for (const r of currentRules.filter(r => catIds.includes(r.category_id))) {
      if (r.category_id === 'f1_podium_order') {
        for (const pos of [1, 2, 3]) {
          const val = currentPreds[`${sessionId}:f1_podium_order_${pos}`]?.value_text
          if (val) rows.push({
            pool_id: poolId, user_id: userId, fixture_id: sessionId,
            category_id: `f1_podium_order_${pos}`, value_text: val,
            value_wld: null, value_yesno: null, value_number: null, value_ou: null,
            submitted_at: new Date().toISOString(),
          })
        }
        continue
      }
      const pred = currentPreds[`${sessionId}:${r.category_id}`]
      if (pred?.value_text || pred?.value_yesno !== null && pred?.value_yesno !== undefined || pred?.value_number !== null && pred?.value_number !== undefined)
        rows.push({
          pool_id: poolId, user_id: userId, fixture_id: sessionId,
          category_id: r.category_id,
          value_text: pred.value_text ?? null, value_wld: null,
          value_yesno: pred.value_yesno ?? null,
          value_number: pred.value_number ?? null, value_ou: null,
          submitted_at: new Date().toISOString(),
        })
    }

    if (rows.length > 0) {
      await supabase.from('predictions_v2').upsert(rows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
    }
    setSaving(null)
    setSaved(prev => ({ ...prev, [sessionId]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [sessionId]: false })), 3000)
  }, [poolId, userId])

  // Keep saveSessionRef in sync with latest saveSession
  useEffect(() => { saveSessionRef.current = saveSession }, [saveSession])

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px', padding: 16 }}>loading sessions...</div>

  // Group ALL sessions by GP for lock time calculation
  const allGpMap: Record<string, F1Session[]> = {}
  for (const s of sessions) {
    if (!allGpMap[s.competition_name]) allGpMap[s.competition_name] = []
    allGpMap[s.competition_name].push(s)
  }

  // Group only scoreable sessions by GP for display
  const gpMap: Record<string, F1Session[]> = {}
  for (const s of sessions) {
    const hasCats = (SESSION_CATEGORIES[s.session_type] || []).some(c =>
      c === 'f1_podium_order' ? poolRules.some(r => r.category_id === 'f1_podium_order') : poolRules.some(r => r.category_id === c)
    )
    if (!hasCats) continue
    if (!gpMap[s.competition_name]) gpMap[s.competition_name] = []
    gpMap[s.competition_name].push(s)
  }

  const gpNames = Object.keys(gpMap)
  if (gpNames.length === 0) return <div style={{ color: '#aaa', fontSize: '12px', padding: 16 }}>no sessions found</div>

  const safeIdx = Math.min(gpIndex, gpNames.length - 1)
  const currentGP = gpNames[safeIdx]
  const gpSessions = gpMap[currentGP] || []
  const sorted = gpSessions.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const race = sorted.find(s => s.session_type === 'Race')
  const hasSprint = sorted.some(s => s.session_type === 'Sprint')
  const isCompleted = race?.status === 'Completed'

  return (
    <div>
      {/* GP Navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setGpIndex(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === 0 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === 0 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center' as const }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>🏎 {currentGP}</div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
            {race ? fmtShort(race.date) : ''}
            {hasSprint && <span style={{ color: '⚡', marginLeft: 6 }}>⚡ Sprint</span>}
            {isCompleted && <span style={{ color: '#2d7a2d', marginLeft: 6 }}>✓ completed</span>}
            {' · '}{safeIdx + 1} of {gpNames.length}
          </div>
        </div>
        <button type="button" onClick={() => setGpIndex(i => Math.min(gpNames.length - 1, i + 1))} disabled={safeIdx === gpNames.length - 1}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === gpNames.length - 1 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === gpNames.length - 1 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ›
        </button>
      </div>

      {/* Lock deadline banner */}
      {(() => {
        const allForGP = allGpMap[currentGP] || gpSessions
        const firstSession = allForGP.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
        const lockTime = new Date(firstSession.date)
        const isWeekendLocked = deadlineType === 'before_weekend' && lockTime <= new Date()
        const locksSoon = !isWeekendLocked && lockTime.getTime() - Date.now() < 24 * 60 * 60 * 1000
        const isLiveNow = (allGpMap[currentGP] || gpSessions).some(s => s.status === 'In Progress')
        if (isLiveNow) return null // live shown per-session card now
        if (isWeekendLocked) return (
          <div style={{ padding: '8px 14px', background: '#f5f5f5', borderBottom: '1px solid #e0e0db', fontSize: '11px', color: '#aaa' }}>
            🔒 predictions locked — weekend started {fmt(firstSession.date)}
          </div>
        )
        return (
          <div style={{ padding: '8px 14px', background: locksSoon ? '#fffbf0' : '#f0fff4', borderBottom: '1px solid #e0e0db', fontSize: '11px', color: locksSoon ? '#b45309' : '#2d7a2d' }}>
            {deadlineType === 'before_weekend'
              ? `⏰ all picks lock ${fmt(firstSession.date)} — before ${SESSION_LABEL[firstSession.session_type] || firstSession.session_type} starts`
              : `picks lock before each session starts`
            }
          </div>
        )
      })()}

      {/* Sessions for current GP */}
      {sorted.map(session => {
        const catIds = SESSION_CATEGORIES[session.session_type] || []
        const sessionRules = poolRules.filter(r => catIds.includes(r.category_id))
        if (sessionRules.length === 0) return null
        const locked = isLocked(session, deadlineType, allGpMap[currentGP] || gpSessions)
        const isLive = session.status === 'In Progress'

        return (
          <div key={session.id} style={{
            marginBottom: 12,
            border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
            borderLeft: isLive ? '4px solid #2d7a2d' : '1px solid #e0e0db',
            background: 'white',
          }}>
            {/* Live banner */}
            {isLive && (
              <div style={{ background: '#2d7a2d', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
                  LIVE
                </span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>session will be marked as live while awaiting FIA confirmation</span>
              </div>
            )}
            {/* Session header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '14px' }}>{session.session_type === 'Race' ? '🏁' : session.session_type === 'Sprint' ? '⚡' : '⏱'}</span>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{SESSION_LABEL[session.session_type] || session.session_type}</span>
                {locked
                  ? <span style={{ fontSize: '10px', color: '#aaa' }}>🔒 locked</span>
                  : saving === session.id
                  ? <span style={{ fontSize: '10px', color: '#aaa' }}>saving...</span>
                  : saved[session.id]
                  ? <span style={{ fontSize: '10px', color: '#2d7a2d' }}>✓ saved</span>
                  : null
                }
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: '11px', color: '#aaa' }}>{fmt(session.date)}</div>
                {!locked && deadlineType === 'before_session' && (
                  <div style={{ fontSize: '10px', color: '#C8102E' }}>picks lock at start</div>
                )}
              </div>
            </div>

            {/* Categories */}
            <div style={{ padding: '12px 14px' }}>
              {sessionRules.map(rule => {
                const pred = preds[`${session.id}:${rule.category_id}`]
                const p1 = preds[`${session.id}:f1_podium_order_1`]?.value_text || ''
                const p2 = preds[`${session.id}:f1_podium_order_2`]?.value_text || ''
                const p3 = preds[`${session.id}:f1_podium_order_3`]?.value_text || ''

                return (
                  <div key={rule.category_id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>
                        {rule.category_id === 'f1_q1_eliminated' ? 'pick a driver out in Q1'
                          : rule.category_id === 'f1_q3_qualifier' ? 'pick a driver who will make it to Q3'
                          : rule.category_id === 'f1_first_pit_lap' ? 'lap of the first pit stop (closest wins)'
                          : rule.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                    </div>

                    {rule.category_id === 'f1_podium_order' ? (
                      <div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          {['🥇 P1', '🥈 P2', '🥉 P3'].map(label => (
                            <div key={label} style={{ flex: 1, fontSize: '10px', color: '#888', textAlign: 'center' as const }}>{label}</div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {([1, 2, 3] as const).map(pos => {
                            const posPred = preds[`${session.id}:f1_podium_order_${pos}`]
                            const pts = posPred?.points_earned
                            const isExact = pts === rule.points
                            const isPartial = pts > 0 && pts < rule.points
                            return (
                              <div key={pos} style={{ flex: 1 }}>
                                <DriverDropdown
                                  value={posPred?.value_text || ''}
                                  disabled={locked}
                                  exclude={([1,2,3] as const).filter(p => p !== pos).map(p => preds[`${session.id}:f1_podium_order_${p}`]?.value_text).filter(Boolean) as string[]}
                                  onChange={v => updatePred(session.id, `f1_podium_order_${pos}`, { value_text: v })}
                                />
                                {locked && pts !== null && pts !== undefined && (
                                  <div style={{ fontSize: '10px', marginTop: 2, textAlign: 'center' as const, color: isExact ? '#2d7a2d' : isPartial ? '#b45309' : '#aaa' }}>
                                    {isExact ? `✓ +${pts}` : isPartial ? `~ +${pts}` : '✗'}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: 4 }}>
                          {rule.points} pts exact · {rule.bonus_points || 2} pts right driver wrong spot (~)
                        </div>
                      </div>
                    ) : rule.category_id === 'f1_q1_eliminated' ? (
                      <DriverDropdown value={pred?.value_text || ''} disabled={locked}
                        excludeTeams={Q1_EXCLUDED_TEAMS}
                        onChange={v => updatePred(session.id, rule.category_id, { value_text: v })} />
                    ) : rule.category_id === 'f1_q3_qualifier' ? (
                      <DriverDropdown value={pred?.value_text || ''} disabled={locked}
                        excludeTeams={Q3_EXCLUDED_TEAMS}
                        onChange={v => updatePred(session.id, rule.category_id, { value_text: v })} />
                    ) : rule.category_id === 'f1_first_pit_lap' ? (
                      <PitStopLapPicker
                        value={pred?.value_number || 0}
                        disabled={locked}
                        totalLaps={sorted.find(s => s.session_type === 'Race')?.total_laps || session.total_laps}
                        onChange={v => updatePred(session.id, rule.category_id, { value_number: v })}
                      />
                    ) : rule.category_id === 'f1_teammate_battle' ? (
                      <TeammateBattlePicker
                        assignedTeam={session.teammate_battle_team || 
                          sorted.find(s => s.session_type === 'Race')?.teammate_battle_team || null}
                        value={pred?.value_text || ''}
                        disabled={locked}
                        onChange={v => updatePred(session.id, rule.category_id, { value_text: v })}
                      />
                    ) : rule.input_type === 'player' ? (
                      <DriverDropdown value={pred?.value_text || ''} disabled={locked}
                        onChange={v => updatePred(session.id, rule.category_id, { value_text: v })} />
                    ) : rule.input_type === 'yesno' ? (
                      <div style={{ display: 'flex', gap: 0 }}>
                        {['yes', 'no'].map((opt, i) => {
                          const val = opt === 'yes'
                          const active = pred?.value_yesno === val
                          return (
                            <button key={opt} type="button" disabled={locked}
                              onClick={() => !locked && updatePred(session.id, rule.category_id, { value_yesno: val })}
                              style={{ flex: 1, padding: '8px', border: '1px solid', borderRight: i === 0 ? 'none' : undefined, borderColor: active ? '#C8102E' : '#ddd', background: active ? '#C8102E' : locked ? '#fafafa' : 'white', color: active ? 'white' : '#555', fontSize: '12px', fontFamily: 'inherit', cursor: locked ? 'default' : 'pointer' }}>
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    {rule.category_id !== 'f1_podium_order' && pred?.is_correct !== null && pred?.is_correct !== undefined && (
                      <div style={{ fontSize: '10px', marginTop: 3, color: pred.is_correct ? '#2d7a2d' : '#aaa' }}>
                        {pred.is_correct ? `✓ +${pred.points_earned} pts` : '✗ no points'}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Auto-save message / saving indicator */}
              {!locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                  {saving === session.id
                    ? <span style={{ fontSize: '11px', color: '#aaa' }}>saving...</span>
                    : saved[session.id]
                    ? <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ saved</span>
                    : <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ predictions are automatically saved</span>
                  }
                </div>
              )}

              {/* Everyone's picks — table layout matching soccer */}
              {locked && Object.keys(members).length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 8 }}>everyone's picks</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr>
                          <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}></td>
                          {sessionRules.flatMap(r => r.category_id === 'f1_podium_order'
                            ? [
                                <td key="p1" style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>🥇 P1</td>,
                                <td key="p2" style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>🥈 P2</td>,
                                <td key="p3" style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>🥉 P3</td>,
                              ]
                            : [<td key={r.category_id} style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const, textAlign: 'center' as const }}>{r.name}</td>]
                          )}
                          <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>pts</td>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(members)
                          .filter(([memberId]) =>
                            sessionRules.some(r => {
                              const key = r.category_id === 'f1_podium_order'
                                ? `${memberId}:${session.id}:f1_podium_order_1`
                                : `${memberId}:${session.id}:${r.category_id}`
                              const p = memberPreds[key]
                              return p?.value_text || p?.value_yesno != null
                            })
                          )
                          .map(([memberId, name]) => {
                            const totalPts = sessionRules.reduce((sum, r) => {
                              if (r.category_id === 'f1_podium_order') {
                                return sum + ([1,2,3] as const).reduce((s, pos) => {
                                  return s + (memberPreds[`${memberId}:${session.id}:f1_podium_order_${pos}`]?.points_earned ?? 0)
                                }, 0)
                              }
                              return sum + (memberPreds[`${memberId}:${session.id}:${r.category_id}`]?.points_earned ?? 0)
                            }, 0)
                            return { memberId, name, totalPts }
                          })
                          .sort((a, b) => b.totalPts - a.totalPts)
                          .map(({ memberId, name, totalPts }) => {
                            const isMe = memberId === userId
                            return (
                              <tr key={memberId} style={{ background: isMe ? '#fff5f5' : 'transparent' }}>
                                <td style={{ padding: '4px 6px', fontWeight: isMe ? 700 : 400, color: isMe ? '#C8102E' : '#555', whiteSpace: 'nowrap' as const, borderTop: '1px solid #f5f5f5' }}>
                                  {name}{isMe ? ' (you)' : ''}
                                </td>
                                {sessionRules.flatMap(r => {
                                  if (r.category_id === 'f1_podium_order') {
                                    return ([1, 2, 3] as const).map(pos => {
                                      const p = memberPreds[`${memberId}:${session.id}:f1_podium_order_${pos}`]
                                      const pick = p?.value_text
                                      // Determine result from session results stored in DB
                                      const sessionResults: any[] = (session as any).results || []
                                      const finishers = [...sessionResults].sort((a: any, b: any) => a.position - b.position)
                                      const actualAtPos = finishers[pos - 1]?.driver_name
                                      const podiumDrivers = finishers.slice(0, 3).map((f: any) => f.driver_name)
                                      let indicator = ''
                                      let color = '#555'
                                      if (pick && actualAtPos) {
                                        const exactMatch = driverNameMatches(pick, actualAtPos)
                                        const onPodium = podiumDrivers.some((n: string) => driverNameMatches(pick, n))
                                        if (exactMatch) { indicator = ' ✓'; color = '#2d7a2d' }
                                        else if (onPodium) { indicator = ' ~'; color = '#b45309' }
                                        else { indicator = ' ✗'; color = '#aaa' }
                                      }
                                      return (
                                        <td key={`podium_${pos}`} style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', color, whiteSpace: 'nowrap' as const }}>
                                          {pick ? `${pick}${indicator}` : <span style={{ color: '#ddd' }}>—</span>}
                                        </td>
                                      )
                                    })
                                  }
                                  const p = memberPreds[`${memberId}:${session.id}:${r.category_id}`]
                                  let display: string = '—'
                                  let correct: boolean | null = null
                                  if (r.category_id === 'f1_first_pit_lap') {
                                    display = p?.value_number != null ? `lap ${p.value_number}` : '—'
                                  } else if (p?.value_text) display = p.value_text
                                  else if (p?.value_yesno != null) display = p.value_yesno ? 'yes' : 'no'
                                  correct = p?.is_correct ?? null
                                  return [
                                    <td key={r.category_id} style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', color: correct === true ? '#2d7a2d' : correct === false ? '#aaa' : '#555', whiteSpace: 'nowrap' as const }}>
                                      {display === '—' ? <span style={{ color: '#ddd' }}>—</span> : display}
                                      {correct === true && ' ✓'}
                                      {correct === false && ' ✗'}
                                    </td>
                                  ]
                                })}
                                <td style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', fontWeight: 600, color: totalPts > 0 ? '#C8102E' : '#aaa' }}>
                                  {totalPts}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                      {/* Actual results row */}
                      {session.results && Array.isArray(session.results) && session.results.length > 0 && (() => {
                        const results: any[] = session.results
                        const fastestLapEntry = results.find((r: any) => r.fastest_lap_driver !== undefined)
                        const fastestLapDriver = fastestLapEntry?.fastest_lap_driver || null
                        const finishers = results.filter((r: any) => r.position && r.time !== 'DNF').sort((a: any, b: any) => a.position - b.position)
                        const dnfs = results.filter((r: any) => r.position && r.time === 'DNF').sort((a: any, b: any) => a.laps - b.laps)
                        const winner = finishers[0]?.driver_name
                        const poleSitter = results.find((r: any) => r.grid === '1')?.driver_name 
                          || finishers.find((r: any) => r.position === 1)?.driver_name
                        const firstRetirement = dnfs[0]?.driver_name

                        return (
                          <tfoot>
                            <tr>
                              <td style={{ padding: '6px 6px 2px', fontSize: '10px', fontWeight: 700, color: '#2d7a2d', borderTop: '2px solid #eee', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>actual</td>
                              {sessionRules.flatMap(r => {
                                if (r.category_id === 'f1_podium_order') {
                                  return ([1, 2, 3] as const).map(pos => (
                                    <td key={`actual_p${pos}`} style={{ padding: '6px 6px 2px', textAlign: 'center' as const, borderTop: '2px solid #eee', fontSize: '11px', fontWeight: 600, color: '#2d7a2d', whiteSpace: 'nowrap' as const }}>
                                      {finishers[pos - 1]?.driver_name || '—'}
                                    </td>
                                  ))
                                }
                                let actual = '—'
                                if (r.category_id === 'f1_race_winner') actual = winner || '—'
                                else if (r.category_id === 'f1_pole_position') actual = poleSitter || '—'
                                else if (r.category_id === 'f1_first_retirement') actual = firstRetirement || '—'
                                else if (r.category_id === 'f1_fastest_lap') actual = fastestLapDriver || '—'
                                else if (r.category_id === 'f1_podium') actual = finishers.slice(0,3).map((f:any) => f.driver_name).join(', ') || '—'
                                else if (r.category_id === 'f1_sprint_winner') actual = winner || '—'
                                else if (r.category_id === 'f1_pole_to_win') actual = (poleSitter && winner) ? (poleSitter === winner ? 'yes' : 'no') : '—'
                                else if (r.category_id === 'f1_first_pit_lap') {
                                  const pitEntry = results.find((r: any) => r.first_pit_lap !== undefined)
                                  actual = pitEntry?.first_pit_lap != null ? `lap ${pitEntry.first_pit_lap}` : '—'
                                }
                                else if (r.category_id === 'f1_q1_eliminated') {
                                  const q1Entry = results.find((r: any) => r.q1_eliminated !== undefined)
                                  if (q1Entry?.q1_eliminated) {
                                    const eligible = q1Entry.q1_eliminated.filter((name: string) => {
                                      const team = F1_GRID.find(t => t.drivers.some((d: any) => d.name === name || name.includes(d.name.split(' ').pop())))
                                      return team && !Q1_EXCLUDED_TEAMS.includes(team.name)
                                    })
                                    actual = eligible.map((n: string) => n.split(' ').pop()).join(', ') || '—'
                                  }
                                }
                                else if (r.category_id === 'f1_q3_qualifier') {
                                  const q3Entry = results.find((r: any) => r.q3_qualifiers !== undefined)
                                  if (q3Entry?.q3_qualifiers) {
                                    const eligible = q3Entry.q3_qualifiers.filter((name: string) => {
                                      const team = F1_GRID.find(t => t.drivers.some((d: any) => d.name === name || name.includes(d.name.split(' ').pop())))
                                      return team && !Q3_EXCLUDED_TEAMS.includes(team.name)
                                    })
                                    actual = eligible.map((n: string) => n.split(' ').pop()).join(', ') || '—'
                                  }
                                }
                                return [
                                  <td key={`actual_${r.category_id}`} style={{ padding: '6px 6px 2px', textAlign: 'center' as const, borderTop: '2px solid #eee', fontSize: '11px', fontWeight: 600, color: '#2d7a2d', whiteSpace: 'nowrap' as const }}>
                                    {actual}
                                  </td>
                                ]
                              })}
                              <td style={{ borderTop: '2px solid #eee' }} />
                            </tr>
                          </tfoot>
                        )
                      })()}
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        )
      })}
    </div>
  )
}
