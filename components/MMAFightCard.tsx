'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MMAFixture {
  id: number
  date: string
  home_team: string
  away_team: string
  status: string
  home_score: number | null
  away_score: number | null
  round: string
  card_segment: string | null
  fight_order: number | null
  scheduled_rounds: number | null
  is_title_fight: boolean | null
  fighter1_photo: string | null
  fighter2_photo: string | null
  venue: string
  city: string
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
  name: string
  input_type: string
}

interface Pred {
  id?: string
  fixture_id: number
  category_id: string
  value_wld?: string | null
  value_text?: string | null
  value_yesno?: boolean | null
  value_number?: number | null
  points_earned?: number | null
  is_correct?: boolean | null
}

interface Props {
  poolId: string
  userId: string
  deadlineType: string
  tournamentId: string
  isAdmin?: boolean
}

const SEGMENT_LABEL: Record<string, string> = {
  early_prelims: 'Early Prelims',
  prelims: 'Prelims',
  main_card: 'Main Card',
}

const SEGMENTS = ['main_card', 'prelims', 'early_prelims']

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

export default function MMAFightCard({ poolId, userId, deadlineType, tournamentId, isAdmin }: Props) {
  const [fixtures, setFixtures] = useState<MMAFixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, Pred>>({})
  const [members, setMembers] = useState<{ user_id: string; display_name: string }[]>([])
  const [allPreds, setAllPreds] = useState<Pred[]>([])
  const [activeTab, setActiveTab] = useState<string>('main_card')
  const [loading, setLoading] = useState(true)
  const [ghostEntries, setGhostEntries] = useState<{ id: string; name: string }[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string>(userId) // who we're making picks for
  const [newGhostName, setNewGhostName] = useState('')
  const [addingGhost, setAddingGhost] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [fixturesRes, rulesRes, predsRes, membersRes, allPredsRes, ghostRes] = await Promise.all([
        supabase.from('fixtures').select('*').eq('tournament_id', tournamentId),
        supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId),
        supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId),
        supabase.from('ghost_entries').select('id, name').eq('pool_id', poolId),
      ])

      setFixtures(fixturesRes.data || [])
      setPoolRules((rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id,
        points: r.points,
        bonus_points: r.bonus_points,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'wld',
      })))

      setGhostEntries(ghostRes.data || [])

      const predMap: Record<string, Pred> = {}
      for (const p of predsRes.data || []) {
        predMap[`${p.fixture_id}:${p.category_id}`] = p
      }
      setPreds(predMap)
      setMembers(membersRes.data || [])
      setAllPreds(allPredsRes.data || [])

      // Auto-select tab with live fight, else earliest upcoming
      const all = fixturesRes.data || []
      const live = all.find((f: MMAFixture) => f.status === 'live')
      if (live) { setActiveTab(live.card_segment || 'main_card') }

      setLoading(false)
    }
    load()

    // Realtime
    const channel = supabase.channel('mma-fixtures-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, (payload) => {
        setFixtures(prev => prev.map(f => f.id === payload.new.id ? { ...f, ...payload.new } : f))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions_v2' }, () => {
        // refresh all preds
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).then(({ data }) => {
          if (data) setAllPreds(data)
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [poolId, userId, tournamentId])

  // Reload preds when switching entry
  useEffect(() => {
    if (!activeEntryId) return
    supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', activeEntryId).then(({ data }) => {
      const predMap: Record<string, Pred> = {}
      for (const p of data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
      setPreds(predMap)
    })
  }, [activeEntryId, poolId])

  async function addGhostEntry() {
    if (!newGhostName.trim()) return
    const { data } = await supabase.from('ghost_entries').insert({
      pool_id: poolId, name: newGhostName.trim(), created_by: userId
    }).select().single()
    if (data) {
      setGhostEntries(prev => [...prev, data])
      setActiveEntryId(data.id)
      setNewGhostName('')
      setAddingGhost(false)
    }
  }

  const savePred = useCallback(async (fixtureId: number, categoryId: string, value: Partial<Pred>) => {
    const key = `${fixtureId}:${categoryId}`
    const existing = preds[key]
    setPreds(prev => ({ ...prev, [key]: { ...existing, fixture_id: fixtureId, category_id: categoryId, ...value } }))

    if (existing?.id) {
      await supabase.from('predictions_v2').update(value).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('predictions_v2').insert({
        pool_id: poolId, user_id: activeEntryId, fixture_id: fixtureId, category_id: categoryId, ...value
      }).select().single()
      if (data) setPreds(prev => ({ ...prev, [key]: data }))
    }
  }, [preds, poolId, activeEntryId])

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>loading...</div>

  const now = new Date()

  // Group by segment
  const bySegment: Record<string, MMAFixture[]> = {}
  for (const f of fixtures) {
    const seg = f.card_segment || 'main_card'
    if (!bySegment[seg]) bySegment[seg] = []
    bySegment[seg].push(f)
  }

  // Sort within each segment: fight_order 1 = headliner = top. Live bubbles to very top.
  for (const seg of Object.keys(bySegment)) {
    bySegment[seg].sort((a, b) => {
      const aLive = a.status === 'live' ? -1 : 0
      const bLive = b.status === 'live' ? -1 : 0
      if (aLive !== bLive) return aLive - bLive
      return (a.fight_order || 99) - (b.fight_order || 99) // 1 = top
    })
  }

  // Available tabs (only segments that have fights)
  const availableSegments = SEGMENTS.filter(s => bySegment[s]?.length > 0)

  // Lock time for each segment = start time of that segment's first fight
  function getSegmentLockTime(seg: string): Date | null {
    const fights = bySegment[seg]
    if (!fights?.length) return null
    const earliest = fights.reduce((min, f) => new Date(f.date) < new Date(min.date) ? f : min)
    return new Date(earliest.date)
  }

  function isLocked(fight: MMAFixture, seg: string): boolean {
    const lockTime = getSegmentLockTime(seg)
    return lockTime ? lockTime <= now : false
  }

  const tabFights = bySegment[activeTab] || []
  const segLock = getSegmentLockTime(activeTab)

  return (
    <div>
      {/* Event info */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{fixtures[0]?.venue}</div>
        <div style={{ fontSize: '11px', color: '#aaa' }}>{fixtures[0]?.city}</div>
      </div>

      {/* Entry switcher — admin only for now */}
      {isAdmin && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>making picks for</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
            {/* Self */}
            <button type="button" onClick={() => setActiveEntryId(userId)}
              style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                borderColor: activeEntryId === userId ? '#C8102E' : '#ddd',
                background: activeEntryId === userId ? '#C8102E' : 'white',
                color: activeEntryId === userId ? 'white' : '#555', fontWeight: activeEntryId === userId ? 700 : 400 }}>
              you
            </button>
            {/* Ghost entries */}
            {ghostEntries.map(g => (
              <button key={g.id} type="button" onClick={() => setActiveEntryId(g.id)}
                style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: activeEntryId === g.id ? '#C8102E' : '#ddd',
                  background: activeEntryId === g.id ? '#C8102E' : 'white',
                  color: activeEntryId === g.id ? 'white' : '#555', fontWeight: activeEntryId === g.id ? 700 : 400 }}>
                {g.name}
              </button>
            ))}
            {/* Add new */}
            {!addingGhost && (
              <button type="button" onClick={() => setAddingGhost(true)}
                style={{ padding: '5px 10px', fontSize: '12px', border: '1px dashed #ddd', background: 'white', color: '#aaa', cursor: 'pointer', fontFamily: 'inherit' }}>
                + add entry
              </button>
            )}
          </div>
          {addingGhost && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus value={newGhostName} onChange={e => setNewGhostName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGhostEntry()}
                placeholder="entry name..."
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit' }} />
              <button type="button" onClick={addGhostEntry}
                style={{ padding: '6px 12px', background: '#111', color: 'white', border: 'none', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
                add
              </button>
              <button type="button" onClick={() => { setAddingGhost(false); setNewGhostName('') }}
                style={{ padding: '6px 10px', background: 'none', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', color: '#aaa' }}>
                cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0db', marginBottom: 20, gap: 0 }}>
        {availableSegments.map(seg => {
          const lock = getSegmentLockTime(seg)
          const isActive = activeTab === seg
          const hasLive = bySegment[seg]?.some(f => f.status === 'live')
          return (
            <button key={seg} type="button" onClick={() => setActiveTab(seg)}
              style={{
                flex: 1, padding: '10px 8px', border: 'none', background: 'none',
                borderBottom: isActive ? '2px solid #C8102E' : '2px solid transparent',
                marginBottom: -2,
                color: isActive ? '#C8102E' : '#888',
                fontWeight: isActive ? 700 : 400,
                fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
              }}>
              {hasLive && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', marginRight: 4 }} />}
              {SEGMENT_LABEL[seg]}
              {lock && <div style={{ fontSize: '9px', color: '#bbb', fontWeight: 400, marginTop: 2 }}>
                {lock <= now ? 'locked' : `locks ${lock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </div>}
            </button>
          )
        })}
      </div>

      {/* Fights for active tab */}
      {tabFights.map(fight => {
        const locked = isLocked(fight, activeTab)
        const isLive = fight.status === 'live'
        const isFinished = fight.home_score !== null && fight.away_score !== null
        const winner = fight.home_score === 1 ? fight.home_team : fight.away_score === 1 ? fight.away_team : null
        const isMain = fight.fight_order === 1 && activeTab === 'main_card'

        return (
          <div key={fight.id} style={{
            marginBottom: 24,
            border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
            background: 'white',
            overflow: 'hidden',
          }}>
            {/* Live banner */}
            {isLive && (
              <div style={{ background: '#2d7a2d', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
                <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>LIVE</span>
              </div>
            )}

            {/* Fight header */}
            <div style={{ padding: '16px 12px 12px' }}>
              {/* Label */}
              {(isMain || fight.is_title_fight) && (
                <div style={{ textAlign: 'center' as const, fontSize: '10px', fontWeight: 700, color: '#C8102E', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8 }}>
                  {fight.is_title_fight ? '🏆 Title Fight' : 'Main Event'}
                </div>
              )}

              {/* Fighters */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                {/* Fighter 1 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
                  {fight.fighter1_photo ? (
                    <img src={fight.fighter1_photo} alt={fight.home_team}
                      style={{
                        width: 110, height: 110,
                        objectFit: 'cover', borderRadius: '50%',
                        border: winner === fight.home_team ? '3px solid #2d7a2d' : '3px solid #f0f0f0',
                        filter: isFinished && winner !== fight.home_team ? 'grayscale(60%)' : 'none',
                      }} />
                  ) : (
                    <div style={{ width: 110, height: 110, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#ddd' }}>👤</div>
                  )}
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: winner === fight.home_team ? '#2d7a2d' : '#111' }}>
                      {fight.home_team.split(' ').slice(0, -1).join(' ')}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: winner === fight.home_team ? '#2d7a2d' : '#111' }}>
                      {fight.home_team.split(' ').pop()}
                    </div>
                    {winner === fight.home_team && <div style={{ fontSize: '10px', fontWeight: 700, color: '#2d7a2d' }}>WIN</div>}
                  </div>
                </div>

                {/* VS */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', paddingBottom: 8 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#ccc' }}>vs</div>
                  <div style={{ fontSize: '10px', color: '#bbb', marginTop: 4, whiteSpace: 'nowrap' as const }}>
                    {fight.scheduled_rounds === 5 ? '5 rounds' : '3 rounds'}
                  </div>
                </div>

                {/* Fighter 2 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
                  {fight.fighter2_photo ? (
                    <img src={fight.fighter2_photo} alt={fight.away_team}
                      style={{
                        width: 110, height: 110,
                        objectFit: 'cover', borderRadius: '50%',
                        border: winner === fight.away_team ? '3px solid #2d7a2d' : '3px solid #f0f0f0',
                        filter: isFinished && winner !== fight.away_team ? 'grayscale(60%)' : 'none',
                      }} />
                  ) : (
                    <div style={{ width: 110, height: 110, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#ddd' }}>👤</div>
                  )}
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: winner === fight.away_team ? '#2d7a2d' : '#111' }}>
                      {fight.away_team.split(' ').slice(0, -1).join(' ')}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: winner === fight.away_team ? '#2d7a2d' : '#111' }}>
                      {fight.away_team.split(' ').pop()}
                    </div>
                    {winner === fight.away_team && <div style={{ fontSize: '10px', fontWeight: 700, color: '#2d7a2d' }}>WIN</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Predictions */}
            <div style={{ padding: '12px', borderTop: '1px solid #f5f5f5', background: '#fafafa' }}>
              {locked && !isFinished && (
                <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center' as const, marginBottom: 8 }}>🔒 picks locked</div>
              )}

              {poolRules.map(rule => {
                const key = `${fight.id}:${rule.category_id}`
                const pred = preds[key]

                const btnBase = {
                  padding: '9px 4px', border: '1px solid #ddd',
                  background: 'white', color: '#555',
                  cursor: locked || isFinished ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: '12px',
                  flex: 1, minWidth: 0,
                }

                function btnStyle(val: any) {
                  const selected = pred?.value_wld === val || pred?.value_text === val || pred?.value_yesno === val || pred?.value_number === val
                  const correct = pred?.is_correct === true && selected
                  const wrong = pred?.is_correct === false && selected
                  return {
                    ...btnBase,
                    borderColor: correct ? '#2d7a2d' : wrong ? '#C8102E' : selected ? '#111' : '#ddd',
                    background: correct ? '#f0fff4' : wrong ? '#fff5f5' : selected ? '#111' : 'white',
                    color: correct ? '#2d7a2d' : wrong ? '#C8102E' : selected ? 'white' : '#555',
                    fontWeight: selected ? 700 : 400,
                  }
                }

                return (
                  <div key={rule.category_id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{rule.name}</span>
                      <span style={{ color: '#C8102E' }}>{rule.points} pts</span>
                    </div>

                    {rule.category_id === 'mma_result' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
                          disabled={locked || isFinished}
                          onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_wld: 'home' })}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>{fight.home_team.split(' ').pop()}</span>
                        </button>
                        <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
                          disabled={locked || isFinished}
                          onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_wld: 'away' })}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>{fight.away_team.split(' ').pop()}</span>
                        </button>
                      </div>
                    )}

                    {rule.category_id === 'mma_method' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        {['KO/TKO', 'Sub', 'Dec', 'DQ'].map((method, i, arr) => (
                          <button type="button" key={method}
                            style={{ ...btnStyle(method === 'Sub' ? 'Submission' : method === 'Dec' ? 'Decision' : method), ...(i < arr.length - 1 ? { borderRight: 'none' } : {}) }}
                            disabled={locked || isFinished}
                            onClick={() => {
                              const val = method === 'Sub' ? 'Submission' : method === 'Dec' ? 'Decision' : method
                              !locked && !isFinished && savePred(fight.id, rule.category_id, { value_text: val })
                            }}>
                            {method}
                          </button>
                        ))}
                      </div>
                    )}

                    {rule.category_id === 'mma_round_finish' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        {Array.from({ length: fight.scheduled_rounds || 3 }, (_, i) => i + 1).map((round, i, arr) => (
                          <button type="button" key={round}
                            style={{ ...btnStyle(round), borderRight: 'none' }}
                            disabled={locked || isFinished}
                            onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_number: round, value_text: null })}>
                            R{round}
                          </button>
                        ))}
                        <button type="button"
                          style={{ ...btnStyle('Decision') }}
                          disabled={locked || isFinished}
                          onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_text: 'Decision', value_number: null })}>
                          Dec
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Everyone's picks */}
            {members.length > 1 && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>everyone's picks</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4 }}>player</th>
                      {poolRules.map(r => <th key={r.category_id} style={{ textAlign: 'center' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4, fontSize: '10px' }}>{r.name.split(' ')[0]}</th>)}
                      <th style={{ textAlign: 'right' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4 }}>pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      let memberPts = 0
                      return (
                        <tr key={m.user_id} style={{ borderTop: '1px solid #f9f9f9' }}>
                          <td style={{ padding: '4px 0', color: m.user_id === userId ? '#C8102E' : '#555', fontWeight: m.user_id === userId ? 600 : 400, fontSize: '11px' }}>
                            {m.display_name}{m.user_id === userId ? ' (you)' : ''}
                          </td>
                          {poolRules.map(r => {
                            const p = allPreds.find(x => x.user_id === m.user_id && x.fixture_id === fight.id && x.category_id === r.category_id)
                            if (p?.points_earned) memberPts += p.points_earned
                            const display = p?.value_wld === 'home' ? fight.home_team.split(' ').pop()
                              : p?.value_wld === 'away' ? fight.away_team.split(' ').pop()
                              : p?.value_text || (p?.value_number ? `R${p.value_number}` : '—')
                            const correct = p?.is_correct
                            return (
                              <td key={r.category_id} style={{ textAlign: 'center' as const, padding: '4px 2px', color: correct === true ? '#2d7a2d' : correct === false ? '#C8102E' : '#555', fontSize: '11px' }}>
                                {display || '—'}{correct === true ? ' ✓' : correct === false ? ' ✗' : ''}
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'right' as const, fontWeight: 700, color: m.user_id === userId ? '#C8102E' : '#888', fontSize: '11px' }}>{memberPts || 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
