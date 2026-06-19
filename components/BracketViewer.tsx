'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WC_2026_GROUPS, generateR32FromGroupPicks } from '@/lib/bracketEngine'
import { FLAGS } from '@/components/BracketPicker'

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
  const [actualR32Bracket, setActualR32Bracket] = useState<Record<string, { home: string; away: string }>>({})
  const [advancedToRound, setAdvancedToRound] = useState<Record<string, Set<string>>>({
    R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), FINAL: new Set(), CHAMPION: new Set()
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [bracketRes, membersRes, standingsRes, fixturesRes] = await Promise.all([
        supabase.from('bracket_picks')
          .select('user_id, group_picks, bracket_picks, bracket_scores, best_third_groups, final_home_score, final_away_score')
          .eq('pool_id', poolId),
        supabase.from('pool_members')
          .select('user_id, display_name')
          .eq('pool_id', poolId),
        supabase.from('actual_standings')
          .select('group_name, position, team, advances')
          .eq('tournament_id', 'wc_2026'),
        supabase.from('fixtures')
          .select('round, home_team, away_team, home_score, away_score, status')
          .eq('tournament_id', 'wc_2026'),
      ])

      // Build actual standings map
      const standings: Record<string, Record<string, string>> = {}
      for (const row of standingsRes.data || []) {
        if (!standings[row.group_name]) standings[row.group_name] = {}
        standings[row.group_name][String(row.position)] = row.team
      }
      setActualStandings(standings)

      // Build actual R32 bracket from locked standings
      const actualGroupPicks: Record<string, string[]> = {}
      const actualBestThird: string[] = []
      for (const row of standingsRes.data || []) {
        if (!actualGroupPicks[row.group_name]) actualGroupPicks[row.group_name] = ['', '', '', '']
        actualGroupPicks[row.group_name][row.position - 1] = row.team
        if (row.position === 3 && row.advances) actualBestThird.push(row.group_name)
      }
      if (Object.keys(actualGroupPicks).length > 0) {
        setActualR32Bracket(generateR32FromGroupPicks(actualGroupPicks as any, actualBestThird))
      }

      // Build which teams have advanced to each knockout round
      const advanced: Record<string, Set<string>> = {
        R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), FINAL: new Set(), CHAMPION: new Set()
      }
      for (const f of fixturesRes.data || []) {
        if (f.status !== 'FT' || f.home_score === null || f.away_score === null) continue
        const r = f.round || ''
        if (r.includes('Round of 32')) {
          advanced.R32.add(f.home_team); advanced.R32.add(f.away_team)
          const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
          if (w) advanced.R16.add(w)
        }
        if (r.includes('Round of 16')) {
          advanced.R16.add(f.home_team); advanced.R16.add(f.away_team)
          const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
          if (w) advanced.QF.add(w)
        }
        if (r.includes('Quarter-finals')) {
          advanced.QF.add(f.home_team); advanced.QF.add(f.away_team)
          const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
          if (w) advanced.SF.add(w)
        }
        if (r.includes('Semi-finals')) {
          advanced.SF.add(f.home_team); advanced.SF.add(f.away_team)
          const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
          if (w) advanced.FINAL.add(w)
        }
        if (r === 'Final') {
          advanced.FINAL.add(f.home_team); advanced.FINAL.add(f.away_team)
          const w = f.home_score > f.away_score ? f.home_team : f.away_score > f.home_score ? f.away_team : null
          if (w) advanced.CHAMPION.add(w)
        }
      }
      setAdvancedToRound(advanced)

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
              <BracketTree
                picks={selectedPick.bracket_picks}
                groupPicks={selectedPick.group_picks}
                bestThirdGroups={selectedPick.best_third_groups}
                finalHomeScore={selectedPick.final_home_score}
                finalAwayScore={selectedPick.final_away_score}
                advancedToRound={advancedToRound}
                actualR32Bracket={actualR32Bracket}
                breakdown={selectedPick.bracket_scores?.breakdown || {}}
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

function Team({ team, correct }: { team: string | undefined; correct?: boolean | null }) {
  const bg = correct === true ? '#f3fbf3' : correct === false ? '#fff5f5' : 'white'
  const border = correct === true ? '1px solid #2d7a2d' : correct === false ? '1px solid #f0d0d0' : '1px solid #e0e0db'
  const color = correct === true ? '#2d7a2d' : correct === false ? '#C8102E' : '#111'
  if (!team) return <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ccc', background: '#fafafa', border: '1px solid #f0f0f0', minWidth: 120 }}>—</div>
  return (
    <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, background: bg, border, minWidth: 120, display: 'flex', alignItems: 'center', gap: 4, color }}>
      <span>{FLAGS[team] || ''}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{team}</span>
      {correct === true && <span style={{ fontSize: '9px' }}>✓</span>}
      {correct === false && <span style={{ fontSize: '9px' }}>✗</span>}
    </div>
  )
}

