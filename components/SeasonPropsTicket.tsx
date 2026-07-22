'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Player { id: number; name: string; team_id: number; position: string; team_name: string }
interface Pick { id?: string; value: string }

const PROP_META: Record<string, { label: string; type: 'team' | 'player' | 'goalkeeper' | 'teams3' }> = {
  title_winner: { label: 'Champion (1st)', type: 'team' },
  top_4_2nd: { label: '2nd place', type: 'team' },
  top_4_3rd: { label: '3rd place', type: 'team' },
  top_4_4th: { label: '4th place', type: 'team' },
  top_scorer: { label: 'Top scorer', type: 'player' },
  top_assist: { label: 'Top assist', type: 'player' },
  golden_glove: { label: 'Golden Glove', type: 'goalkeeper' },
  relegated: { label: 'Relegated teams (pick 3)', type: 'teams3' },
}

// Order categories should render in — top-4 positions grouped together, then the rest
const CATEGORY_ORDER = ['title_winner', 'top_4_2nd', 'top_4_3rd', 'top_4_4th', 'top_scorer', 'top_assist', 'golden_glove', 'relegated']

function TeamSelect({ value, onChange, teams, disabled, exclude }: {
  value: string; onChange: (v: string) => void; teams: string[]; disabled: boolean; exclude?: string[]
}) {
  return (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'inherit', background: disabled ? '#f9f9f9' : 'white', color: disabled ? '#aaa' : '#111' }}>
      <option value=''>select a team...</option>
      {teams.filter(t => t === value || !exclude?.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

function PlayerSearch({ value, onChange, players, disabled }: {
  value: string; onChange: (v: string) => void; players: Player[]; disabled: boolean
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = query.length > 0 ? players.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : []

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={query} disabled={disabled} placeholder="search player..."
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: disabled ? '#f9f9f9' : 'white', color: disabled ? '#aaa' : '#111' }} />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', borderTop: 'none', zIndex: 50, maxHeight: 180, overflowY: 'auto' as const }}>
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onChange(p.name); setQuery(p.name); setOpen(false) }}
              style={{ padding: '7px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
              {p.name} <span style={{ color: '#aaa' }}>· {p.team_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SeasonPropsTicket({ poolId, userId, tournamentId }: { poolId: string; userId: string; tournamentId: string }) {
  const [loading, setLoading] = useState(true)
  const [enabledCategories, setEnabledCategories] = useState<string[]>([])
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [teams, setTeams] = useState<string[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [relegatedSlots, setRelegatedSlots] = useState<[string, string, string]>(['', '', ''])
  const [lockTime, setLockTime] = useState<Date | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [rulesRes, picksRes, teamsRes, playersRes, fixturesRes] = await Promise.all([
        supabase.from('season_prop_rules').select('category').eq('pool_id', poolId),
        supabase.from('season_props').select('*').eq('pool_id', poolId).eq('user_id', userId),
        supabase.from('pl_teams').select('id, name').eq('season', 2026).order('name'),
        supabase.from('pl_players').select('id, name, team_id, position').eq('season', 2026).order('name'),
        supabase.from('fixtures').select('date').eq('tournament_id', tournamentId).eq('round', 'Matchday 1'),
      ])

      const cats = new Set((rulesRes.data || []).map((r: any) => r.category))
      setEnabledCategories(CATEGORY_ORDER.filter(c => cats.has(c)))

      const pickMap: Record<string, Pick> = {}
      ;(picksRes.data || []).forEach((p: any) => { pickMap[p.category] = { id: p.id, value: p.value_text || '' } })
      setPicks(pickMap)
      if (pickMap.relegated?.value) {
        const parts = pickMap.relegated.value.split(',').map((s: string) => s.trim())
        setRelegatedSlots([parts[0] || '', parts[1] || '', parts[2] || ''])
      }

      const teamMap: Record<number, string> = {}
      ;(teamsRes.data || []).forEach((t: any) => { teamMap[t.id] = t.name })
      setTeams((teamsRes.data || []).map((t: any) => t.name))
      setPlayers((playersRes.data || []).map((p: any) => ({ ...p, team_name: teamMap[p.team_id] || '' })))

      const dates = (fixturesRes.data || []).map((f: any) => new Date(f.date).getTime())
      if (dates.length > 0) setLockTime(new Date(Math.min(...dates)))

      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  const locked = !!lockTime && Date.now() >= lockTime.getTime()

  function savePick(category: string, value: string) {
    setPicks(prev => ({ ...prev, [category]: { ...prev[category], value } }))
    if (saveTimers.current[category]) clearTimeout(saveTimers.current[category])
    saveTimers.current[category] = setTimeout(async () => {
      const supabase = createClient()
      const existing = picks[category]
      if (existing?.id) {
        await supabase.from('season_props').update({ value_text: value }).eq('id', existing.id)
      } else {
        const { data } = await supabase.from('season_props').insert({
          pool_id: poolId, user_id: userId, category, value_text: value,
        }).select().single()
        if (data) setPicks(prev => ({ ...prev, [category]: { id: data.id, value } }))
      }
      setSavedFlash(prev => ({ ...prev, [category]: true }))
      setTimeout(() => setSavedFlash(prev => ({ ...prev, [category]: false })), 2000)
    }, 600)
  }

  function updateRelegatedSlot(index: 0 | 1 | 2, team: string) {
    const next: [string, string, string] = [...relegatedSlots] as [string, string, string]
    next[index] = team
    setRelegatedSlots(next)
    savePick('relegated', next.filter(Boolean).join(', '))
  }

  if (loading || enabledCategories.length === 0) return null

  return (
    <div style={{ background: 'white', border: '1px solid #e0e0db', borderLeft: '3px solid #C8102E', marginBottom: 16 }}>
      <div style={{ background: '#111', color: 'white', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>🏆 season-long predictions</div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
            {locked ? 'locked — season underway' : lockTime ? `locks at first kickoff · ${lockTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'predict before the season starts'}
          </div>
        </div>
        <span style={{ fontSize: '12px', color: '#888' }}>{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: '12px' }}>
          {enabledCategories.map(cat => {
            const meta = PROP_META[cat]
            if (!meta) return null
            const pick = picks[cat]?.value || ''
            return (
              <div key={cat} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{meta.label}</span>
                  {savedFlash[cat] && <span style={{ color: '#2d7a2d', fontSize: '10px' }}>✓ saved</span>}
                </div>
                {meta.type === 'team' && (
                  <TeamSelect value={pick} disabled={locked} teams={teams} onChange={v => savePick(cat, v)} />
                )}
                {(meta.type === 'player' || meta.type === 'goalkeeper') && (
                  <PlayerSearch value={pick} disabled={locked}
                    players={meta.type === 'goalkeeper' ? players.filter(p => p.position === 'Goalkeeper') : players}
                    onChange={v => savePick(cat, v)} />
                )}
                {meta.type === 'teams3' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[0, 1, 2].map(i => (
                      <TeamSelect key={i} value={relegatedSlots[i]} disabled={locked} teams={teams}
                        exclude={relegatedSlots.filter((_, idx) => idx !== i)}
                        onChange={v => updateRelegatedSlot(i as 0 | 1 | 2, v)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
