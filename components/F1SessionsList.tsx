'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── 2026 F1 Grid — 11 teams, 22 drivers ──────────────────────────────────────
const F1_GRID = [
  {
    name: 'McLaren', color: '#FF8000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/mclaren-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Lando Norris', number: 4, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/L/LANNOR01_Lando_Norris/lannor01.png.transform/2col/image.png' },
      { name: 'Oscar Piastri', number: 81, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/O/OSCPIA01_Oscar_Piastri/oscpia01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Ferrari', color: '#E8002D',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/ferrari-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Charles Leclerc', number: 16, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/C/CHALEC01_Charles_Leclerc/chalec01.png.transform/2col/image.png' },
      { name: 'Lewis Hamilton', number: 44, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/L/LEWHAM01_Lewis_Hamilton/lewham01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Red Bull', color: '#3671C6',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/red-bull-racing-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Max Verstappen', number: 1, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/M/MAXVER01_Max_Verstappen/maxver01.png.transform/2col/image.png' },
      { name: 'Isack Hadjar', number: 6, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/I/ISAHAD01_Isack_Hadjar/isahad01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Mercedes', color: '#27F4D2',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/mercedes-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'George Russell', number: 63, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/G/GEORUS01_George_Russell/georus01.png.transform/2col/image.png' },
      { name: 'Kimi Antonelli', number: 12, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/A/ANDANT01_Andrea_Kimi_Antonelli/andant01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Aston Martin', color: '#229971',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/aston-martin-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Fernando Alonso', number: 14, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/F/FERALO01_Fernando_Alonso/feralo01.png.transform/2col/image.png' },
      { name: 'Lance Stroll', number: 18, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/L/LANSTR01_Lance_Stroll/lanstr01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Williams', color: '#64C4FF',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/williams-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Alexander Albon', number: 23, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/A/ALEALB01_Alexander_Albon/alealb01.png.transform/2col/image.png' },
      { name: 'Carlos Sainz', number: 55, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/C/CARSAI01_Carlos_Sainz/carsai01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Alpine', color: '#0093CC',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/alpine-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Pierre Gasly', number: 10, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/P/PIEGAS01_Pierre_Gasly/piegas01.png.transform/2col/image.png' },
      { name: 'Franco Colapinto', number: 43, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/F/FRACOL01_Franco_Colapinto/fracol01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Haas', color: '#B6BABD',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/haas-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Esteban Ocon', number: 31, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/E/ESTOCO01_Esteban_Ocon/estoco01.png.transform/2col/image.png' },
      { name: 'Oliver Bearman', number: 87, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/O/OLIBEA01_Oliver_Bearman/olibea01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Racing Bulls', color: '#6692FF',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/racing-bulls-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Liam Lawson', number: 30, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/L/LIALAW01_Liam_Lawson/lialaw01.png.transform/2col/image.png' },
      { name: 'Arvid Lindblad', number: 41, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/A/ARVLIN01_Arvid_Lindblad/arvlin01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Audi', color: '#C00000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/audi-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Nico Hülkenberg', number: 27, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/N/NICHUL01_Nico_Hulkenberg/nichul01.png.transform/2col/image.png' },
      { name: 'Gabriel Bortoleto', number: 5, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/G/GABBOR01_Gabriel_Bortoleto/gabbor01.png.transform/2col/image.png' },
    ],
  },
  {
    name: 'Cadillac', color: '#CC0000',
    logo: 'https://www.formula1.com/content/dam/fom-website/teams/2026/cadillac-logo.png.transform/2col/image.png',
    drivers: [
      { name: 'Sergio Pérez', number: 11, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/S/SERPER01_Sergio_Perez/serper01.png.transform/2col/image.png' },
      { name: 'Valtteri Bottas', number: 77, photo: 'https://www.formula1.com/content/dam/fom-website/drivers/V/VALBOT01_Valtteri_Bottas/valbot01.png.transform/2col/image.png' },
    ],
  },
]

// ── Session config ────────────────────────────────────────────────────────────
// Only show Q3 qualifying (pole) and Race sessions — simplified UX
const SESSION_CATEGORIES: Record<string, string[]> = {
  'Race':           ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_top6_teammate'],
  '3rd Qualifying': ['f1_pole_position', 'f1_top3_quali'],
  'Sprint':         ['f1_sprint_winner', 'f1_sprint_podium'],
}

const SESSION_LABEL: Record<string, string> = {
  '3rd Qualifying': 'Qualifying', 'Race': 'Race', 'Sprint': 'Sprint',
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles'

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: USER_TZ, month: 'short', day: 'numeric',
  })
}

// ── Driver Dropdown ───────────────────────────────────────────────────────────
function DriverDropdown({ value, onChange, disabled, exclude = [] }: {
  value: string; onChange: (v: string) => void; disabled: boolean; exclude?: string[]
}) {
  const [open, setOpen] = useState(false)
  const driver = F1_GRID.flatMap(t => t.drivers).find(d => d.name === value)
  const team = F1_GRID.find(t => t.drivers.some(d => d.name === value))

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
          {F1_GRID.map(t => (
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
interface F1Session { id: number; competition_id: number; competition_name: string; season: number; session_type: string; date: string; status: string; results: any; scored: boolean }
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [gpIndex, setGpIndex] = useState(0)
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const predsRef = useRef(preds)
  useEffect(() => { predsRef.current = preds }, [preds])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [sessionsRes, rulesRes, predsRes] = await Promise.all([
        supabase.from('f1_sessions').select('*').eq('tournament_id', tournamentId).order('date'),
        supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId).limit(10000),
      ])
      const allSessions = sessionsRes.data || []
      setSessions(allSessions)
      setPoolRules((rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id, points: r.points, bonus_points: r.bonus_points || 0,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'player',
      })))
      const predMap: Record<string, any> = {}
      for (const p of predsRes.data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
      setPreds(predMap)

      // Find the next upcoming GP and set that as the initial page
      const gpNames = [...new Set(allSessions.map(s => s.competition_name))]
      const now = new Date()
      const nextIdx = gpNames.findIndex(gp => {
        const gpSessions = allSessions.filter(s => s.competition_name === gp)
        const race = gpSessions.find(s => s.session_type === 'Race')
        return race && new Date(race.date) > now
      })
      setGpIndex(nextIdx >= 0 ? nextIdx : Math.max(0, gpNames.length - 1))
      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  function updatePred(sessionId: number, categoryId: string, value: any) {
    const scrollY = window.scrollY
    setPreds(prev => ({ ...prev, [`${sessionId}:${categoryId}`]: { ...prev[`${sessionId}:${categoryId}`], category_id: categoryId, ...value } }))
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
    if (saveTimers.current[sessionId]) clearTimeout(saveTimers.current[sessionId])
    saveTimers.current[sessionId] = setTimeout(() => savePreds(sessionId), 800)
  }

  const savePreds = useCallback(async (sessionId: number) => {
    setSaving(sessionId)
    const supabase = createClient()
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    const catIds = SESSION_CATEGORIES[session.session_type] || []
    const rows: any[] = []
    console.log('savePreds:', sessionId, session.session_type, 'catIds:', catIds)
    console.log('poolRules:', poolRules.map(r => r.category_id))
    console.log('predsRef keys:', Object.keys(predsRef.current).filter(k => k.startsWith(String(sessionId))))

    for (const r of poolRules.filter(r => catIds.includes(r.category_id))) {
      if (r.category_id === 'f1_podium_order') {
        for (const pos of [1, 2, 3]) {
          const val = predsRef.current[`${sessionId}:f1_podium_order_${pos}`]?.value_text
          if (val) rows.push({ pool_id: poolId, user_id: userId, fixture_id: sessionId, category_id: `f1_podium_order_${pos}`, value_text: val, value_wld: null, value_yesno: null, value_number: null, value_ou: null, submitted_at: new Date().toISOString() })
        }
        continue
      }
      const pred = predsRef.current[`${sessionId}:${r.category_id}`]
      if (pred?.value_text || pred?.value_wld || (pred?.value_yesno !== null && pred?.value_yesno !== undefined))
        rows.push({ pool_id: poolId, user_id: userId, fixture_id: sessionId, category_id: r.category_id, value_text: pred.value_text ?? null, value_wld: pred.value_wld ?? null, value_yesno: pred.value_yesno ?? null, value_number: null, value_ou: null, submitted_at: new Date().toISOString() })
    }
    if (rows.length > 0) await supabase.from('predictions_v2').upsert(rows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
    setSaving(null)
  }, [poolId, userId, poolRules, sessions])

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px', padding: 16 }}>loading sessions...</div>

  // Group by GP, filter to only GPs with scoreable sessions
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

      {/* Sessions for current GP */}
      {sorted.map(session => {
        const catIds = SESSION_CATEGORIES[session.session_type] || []
        const sessionRules = poolRules.filter(r => catIds.includes(r.category_id))
        if (sessionRules.length === 0) return null
        const locked = isLocked(session, deadlineType, gpSessions)

        return (
          <div key={session.id} style={{ marginBottom: 12, border: '1px solid #e0e0db', background: 'white' }}>
            {/* Session header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '14px' }}>{session.session_type === 'Race' ? '🏁' : session.session_type === 'Sprint' ? '⚡' : '⏱'}</span>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{SESSION_LABEL[session.session_type] || session.session_type}</span>
                {locked && <span style={{ fontSize: '10px', color: '#aaa' }}>🔒 locked</span>}
                {saving === session.id && <span style={{ fontSize: '10px', color: '#aaa' }}>saving...</span>}
              </div>
              <span style={{ fontSize: '11px', color: '#aaa' }}>{fmt(session.date)}</span>
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
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>{rule.name}</span>
                      <span style={{ fontSize: '11px', color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                    </div>

                    {rule.category_id === 'f1_podium_order' ? (
                      <PodiumOrderPicker p1={p1} p2={p2} p3={p3} disabled={locked}
                        onChange={(pos, driver) => updatePred(session.id, `f1_podium_order_${pos}`, { value_text: driver })} />
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

                    {pred?.is_correct !== null && pred?.is_correct !== undefined && (
                      <div style={{ fontSize: '10px', marginTop: 3, color: pred.is_correct ? '#2d7a2d' : '#aaa' }}>
                        {pred.is_correct ? `✓ +${pred.points_earned} pts` : '✗ no points'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