function BracketRound({ label, teams, slotHeight, correctness }: { label: string; teams: (string | undefined)[]; slotHeight: number; correctness?: (boolean | null)[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, minWidth: 140 }}>
      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#bbb', letterSpacing: '0.06em', marginBottom: 6, height: 16 }}>{label}</div>
      {teams.map((team, i) => (
        <div key={i} style={{ height: slotHeight, display: 'flex', alignItems: 'center' }}>
          <Team team={team} correct={correctness?.[i]} />
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

function Match({ home, away, homeCorrect, awayCorrect, winnerPick, winnerCorrect, slotHeight }: {
  home: string | undefined
  away: string | undefined
  homeCorrect?: boolean | null
  awayCorrect?: boolean | null
  winnerPick?: string
  winnerCorrect?: boolean | null
  slotHeight: number
}) {
  return (
    <div style={{ height: slotHeight * 2, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', gap: 2 }}>
      <Team team={home} correct={homeCorrect} />
      <div style={{ fontSize: '9px', color: '#ccc', textAlign: 'center' as const, lineHeight: '8px' }}>vs</div>
      <Team team={away} correct={awayCorrect} />
      {winnerPick && (
        <div style={{ fontSize: '9px', color: winnerCorrect === true ? '#2d7a2d' : winnerCorrect === false ? '#C8102E' : '#aaa', paddingLeft: 4, marginTop: 2 }}>
          → {winnerPick} {winnerCorrect === true ? '✓' : winnerCorrect === false ? '✗' : ''}
        </div>
      )}
    </div>
  )
}

function BracketTree({ picks, groupPicks, bestThirdGroups, finalHomeScore, finalAwayScore, advancedToRound, actualR32Bracket, breakdown }: {
  picks: Record<string, string>
  groupPicks: Record<string, string[]>
  bestThirdGroups: string[]
  finalHomeScore: number | null
  finalAwayScore: number | null
  advancedToRound: Record<string, Set<string>>
  actualR32Bracket: Record<string, { home: string; away: string }>
  breakdown: Record<string, number>
}) {
  // Generate this user's full R32 bracket from their group picks
  const userR32Bracket = Object.keys(groupPicks).length > 0
    ? generateR32FromGroupPicks(groupPicks as any, bestThirdGroups)
    : {}

  const R32_ORDER = [
    'R32_M74', 'R32_M77', 'R32_M73', 'R32_M75',
    'R32_M84', 'R32_M88', 'R32_M83', 'R32_M81',
    'R32_M76', 'R32_M78', 'R32_M79', 'R32_M80',
    'R32_M86', 'R32_M82', 'R32_M85', 'R32_M87',
  ]

  function slotCorrect(team: string | undefined, round: string): boolean | null {
    if (!team) return null
    const set = advancedToRound[round]
    if (!set || set.size === 0) return null
    return set.has(team)
  }

  function r32TeamCorrect(slot: string, side: 'home' | 'away'): boolean | null {
    const userMatch = userR32Bracket[slot]
    const actualMatch = actualR32Bracket[slot]
    if (!userMatch || !actualMatch) return null
    const userTeam = userMatch[side]
    const actualTeam = actualMatch[side]
    if (!userTeam || !actualTeam) return null
    return userTeam === actualTeam
  }

  const r16 = Array.from({ length: 8 }, (_, i) => picks[`R16_${i + 1}`])
  const r16Correctness = r16.map(t => slotCorrect(t, 'R16'))
  const qf = Array.from({ length: 4 }, (_, i) => picks[`QF_${i + 1}`])
  const qfCorrectness = qf.map(t => slotCorrect(t, 'QF'))
  const sf = Array.from({ length: 2 }, (_, i) => picks[`SF_${i + 1}`])
  const sfCorrectness = sf.map(t => slotCorrect(t, 'SF'))
  const final = picks['FINAL']
  const finalCorrect = slotCorrect(final, 'CHAMPION')

  const BASE = 36

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', minWidth: 960 }}>

        {/* Round of 32 — 16 matches, 2 teams each = 32 teams */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, minWidth: 150 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#bbb', letterSpacing: '0.06em', marginBottom: 6, height: 16 }}>Round of 32</div>
          {R32_ORDER.map(slot => {
            const userMatch = userR32Bracket[slot] || { home: undefined, away: undefined }
            const winnerPick = picks[slot]
            return (
              <Match
                key={slot}
                home={userMatch.home}
                away={userMatch.away}
                homeCorrect={r32TeamCorrect(slot, 'home')}
                awayCorrect={r32TeamCorrect(slot, 'away')}
                winnerPick={winnerPick}
                winnerCorrect={slotCorrect(winnerPick, 'R16')}
                slotHeight={BASE}
              />
            )
          })}
        </div>

        <BracketConnector count={16} slotHeight={BASE * 2} />

        <BracketRound label="Round of 16" teams={r16} slotHeight={BASE * 4} correctness={r16Correctness} />
        <BracketConnector count={8} slotHeight={BASE * 4} />
        <BracketRound label="Quarter-finals" teams={qf} slotHeight={BASE * 8} correctness={qfCorrectness} />
        <BracketConnector count={4} slotHeight={BASE * 8} />
        <BracketRound label="Semi-finals" teams={sf} slotHeight={BASE * 16} correctness={sfCorrectness} />
        <BracketConnector count={2} slotHeight={BASE * 16} />
        <div style={{ display: 'flex', flexDirection: 'column' as const, minWidth: 140 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#C8102E', letterSpacing: '0.06em', marginBottom: 6, height: 16 }}>🏆 Champion</div>
          <div style={{ height: BASE * 32, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', gap: 4 }}>
            <Team team={final} correct={finalCorrect} />
            {finalHomeScore != null && finalAwayScore != null && (
              <div style={{ fontSize: '10px', color: '#888' }}>{finalHomeScore}–{finalAwayScore}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
