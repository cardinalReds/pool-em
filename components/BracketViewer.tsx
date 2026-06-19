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
  const [actualStandings, setActualStandings] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [bracketRes, membersRes, standingsRes] = await Promise.all([
        supabase.from('bracket_picks')
          .select('user_id, group_picks, bracket_picks, bracket_scores, best_third_groups, final_home_score, final_away_score')
          .eq('pool_id', poolId),
        supabase.from('pool_members')
          .select('user_id, display_name')
          .eq('pool_id', poolId),
        supabase.from('actual_standings')
          .select('group_name, position, team, advances')
          .eq('tournament_id', 'wc_2026'),
      ])

      // Build actual standings map for group stage checkmarks
      const standings: Record<string, Record<string, string>> = {}
      for (const row of standingsRes.data || []) {
        if (!standings[row.group_name]) standings[row.group_name] = {}
        standings[row.group_name][String(row.position)] = row.team
      }
      setActualStandings(standings)

      const memberMap: Record<string, string> = {}
      membersRes.data?.forEach(m => { memberMap[m.user_id] = m.display_name })

      const combined = (bracketRes.data || []).map(b => ({
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
                  const locked = actualStandings[group]
                  return (
                    <div key={group} style={{ background: 'white', border: '1px solid #e0e0db', padding: '8px 10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#bbb', textTransform: 'uppercase' as const, marginBottom: 6 }}>Group {group}</div>
                      {teams.slice(0, 3).map((team, i) => {
                        const lockedTeam = locked?.[String(i + 1)]
                        const isScored = !!lockedTeam
                        const isCorrect = isScored && team === lockedTeam
                        const pts = selectedPick.bracket_scores?.breakdown?.[`group_${group}_${i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}`]
                        return (
                          <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: '11px' }}>
                            <span style={{ fontSize: '9px', color: i < 2 ? '#C8102E' : '#aaa', minWidth: 14, fontWeight: 600 }}>{i + 1}</span>
                            <span>{FLAGS[team] || ''}</span>
                            <span style={{ fontWeight: i < 2 ? 600 : 400, color: i < 2 ? '#111' : '#888', flex: 1 }}>{team}</span>
                            {isScored && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color: isCorrect ? '#2d7a2d' : '#C8102E' }}>
                                {isCorrect ? `✓${pts ? ` +${pts}` : ''}` : '✗'}
                              </span>
                            )}
                          </div>
                        )
                      })}
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
                correctSlots={(() => {
                  const breakdown = selectedPick.bracket_scores?.breakdown || {}
                  const slots = new Set<string>()
                  // Generate user's R32 bracket to map teams back to slots
                  const userR32Bracket = Object.keys(selectedPick.group_picks).length > 0
                    ? generateR32FromGroupPicks(selectedPick.group_picks, selectedPick.best_third_groups)
                    : {}
                  // Build team→slot map for R32
                  const teamToSlot: Record<string, string> = {}
                  for (const [slot, { home, away }] of Object.entries(userR32Bracket)) {
                    if (home) teamToSlot[home] = slot
                    if (away) teamToSlot[away] = slot
                  }
                  for (const key of Object.keys(breakdown)) {
                    if (key.startsWith('R32_') && !key.includes('_M')) {
                      // Team-keyed R32 entry like "R32_Mexico" → find slot
                      const team = key.replace('R32_', '')
                      const slot = teamToSlot[team]
                      if (slot) slots.add(slot)
                    } else {
                      // R16+: slot-keyed like "R16_1", "QF_1" etc.
                      slots.add(key.replace(/_home$|_away$/, ''))
                    }
                  }
                  return slots
                })()}
                scoredSlots={(() => {
                  const breakdown = selectedPick.bracket_scores?.breakdown || {}
                  const bracketPicksData = selectedPick.bracket_picks || {}
                  const slots = new Set<string>()
                  const hasAnyR32Result = Object.keys(breakdown).some(k => k.startsWith('R32_'))
                  // If any R32 result exists, all R32 slots with picks are scored
                  if (hasAnyR32Result) {
                    for (const key of Object.keys(bracketPicksData)) {
                      if (key.startsWith('R32_')) slots.add(key)
                    }
                  }
                  // R16+ slots scored directly
                  for (const key of Object.keys(breakdown)) {
                    if (!key.startsWith('R32_')) slots.add(key)
                  }
                  return slots
                })()}
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
                  <th style={{ textAlign: 'left' as const, padding: '6px 8px', borderBottom: '2px solid #eee', color: '#bbb', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' as const }}>actual</th>
                  {picks.map(p => (
                    <th key={p.user_id} style={{ textAlign: 'center' as const, padding: '6px 8px', borderBottom: '2px solid #eee', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                      {p.display_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3].map(pos => {
                  const lockedTeam = actualStandings[selectedGroup]?.[String(pos + 1)]
                  return (
                    <tr key={pos} style={{ background: pos % 2 === 0 ? '#fafafa' : 'white' }}>
                      <td style={{ padding: '6px 8px', color: pos < 2 ? '#C8102E' : '#aaa', fontWeight: 700, fontSize: '11px' }}>
                        {pos + 1}{pos === 0 ? 'st' : pos === 1 ? 'nd' : pos === 2 ? 'rd' : 'th'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                        {lockedTeam ? (
                          <span style={{ color: '#2d7a2d' }}>{FLAGS[lockedTeam] || ''} {lockedTeam} 🔒</span>
                        ) : (
                          <span style={{ color: '#ddd' }}>—</span>
                        )}
                      </td>
                      {picks.map(p => {
                        const team = p.group_picks[selectedGroup]?.[pos]
                        const isScored = !!lockedTeam
                        const isCorrect = isScored && team === lockedTeam
                        return (
                          <td key={p.user_id} style={{ padding: '6px 8px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
                            background: isScored ? (isCorrect ? '#f3fbf3' : pos < 2 ? '#fff5f5' : 'inherit') : 'inherit' }}>
                            {team ? (
                              <span style={{ color: isScored ? (isCorrect ? '#2d7a2d' : '#C8102E') : '#111' }}>
                                {FLAGS[team] || ''} {team} {isScored ? (isCorrect ? '✓' : '✗') : ''}
                              </span>
                            ) : (
                              <span style={{ color: '#ddd' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
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

