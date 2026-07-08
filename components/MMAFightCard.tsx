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
}

const SEGMENT_LABEL: Record<string, string> = {
  early_prelims: 'Early Prelims',
  prelims: 'Prelims',
  main_card: 'Main Card',
}

const SEGMENT_ORDER: Record<string, number> = {
  main_card: 0,
  prelims: 1,
  early_prelims: 2,
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

export default function MMAFightCard({ poolId, userId, deadlineType, tournamentId }: Props) {
  const [fixtures, setFixtures] = useState<MMAFixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, Pred>>({})
  const [members, setMembers] = useState<{ user_id: string; display_name: string }[]>([])
  const [allPreds, setAllPreds] = useState<Pred[]>([])
  const [expandedFight, setExpandedFight] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [fixturesRes, rulesRes, predsRes, membersRes, allPredsRes] = await Promise.all([
        supabase.from('fixtures').select('*').eq('tournament_id', tournamentId).order('card_segment').order('fight_order', { ascending: false }),
        supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId),
        supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
        supabase.from('predictions_v2').select('*').eq('pool_id', poolId),
      ])

      setFixtures(fixturesRes.data || [])
      setPoolRules((rulesRes.data || []).map((r: any) => ({
        category_id: r.category_id,
        points: r.points,
        bonus_points: r.bonus_points,
        name: r.ruleset_categories?.name || r.category_id,
        input_type: r.ruleset_categories?.input_type || 'wld',
      })))

      const predMap: Record<string, Pred> = {}
      for (const p of predsRes.data || []) {
        predMap[`${p.fixture_id}:${p.category_id}`] = p
      }
      setPreds(predMap)
      setMembers(membersRes.data || [])
      setAllPreds(allPredsRes.data || [])
      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  const savePred = useCallback(async (fixtureId: number, categoryId: string, value: Partial<Pred>) => {
    const key = `${fixtureId}:${categoryId}`
    const existing = preds[key]
    const updated = { ...existing, fixture_id: fixtureId, category_id: categoryId, pool_id: poolId, user_id: userId, ...value }
    setPreds(prev => ({ ...prev, [key]: updated }))

    if (existing?.id) {
      await supabase.from('predictions_v2').update(value).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('predictions_v2').insert({ pool_id: poolId, user_id: userId, fixture_id: fixtureId, category_id: categoryId, ...value }).select().single()
      if (data) setPreds(prev => ({ ...prev, [key]: data }))
    }
  }, [preds, poolId, userId])

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>loading...</div>

  const now = new Date()

  // Group by card segment, sorted main_card → prelims → early_prelims
  const bySegment = new Map<string, MMAFixture[]>()
  const sortedFixtures = [...fixtures].sort((a, b) => {
    const segA = SEGMENT_ORDER[a.card_segment || ''] ?? 99
    const segB = SEGMENT_ORDER[b.card_segment || ''] ?? 99
    if (segA !== segB) return segA - segB
    // Within segment: fight_order 1 = headline = top → descending fight_order
    return (b.fight_order || 0) - (a.fight_order || 0)
  })

  // Live fights bubble to top within their segment
  const liveFirst = [...sortedFixtures].sort((a, b) => {
    const aLive = a.status === 'live' ? -1 : 0
    const bLive = b.status === 'live' ? -1 : 0
    return aLive - bLive
  })

  for (const f of liveFirst) {
    const seg = f.card_segment || 'main_card'
    if (!bySegment.has(seg)) bySegment.set(seg, [])
    bySegment.get(seg)!.push(f)
  }

  const segmentOrder = ['main_card', 'prelims', 'early_prelims']

  return (
    <div>
      {/* Event header */}
      <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: '1px solid #e0e0db' }}>
        <div style={{ fontSize: '11px', color: '#aaa', marginBottom: 4 }}>{fixtures[0]?.city} · {fixtures[0]?.venue}</div>
        {fixtures[0] && <div style={{ fontSize: '12px', color: '#888' }}>{fmt(fixtures[0].date)}</div>}
      </div>

      {segmentOrder.map(seg => {
        const fights = bySegment.get(seg)
        if (!fights?.length) return null

        // Lock time = date of first fight in this segment
        const segLockTime = new Date(fights[fights.length - 1].date) // earliest fight
        const segLocked = deadlineType === 'before_tournament'
          ? new Date(fights[fights.length - 1].date) <= now
          : false // per-fight locking handled per card

        return (
          <div key={seg} style={{ marginBottom: 32 }}>
            {/* Segment header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#aaa' }}>
                {SEGMENT_LABEL[seg] || seg}
              </div>
              <div style={{ fontSize: '10px', color: '#bbb' }}>locks {fmtTime(fights[fights.length - 1].date)}</div>
            </div>

            {fights.map(fight => {
              const isLive = fight.status === 'live'
              const isFinished = fight.home_score !== null && fight.away_score !== null
              const locked = deadlineType === 'before_tournament'
                ? segLocked
                : new Date(fight.date) <= now

              const winner = fight.home_score === 1 ? fight.home_team : fight.away_score === 1 ? fight.away_team : null
              const isExpanded = expandedFight === fight.id

              return (
                <div key={fight.id} style={{
                  marginBottom: 12,
                  border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
                  background: 'white',
                  overflow: 'hidden',
                }}>
                  {/* Live banner */}
                  {isLive && (
                    <div style={{ background: '#2d7a2d', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
                      <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>LIVE</span>
                    </div>
                  )}

                  {/* Fight header — fighter photos + names */}
                  <button type="button" onClick={() => setExpandedFight(isExpanded ? null : fight.id)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 80 }}>
                      {/* Fighter 1 */}
                      <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'flex-end',
                        padding: '8px 4px 4px',
                        background: isFinished ? (winner === fight.home_team ? '#f0fff4' : '#fafafa') : 'white',
                        borderRight: '1px solid #f0f0f0',
                      }}>
                        {fight.fighter1_photo && (
                          <img src={fight.fighter1_photo} alt={fight.home_team}
                            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '50%', marginBottom: 4, filter: isFinished && winner !== fight.home_team ? 'grayscale(80%)' : 'none' }} />
                        )}
                        <div style={{ fontSize: '11px', fontWeight: 700, color: winner === fight.home_team ? '#2d7a2d' : '#111', textAlign: 'center' as const, lineHeight: 1.2 }}>
                          {fight.home_team.split(' ').pop()}
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa' }}>{fight.home_team.split(' ').slice(0, -1).join(' ')}</div>
                        {isFinished && <div style={{ fontSize: '11px', fontWeight: 700, color: winner === fight.home_team ? '#2d7a2d' : '#aaa', marginTop: 2 }}>{winner === fight.home_team ? 'W' : 'L'}</div>}
                      </div>

                      {/* Center — weight class, vs, result */}
                      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '8px 12px', minWidth: 80 }}>
                        <div style={{ fontSize: '9px', color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>
                          {fight.is_title_fight ? '🏆 Title' : fight.card_segment === 'main_card' && fight.fight_order === 1 ? 'Main Event' : ''}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#aaa' }}>vs</div>
                        <div style={{ fontSize: '9px', color: '#bbb', marginTop: 4 }}>
                          {fight.scheduled_rounds === 5 ? '5 rds' : '3 rds'}
                        </div>
                        {/* Expand indicator */}
                        <div style={{ fontSize: '16px', color: '#ddd', marginTop: 6 }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>

                      {/* Fighter 2 */}
                      <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'flex-end',
                        padding: '8px 4px 4px',
                        background: isFinished ? (winner === fight.away_team ? '#f0fff4' : '#fafafa') : 'white',
                        borderLeft: '1px solid #f0f0f0',
                      }}>
                        {fight.fighter2_photo && (
                          <img src={fight.fighter2_photo} alt={fight.away_team}
                            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '50%', marginBottom: 4, filter: isFinished && winner !== fight.away_team ? 'grayscale(80%)' : 'none' }} />
                        )}
                        <div style={{ fontSize: '11px', fontWeight: 700, color: winner === fight.away_team ? '#2d7a2d' : '#111', textAlign: 'center' as const, lineHeight: 1.2 }}>
                          {fight.away_team.split(' ').pop()}
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa' }}>{fight.away_team.split(' ').slice(0, -1).join(' ')}</div>
                        {isFinished && <div style={{ fontSize: '11px', fontWeight: 700, color: winner === fight.away_team ? '#2d7a2d' : '#aaa', marginTop: 2 }}>{winner === fight.away_team ? 'W' : 'L'}</div>}
                      </div>
                    </div>
                  </button>

                  {/* Expanded — predictions */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: 12 }}>
                      {poolRules.map(rule => {
                        const key = `${fight.id}:${rule.category_id}`
                        const pred = preds[key]

                        const btnStyle = (val: any) => {
                          const selected = pred?.value_wld === val || pred?.value_text === val || pred?.value_yesno === val || pred?.value_number === val
                          const correct = pred?.is_correct === true && selected
                          const wrong = pred?.is_correct === false && selected
                          return {
                            padding: '8px 4px', border: '1px solid',
                            borderColor: correct ? '#2d7a2d' : wrong ? '#C8102E' : selected ? '#111' : '#ddd',
                            background: correct ? '#f0fff4' : wrong ? '#fff5f5' : selected ? '#111' : 'white',
                            color: correct ? '#2d7a2d' : wrong ? '#C8102E' : selected ? 'white' : '#555',
                            cursor: locked || isFinished ? 'default' : 'pointer',
                            fontFamily: 'inherit', fontSize: '12px', fontWeight: selected ? 700 : 400,
                            flex: 1,
                          }
                        }

                        return (
                          <div key={rule.category_id} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                              <span>{rule.name}</span>
                              <span style={{ color: '#C8102E' }}>{rule.points} pts</span>
                            </div>

                            {rule.category_id === 'mma_result' && (
                              <div style={{ display: 'flex', gap: 0 }}>
                                <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
                                  disabled={locked || isFinished}
                                  onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_wld: 'home' })}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>{fight.home_team}</span>
                                </button>
                                <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
                                  disabled={locked || isFinished}
                                  onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_wld: 'away' })}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>{fight.away_team}</span>
                                </button>
                              </div>
                            )}

                            {rule.category_id === 'mma_method' && (
                              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' as const }}>
                                {['KO/TKO', 'Submission', 'Decision', 'DQ'].map((method, i, arr) => (
                                  <button type="button" key={method}
                                    style={{ ...btnStyle(method), ...(i < arr.length - 1 ? { borderRight: 'none' } : {}), minWidth: 0 }}
                                    disabled={locked || isFinished}
                                    onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_text: method })}>
                                    {method}
                                  </button>
                                ))}
                              </div>
                            )}

                            {rule.category_id === 'mma_round_finish' && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                                {Array.from({ length: fight.scheduled_rounds || 3 }, (_, i) => i + 1).map(round => (
                                  <button type="button" key={round}
                                    style={{ ...btnStyle(round), flex: '0 0 44px' }}
                                    disabled={locked || isFinished}
                                    onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_number: round, value_text: null })}>
                                    R{round}
                                  </button>
                                ))}
                                <button type="button"
                                  style={{ ...btnStyle('Decision'), flex: '1 1 auto' }}
                                  disabled={locked || isFinished}
                                  onClick={() => !locked && !isFinished && savePred(fight.id, rule.category_id, { value_text: 'Decision', value_number: null })}>
                                  Decision
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Everyone's picks */}
                      {members.length > 1 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid #f5f5f5', paddingTop: 10 }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>everyone's picks</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4 }}>player</th>
                                {poolRules.map(r => <th key={r.category_id} style={{ textAlign: 'center' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4 }}>{r.name}</th>)}
                                <th style={{ textAlign: 'right' as const, color: '#aaa', fontWeight: 400, paddingBottom: 4 }}>pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map(m => {
                                let memberPts = 0
                                return (
                                  <tr key={m.user_id} style={{ borderTop: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '4px 0', color: m.user_id === userId ? '#C8102E' : '#555', fontWeight: m.user_id === userId ? 600 : 400 }}>
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
                                        <td key={r.category_id} style={{ textAlign: 'center' as const, padding: '4px 4px', color: correct === true ? '#2d7a2d' : correct === false ? '#C8102E' : '#555' }}>
                                          {display || '—'}
                                          {correct === true && ' ✓'}
                                          {correct === false && ' ✗'}
                                        </td>
                                      )
                                    })}
                                    <td style={{ textAlign: 'right' as const, fontWeight: 700, color: m.user_id === userId ? '#C8102E' : '#888' }}>{memberPts || 0}</td>
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
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
