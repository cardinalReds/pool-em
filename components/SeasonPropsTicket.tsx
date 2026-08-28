'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Team { name: string; logo: string | null }
interface Player { id: number; name: string; team_name: string; position: string }
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

const CATEGORY_ORDER = ['title_winner', 'top_4_2nd', 'top_4_3rd', 'top_4_4th', 'top_scorer', 'top_assist', 'golden_glove', 'relegated']

// Custom dropdown (not native <select>) so team crests can render inside it
function TeamDropdown({ value, onChange, teams, disabled, exclude }: {
  value: string; onChange: (v: string) => void; teams: Team[]; disabled: boolean; exclude?: string[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])
  const selected = teams.find(t => t.name === value)
  const options = teams.filter(t => t.name === value || !exclude?.includes(t.name))

  return (
    <div ref={ref} style={{ position: 'relative' as const }}>
      <button type="button" disabled={disabled} onMouseDown={() => !disabled && setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid', borderColor: value ? '#C8102E' : '#ddd', background: disabled ? '#f9f9f9' : 'white', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
        {selected?.logo && <img src={selected.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' as const, flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 13, color: value ? '#111' : '#aaa', fontWeight: value ? 600 : 400 }}>{value || 'select a team...'}</span>
        <span style={{ fontSize: 10, color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #ddd', borderTop: 'none', maxHeight: 240, overflowY: 'auto' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {options.map(t => (
            <button type="button" key={t.name} onMouseDown={e => { e.preventDefault(); onChange(t.name); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderBottom: '1px solid #f5f5f5', background: value === t.name ? '#fff5f5' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
              {t.logo && <img src={t.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' as const, flexShrink: 0 }} />}
              <span style={{ fontSize: 12, color: value === t.name ? '#C8102E' : '#111', fontWeight: value === t.name ? 700 : 400 }}>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerDropdown({ value, onChange, players, disabled }: {
  value: string; onChange: (v: string) => void; players: Player[]; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' as const }}>
      <button type="button" disabled={disabled} onMouseDown={() => !disabled && setOpen(o => !o)}
        style={{ width: '100%', padding: '7px 10px', border: '1px solid', borderColor: value ? '#C8102E' : '#ddd', background: disabled ? '#f9f9f9' : 'white', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: value ? '#111' : '#aaa', fontWeight: value ? 600 : 400 }}>{value || 'select a player...'}</span>
        <span style={{ fontSize: 10, color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #ddd', borderTop: 'none', maxHeight: 200, overflowY: 'auto' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {players.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: '#aaa' }}>no players found for this team</div>}
          {players.map(p => (
            <button type="button" key={p.id} onMouseDown={e => { e.preventDefault(); onChange(p.name); setOpen(false) }}
              style={{ width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f5f5f5', background: value === p.name ? '#fff5f5' : 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
              <span style={{ fontSize: 12, color: value === p.name ? '#C8102E' : '#111', fontWeight: value === p.name ? 700 : 400 }}>{p.name}</span>
              {p.position !== 'Goalkeeper' && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>{p.position}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Team → player nested picker. Team selection is derived from the current pick (via players[]),
// so nothing extra needs to be stored — the DB still only holds the final player name.
function TeamPlayerPicker({ value, onChange, teams, playersByTeam, disabled, goalkeepersOnly }: {
  value: string; onChange: (v: string) => void; teams: Team[]
  playersByTeam: Record<string, Player[]>; disabled: boolean; goalkeepersOnly?: boolean
}) {
  const currentTeam = Object.keys(playersByTeam).find(t => playersByTeam[t].some(p => p.name === value)) || ''
  const [team, setTeam] = useState(currentTeam)
  useEffect(() => { if (currentTeam) setTeam(currentTeam) }, [currentTeam])

  const teamPlayers = (playersByTeam[team] || []).filter(p => !goalkeepersOnly || p.position === 'Goalkeeper')

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
      <TeamDropdown value={team} disabled={disabled} teams={teams}
        onChange={t => { setTeam(t); onChange('') }} />
      <PlayerDropdown value={value} disabled={disabled || !team} players={teamPlayers} onChange={onChange} />
    </div>
  )
}

export default function SeasonPropsTicket({ poolId, userId, targetUserId, targetLabel, tournamentId, onLockChange }: {
  poolId: string
  userId: string // the real logged-in viewer — used only for the "(you)" highlight below, never for reads/writes
  targetUserId?: string // whose season props this form reads/writes — a ghost's id when "making picks for" one is active (see FixturesList's activeEntryId); defaults to userId
  targetLabel?: string // display name for the header when targetUserId isn't the viewer's own
  tournamentId: string
  onLockChange?: (locked: boolean) => void
}) {
  const effectiveTargetId = targetUserId || userId
  const [loading, setLoading] = useState(true)
  const [enabledCategories, setEnabledCategories] = useState<string[]>([])
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, Player[]>>({})
  const [relegatedSlots, setRelegatedSlots] = useState<[string, string, string]>(['', '', ''])
  const [lockTime, setLockTime] = useState<Date | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [members, setMembers] = useState<Record<string, string>>({})
  const [allPicks, setAllPicks] = useState<Record<string, any>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [rulesRes, picksRes, teamsRes, playersRes, fixturesRes, allPicksRes, membersRes, ghostRes] = await Promise.all([
        supabase.from('season_prop_rules').select('category').eq('pool_id', poolId),
        supabase.from('season_props').select('*').eq('pool_id', poolId).eq('user_id', effectiveTargetId),
        supabase.from('pl_teams').select('id, name, logo').eq('season', 2026).order('name'),
        supabase.from('pl_players').select('id, name, team_id, position').eq('season', 2026).order('name'),
        supabase.from('fixtures').select('date').eq('tournament_id', tournamentId).eq('round', 'Matchday 1'),
        supabase.from('season_props').select('*').eq('pool_id', poolId),
        supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
        supabase.from('ghost_entries').select('id, name').eq('pool_id', poolId),
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

      const allPickMap: Record<string, any> = {}
      ;(allPicksRes.data || []).forEach((p: any) => { allPickMap[`${p.user_id}:${p.category}`] = p })
      setAllPicks(allPickMap)

      const memberMap: Record<string, string> = {}
      ;(membersRes.data || []).forEach((m: any) => { memberMap[m.user_id] = m.display_name })
      ;(ghostRes.data || []).forEach((g: any) => { memberMap[g.id] = g.name })
      setMembers(memberMap)

      const teamMap: Record<number, string> = {}
      ;(teamsRes.data || []).forEach((t: any) => { teamMap[t.id] = t.name })
      setTeams((teamsRes.data || []).map((t: any) => ({ name: t.name, logo: t.logo })))

      const byTeam: Record<string, Player[]> = {}
      ;(playersRes.data || []).forEach((p: any) => {
        const teamName = teamMap[p.team_id] || ''
        if (!byTeam[teamName]) byTeam[teamName] = []
        byTeam[teamName].push({ id: p.id, name: p.name, team_name: teamName, position: p.position })
      })
      setPlayersByTeam(byTeam)

      const dates = (fixturesRes.data || []).map((f: any) => new Date(f.date).getTime())
      if (dates.length > 0) {
        const lt = new Date(Math.min(...dates))
        setLockTime(lt)
        onLockChange?.(Date.now() >= lt.getTime())
      }

      setLoading(false)
    }
    load()
  }, [poolId, effectiveTargetId, tournamentId])

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
          pool_id: poolId, user_id: effectiveTargetId, category, value_text: value,
        }).select().single()
        if (data) setPicks(prev => ({ ...prev, [category]: { id: data.id, value } }))
      }
      setSavedFlash(prev => ({ ...prev, [category]: true }))
      setTimeout(() => setSavedFlash(prev => ({ ...prev, [category]: false })), 2000)
    }, 400)
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
          <div style={{ fontWeight: 700, fontSize: '13px' }}>
            🏆 season-long predictions{effectiveTargetId !== userId ? ` — for ${targetLabel || 'ghost entry'}` : ''}
          </div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
            {locked ? 'locked — season underway' : lockTime ? `locks at first kickoff · ${lockTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'predict before the season starts'}
          </div>
        </div>
        <span style={{ fontSize: '12px', color: '#888' }}>{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {enabledCategories.map(cat => {
            const meta = PROP_META[cat]
            if (!meta) return null
            const pick = picks[cat]?.value || ''
            return (
              <div key={cat}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{meta.label}</span>
                  {savedFlash[cat] && <span style={{ color: '#2d7a2d', fontSize: '10px' }}>✓ saved</span>}
                </div>
                {meta.type === 'team' && (
                  <TeamDropdown value={pick} disabled={locked} teams={teams} onChange={v => savePick(cat, v)} />
                )}
                {(meta.type === 'player' || meta.type === 'goalkeeper') && (
                  <TeamPlayerPicker value={pick} disabled={locked} teams={teams} playersByTeam={playersByTeam}
                    goalkeepersOnly={meta.type === 'goalkeeper'} onChange={v => savePick(cat, v)} />
                )}
                {meta.type === 'teams3' && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    {[0, 1, 2].map(i => (
                      <TeamDropdown key={i} value={relegatedSlots[i]} disabled={locked} teams={teams}
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
      {locked && Object.keys(members).length > 0 && (
        <div style={{ padding: '12px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 8 }}>everyone's picks</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}></td>
                  {enabledCategories.map(cat => (
                    <td key={cat} style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const, textAlign: 'center' as const }}>{PROP_META[cat]?.label || cat}</td>
                  ))}
                  <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>pts</td>
                </tr>
              </thead>
              <tbody>
                {Object.entries(members)
                  .filter(([memberId]) => enabledCategories.some(cat => allPicks[`${memberId}:${cat}`]?.value_text))
                  .map(([memberId, name]) => {
                    const totalPts = enabledCategories.reduce((sum, cat) => sum + (allPicks[`${memberId}:${cat}`]?.points_earned ?? 0), 0)
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
                        {enabledCategories.map(cat => {
                          const p = allPicks[`${memberId}:${cat}`]
                          const display = p?.value_text || '—'
                          const correct = p?.is_correct ?? null
                          return (
                            <td key={cat} style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', color: correct === true ? '#2d7a2d' : correct === false ? '#aaa' : '#555', whiteSpace: 'nowrap' as const }}>
                              {display === '—' ? <span style={{ color: '#ddd' }}>—</span> : display}
                              {correct === true && ' ✓'}
                              {correct === false && ' ✗'}
                            </td>
                          )
                        })}
                        <td style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', fontWeight: 600, color: totalPts > 0 ? '#C8102E' : '#aaa' }}>
                          {totalPts}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
