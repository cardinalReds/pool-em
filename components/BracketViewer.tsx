'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WC_2026_GROUPS, generateR32FromGroupPicks, DEFAULT_BRACKET_SCORING } from '@/lib/bracketEngine'
import { FLAGS, BracketView } from '@/components/BracketPicker'

interface MemberPick {
  user_id: string
  display_name: string
  group_picks: Record<string, string[]>
  bracket_picks: Record<string, string>
  bracket_scores: { total: number; breakdown: Record<string, number> } | null
  best_third_groups: string[]
  final_home_score: number | null
  final_away_score: number | null
}

const GROUPS = Object.keys(WC_2026_GROUPS).sort()

export default function BracketViewer({ poolId }: { poolId: string }) {
  const [picks, setPicks] = useState<MemberPick[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'member' | 'group'>('member')
  const [selectedMember, setSelectedMember] = useState<string>('')
  const [selectedGroup, setSelectedGroup] = useState<string>('A')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: bracketData } = await supabase
        .from('bracket_picks')
        .select('user_id, group_picks, bracket_picks, bracket_scores, best_third_groups, final_home_score, final_away_score')
        .eq('pool_id', poolId)

      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id, display_name')
        .eq('pool_id', poolId)

      const memberMap: Record<string, string> = {}
      members?.forEach(m => { memberMap[m.user_id] = m.display_name })

      const combined = (bracketData || []).map(b => ({
        user_id: b.user_id,
        display_name: memberMap[b.user_id] || 'unknown',
        group_picks: b.group_picks || {},
        bracket_picks: b.bracket_picks || {},
        bracket_scores: b.bracket_scores || null,
        best_third_groups: b.best_third_groups || [],
        final_home_score: b.final_home_score ?? null,
        final_away_score: b.final_away_score ?? null,
      }))

      combined.sort((a, b) => (b.bracket_scores?.total ?? 0) - (a.bracket_scores?.total ?? 0))
      setPicks(combined)
      if (combined.length > 0) setSelectedMember(combined[0].user_id)
      setLoading(false)
    }
    load()
  }, [poolId])

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px' }}>loading picks...</div>
  if (picks.length === 0) return <div style={{ color: '#aaa', fontSize: '12px' }}>no bracket picks submitted yet</div>

  const selectedPick = picks.find(p => p.user_id === selectedMember)

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px' }}>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setView('member')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
            borderColor: view === 'member' ? '#111' : '#ddd',
            background: view === 'member' ? '#111' : 'white',
            color: view === 'member' ? 'white' : '#555' }}>
          by member
        </button>
        <button onClick={() => setView('group')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
            borderColor: view === 'group' ? '#111' : '#ddd',
            background: view === 'group' ? '#111' : 'white',
            color: view === 'group' ? 'white' : '#555' }}>
          by group
        </button>
      </div>

      {/* ── By member view ─────────────────────────────────────────────── */}
      {view === 'member' && (
        <div>
          {/* Member selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 20 }}>
            {picks.map(p => (
              <button key={p.user_id} onClick={() => setSelectedMember(p.user_id)}
                style={{ padding: '5px 12px', fontSize: '11px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: selectedMember === p.user_id ? '#C8102E' : '#ddd',
                  background: selectedMember === p.user_id ? '#C8102E' : 'white',
                  color: selectedMember === p.user_id ? 'white' : '#555' }}>
                {p.display_name}
                {p.bracket_scores?.total !== undefined && (
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>{p.bracket_scores.total}pts</span>
                )}
              </button>
            ))}
          </div>

          {/* Selected member's picks */}
          {selectedPick && (
            <div>
              {/* Group picks */}
              <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 10 }}>group stage</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', gap: 8, marginBottom: 24 }}>
                {GROUPS.map(group => {
                  const teams = selectedPick.group_picks[group] || []
                  return (
                    <div key={group} style={{ background: 'white', border: '1px solid #e0e0db', padding: '8px 10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#bbb', textTransform: 'uppercase' as const, marginBottom: 6 }}>Group {group}</div>
                      {teams.slice(0, 3).map((team, i) => (
                        <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: '11px' }}>
                          <span style={{ fontSize: '9px', color: i < 2 ? '#C8102E' : '#aaa', minWidth: 14, fontWeight: 600 }}>{i + 1}</span>
                          <span>{FLAGS[team] || ''}</span>
                          <span style={{ fontWeight: i < 2 ? 600 : 400, color: i < 2 ? '#111' : '#888' }}>{team}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Knockout picks */}
              <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 12 }}>knockout bracket</div>
              <BracketView
                r32Bracket={generateR32FromGroupPicks(selectedPick.group_picks, selectedPick.best_third_groups)}
                bracketPicks={selectedPick.bracket_picks}
                bracketScores={{}}
                scoringRules={DEFAULT_BRACKET_SCORING}
                locked={true}
                onPick={() => {}}
                onScore={() => {}}
              />
              {selectedPick.final_home_score != null && selectedPick.final_away_score != null && (
                <div style={{ fontSize: '12px', color: '#888', marginTop: 8 }}>
                  predicted final score: {selectedPick.final_home_score}–{selectedPick.final_away_score}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── By group view ──────────────────────────────────────────────── */}
      {view === 'group' && (
        <div>
          {/* Group selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 20 }}>
            {GROUPS.map(g => (
              <button key={g} onClick={() => setSelectedGroup(g)}
                style={{ width: 32, height: 32, fontSize: '11px', fontWeight: 600, border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: selectedGroup === g ? '#111' : '#ddd',
                  background: selectedGroup === g ? '#111' : 'white',
                  color: selectedGroup === g ? 'white' : '#555' }}>
                {g}
              </button>
            ))}
          </div>

          {/* Group comparison table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' as const, padding: '6px 8px', borderBottom: '2px solid #eee', color: '#bbb', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' as const }}>pos</th>
                  {picks.map(p => (
                    <th key={p.user_id} style={{ textAlign: 'center' as const, padding: '6px 8px', borderBottom: '2px solid #eee', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                      {p.display_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3].map(pos => (
                  <tr key={pos} style={{ background: pos % 2 === 0 ? '#fafafa' : 'white' }}>
                    <td style={{ padding: '6px 8px', color: pos < 2 ? '#C8102E' : '#aaa', fontWeight: 700, fontSize: '11px' }}>
                      {pos + 1}{pos === 0 ? 'st' : pos === 1 ? 'nd' : pos === 2 ? 'rd' : 'th'}
                    </td>
                    {picks.map(p => {
                      const team = p.group_picks[selectedGroup]?.[pos]
                      return (
                        <td key={p.user_id} style={{ padding: '6px 8px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const }}>
                          {team ? (
                            <span>{FLAGS[team] || ''} {team}</span>
                          ) : (
                            <span style={{ color: '#ddd' }}>—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Champion picks for this group's teams */}
          <div style={{ marginTop: 20, fontSize: '10px', color: '#aaa' }}>
            <div style={{ fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>champion picks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {picks.map(p => {
                const champ = p.bracket_picks['FINAL']
                return (
                  <div key={p.user_id} style={{ padding: '4px 10px', background: 'white', border: '1px solid #eee', fontSize: '11px' }}>
                    <span style={{ color: '#888' }}>{p.display_name}: </span>
                    <span style={{ fontWeight: 600 }}>{champ ? `${FLAGS[champ] || ''} ${champ}` : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Team({ team }: { team: string | undefined }) {
  if (!team) return <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ccc', background: '#fafafa', border: '1px solid #f0f0f0', minWidth: 120 }}>—</div>
  return (
    <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, background: 'white', border: '1px solid #e0e0db', minWidth: 120, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{FLAGS[team] || ''}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{team}</span>
    </div>
  )
}

function BracketRound({ label, teams, slotHeight }: { label: string; teams: (string | undefined)[]; slotHeight: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, minWidth: 140 }}>
      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#bbb', letterSpacing: '0.06em', marginBottom: 6, height: 16 }}>{label}</div>
      {teams.map((team, i) => (
        <div key={i} style={{
          height: slotHeight,
          display: 'flex',
          alignItems: 'center',
        }}>
          <Team team={team} />
        </div>
      ))}
    </div>
  )
}

function BracketConnector({ count, slotHeight }: { count: number; slotHeight: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, width: 16, marginTop: 22 }}>
      {Array.from({ length: count / 2 }, (_, i) => (
        <div key={i} style={{ height: slotHeight * 2, display: 'flex', flexDirection: 'column' as const }}>
          <div style={{ flex: 1, borderBottom: '1px solid #ddd', borderRight: '1px solid #ddd' }} />
          <div style={{ flex: 1, borderTop: '1px solid #ddd', borderRight: '1px solid #ddd' }} />
        </div>
      ))}
    </div>
  )
}

function BracketTree({ picks, finalHomeScore, finalAwayScore }: {
  picks: Record<string, string>
  finalHomeScore: number | null
  finalAwayScore: number | null
}) {
  // R32 pairs ordered correctly so adjacent pairs feed the right R16 slot
  // R16_1: M74+M77, R16_2: M73+M75, R16_3: M84+M88, R16_4: M83+M81
  // R16_5: M76+M78, R16_6: M79+M80, R16_7: M86+M82, R16_8: M85+M87
  const r32Ordered = [
    'R32_M74', 'R32_M77', // → R16_1
    'R32_M73', 'R32_M75', // → R16_2
    'R32_M84', 'R32_M88', // → R16_3
    'R32_M83', 'R32_M81', // → R16_4
    'R32_M76', 'R32_M78', // → R16_5
    'R32_M79', 'R32_M80', // → R16_6
    'R32_M86', 'R32_M82', // → R16_7
    'R32_M85', 'R32_M87', // → R16_8
  ].map(slot => picks[slot])

  const r16 = Array.from({ length: 8 }, (_, i) => picks[`R16_${i + 1}`])
  const qf = Array.from({ length: 4 }, (_, i) => picks[`QF_${i + 1}`])
  const sf = Array.from({ length: 2 }, (_, i) => picks[`SF_${i + 1}`])
  const final = picks['FINAL']

  const BASE = 36

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', minWidth: 820 }}>
        <BracketRound label="Round of 32" teams={r32Ordered} slotHeight={BASE} />
        <BracketConnector count={16} slotHeight={BASE} />
        <BracketRound label="Round of 16" teams={r16} slotHeight={BASE * 2} />
        <BracketConnector count={8} slotHeight={BASE * 2} />
        <BracketRound label="Quarter-finals" teams={qf} slotHeight={BASE * 4} />
        <BracketConnector count={4} slotHeight={BASE * 4} />
        <BracketRound label="Semi-finals" teams={sf} slotHeight={BASE * 8} />
        <BracketConnector count={2} slotHeight={BASE * 8} />
        <div style={{ display: 'flex', flexDirection: 'column' as const, minWidth: 140 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#C8102E', letterSpacing: '0.06em', marginBottom: 6, height: 16 }}>🏆 Champion</div>
          <div style={{ height: BASE * 16, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', gap: 4 }}>
            <Team team={final} />
            {finalHomeScore != null && finalAwayScore != null && (
              <div style={{ fontSize: '10px', color: '#888' }}>{finalHomeScore}–{finalAwayScore}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
