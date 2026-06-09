'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  WC_2026_GROUPS,
  R32_MATCHUPS,
  R16_MATCHUPS,
  QF_MATCHUPS,
  SF_MATCHUPS,
  generateR32FromGroupPicks,
  getSlotOpponents,
  DEFAULT_BRACKET_SCORING,
  type GroupPicks,
  type BracketPicks,
  type BracketScoringRules,
} from '@/lib/bracketEngine'

const FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'Poland': '🇵🇱', 'Saudi Arabia': '🇸🇦',
  'Argentina': '🇦🇷', 'Chile': '🇨🇱', 'Peru': '🇵🇪', 'Canada': '🇨🇦',
  'USA': '🇺🇸', 'Panama': '🇵🇦', 'Haiti': '🇭🇹', 'Bosnia and Herzegovina': '🇧🇦',
  'Brazil': '🇧🇷', 'Norway': '🇳🇴', 'Morocco': '🇲🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Algeria': '🇩🇿', 'Egypt': '🇪🇬', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Spain': '🇪🇸', 'Senegal': '🇸🇳', 'Japan': '🇯🇵', 'Netherlands': '🇳🇱',
  'Germany': '🇩🇪', 'Serbia': '🇷🇸', 'Colombia': '🇨🇴', 'Belgium': '🇧🇪',
  'Portugal': '🇵🇹', 'Croatia': '🇭🇷', 'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨',
  'Sweden': '🇸🇪', 'South Korea': '🇰🇷', 'Iran': '🇮🇷', 'Iraq': '🇮🇶',
  'Australia': '🇦🇺', 'Jordan': '🇯🇴', 'New Zealand': '🇳🇿', 'Uzbekistan': '🇺🇿',
  'Türkiye': '🇹🇷', 'Denmark': '🇩🇰', 'Austria': '🇦🇹', 'Ghana': '🇬🇭',
  'Congo DR': '🇨🇩', 'Cabo Verde': '🇨🇻', 'Tunisia': '🇹🇳', 'Qatar': '🇶🇦',
}

type PickMode = 'simple' | 'full'
type Step = 'groups' | 'thirds' | 'bracket'

interface Props {
  poolId: string
  userId: string
  scoringRules: BracketScoringRules
  locked?: boolean
}

export default function BracketPicker({ poolId, userId, scoringRules, locked = false }: Props) {
  const [step, setStep] = useState<Step>('groups')
  const [groupPicks, setGroupPicks] = useState<GroupPicks>({})
  const [bestThirdGroups, setBestThirdGroups] = useState<string[]>([])
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>({})
  const [bracketScores, setBracketScores] = useState<Record<string, string>>({}) // slot → "2-1"
  const [r32Bracket, setR32Bracket] = useState<Record<string, { home: string; away: string }>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load existing picks
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('bracket_picks')
        .select('*')
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .maybeSingle()

      if (data) {
        // Merge saved picks with defaults so all 12 groups are always populated
        const defaults: GroupPicks = {}
        Object.entries(WC_2026_GROUPS).forEach(([g, teams]) => {
          defaults[g] = [...teams] as [string, string, string, string]
        })
        setGroupPicks({ ...defaults, ...(data.group_picks || {}) })
        setBestThirdGroups(data.best_third_groups || [])
        setBracketPicks(data.bracket_picks || {})
        setBracketScores(data.bracket_scores || {})
      } else {
        // No saved picks — initialize with defaults
        const defaults: GroupPicks = {}
        Object.entries(WC_2026_GROUPS).forEach(([g, teams]) => {
          defaults[g] = [...teams] as [string, string, string, string]
        })
        setGroupPicks(defaults)
      }
      setLoading(false)
    }
    load()
  }, [poolId, userId])

  // Regenerate R32 bracket whenever group picks or third place picks change
  useEffect(() => {
    if (Object.keys(groupPicks).length === 12) {
      const r32 = generateR32FromGroupPicks(groupPicks, bestThirdGroups)
      setR32Bracket(r32)
    }
  }, [groupPicks, bestThirdGroups])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bracket_picks').upsert({
      pool_id: poolId,
      user_id: userId,
      tournament_id: 'wc_2026',
      group_picks: groupPicks,
      best_third_groups: bestThirdGroups,
      bracket_picks: bracketPicks,
      bracket_scores: bracketScores,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pool_id,user_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function setGroupRanking(group: string, ranked: string[]) {
    setGroupPicks(prev => ({ ...prev, [group]: ranked as [string, string, string, string] }))
  }

  function toggleThirdGroup(group: string) {
    setBestThirdGroups(prev => {
      if (prev.includes(group)) return prev.filter(g => g !== group)
      if (prev.length >= 8) return prev // max 8
      return [...prev, group]
    })
  }

  function pickBracket(slot: string, team: string) {
    setBracketPicks(prev => ({ ...prev, [slot]: team }))
  }

  const groupsComplete = Object.keys(groupPicks).length === 12 &&
    Object.values(groupPicks).every(picks => picks.length === 4)
  const thirdsComplete = bestThirdGroups.length === 8

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px' }}>loading...</div>

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px' }}>
      {/* Step tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '20px', gap: 0 }}>
        {([
          { id: 'groups', label: '1. group stage' },
          { id: 'thirds', label: '2. best 3rd place' },
          { id: 'bracket', label: '3. knockout bracket' },
        ] as const).map(s => (
          <button key={s.id} onClick={() => setStep(s.id)}
            style={{
              padding: '8px 16px', fontSize: '11px', fontWeight: step === s.id ? 700 : 400,
              border: 'none', borderBottom: step === s.id ? '2px solid #111' : '2px solid transparent',
              background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: step === s.id ? '#111' : '#aaa', marginBottom: '-2px',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Step 1: Group picks */}
      {step === 'groups' && (
        <div>
          <p style={{ fontSize: '11px', color: '#888', marginBottom: '16px' }}>
            Drag to reorder teams in each group from 1st to 4th.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {Object.entries(WC_2026_GROUPS).map(([group, teams]) => (
              <GroupPicker
                key={group}
                group={group}
                teams={teams}
                picks={groupPicks[group] || []}
                locked={locked}
                onChange={ranked => setGroupRanking(group, ranked)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep('thirds')}
              style={{ padding: '7px 20px', background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>
              next: pick best 3rd place teams →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Best 8 third place teams */}
      {step === 'thirds' && (
        <div>
          <p style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
            Pick the 8 groups whose 3rd place team advances to the Round of 32.
          </p>
          <p style={{ fontSize: '10px', color: '#bbb', marginBottom: '16px' }}>
            Selected: {bestThirdGroups.length}/8
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {Object.entries(WC_2026_GROUPS).map(([group, teams]) => {
              const thirdTeam = groupPicks[group]?.[2] || teams[2]
              const selected = bestThirdGroups.includes(group)
              const rank = bestThirdGroups.indexOf(group) + 1
              return (
                <button key={group}
                  onClick={() => !locked && toggleThirdGroup(group)}
                  disabled={locked || (!selected && bestThirdGroups.length >= 8)}
                  style={{
                    padding: '10px', border: '1px solid', textAlign: 'left', cursor: locked ? 'default' : 'pointer',
                    borderColor: selected ? '#C8102E' : '#ddd',
                    background: selected ? '#fff5f5' : 'white',
                    opacity: !selected && bestThirdGroups.length >= 8 ? 0.4 : 1,
                  }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: selected ? '#C8102E' : '#888', marginBottom: '3px' }}>
                    Group {group} {selected ? `· #${rank}` : ''}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#111' }}>
                    {FLAGS[thirdTeam]} {thirdTeam}
                  </div>
                  <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>3rd place</div>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setStep('groups')}
              style={{ padding: '7px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
              ← back
            </button>
            <button
              onClick={() => setStep('bracket')}
              disabled={!thirdsComplete}
              style={{ padding: '7px 20px', background: thirdsComplete ? '#111' : '#ddd', color: 'white', border: 'none', cursor: thirdsComplete ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>
              next: fill in bracket →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Knockout bracket */}
      {step === 'bracket' && (
        <div>
          <div style={{ overflowX: 'auto', paddingBottom: '16px', marginLeft: '-20px', marginRight: '-20px', paddingLeft: '20px', paddingRight: '20px' }}>
            <BracketView
              r32Bracket={r32Bracket}
              bracketPicks={bracketPicks}
              bracketScores={bracketScores}
              scoringRules={scoringRules}
              locked={locked}
              onPick={pickBracket}
              onScore={(slot, score) => setBracketScores(prev => ({ ...prev, [slot]: score }))}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
            <button onClick={() => setStep('thirds')}
              style={{ padding: '7px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
              ← back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {saved && <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ bracket saved</span>}
              {!locked && (
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '7px 20px', background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>
                  {saving ? 'saving...' : 'save bracket →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Group Picker: drag-rank 4 teams ───────────────────────────────────────
function GroupPicker({ group, teams, picks, locked, onChange }: {
  group: string
  teams: string[]
  picks: string[]
  locked: boolean
  onChange: (ranked: string[]) => void
}) {
  const ranked = picks.length === 4 ? picks : teams
  const [dragging, setDragging] = useState<number | null>(null)

  function handleDragStart(i: number) { setDragging(i) }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragging === null || dragging === i) return
    const newRanked = [...ranked]
    const item = newRanked.splice(dragging, 1)[0]
    newRanked.splice(i, 0, item)
    setDragging(i)
    onChange(newRanked)
  }
  function handleDrop() { setDragging(null) }

  const posLabels = ['1st', '2nd', '3rd', '4th']
  const posColors = ['#2d7a2d', '#4a9a4a', '#aaa', '#ddd']

  return (
    <div style={{ background: 'white', border: '1px solid #e0e0db', padding: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
        Group {group}
      </div>
      {ranked.map((team, i) => (
        <div key={team}
          draggable={!locked}
          onDragStart={() => handleDragStart(i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={handleDrop}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 6px', marginBottom: '2px',
            background: dragging === i ? '#f5f5f5' : 'white',
            border: '1px solid #f0f0f0',
            cursor: locked ? 'default' : 'grab',
            userSelect: 'none',
          }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: posColors[i], minWidth: '22px' }}>{posLabels[i]}</span>
          <span style={{ fontSize: '12px' }}>{FLAGS[team]}</span>
          <span style={{ fontSize: '11px', fontWeight: i < 2 ? 600 : 400, color: i < 2 ? '#111' : '#888' }}>{team}</span>
          {!locked && <span style={{ marginLeft: 'auto', color: '#ccc', fontSize: '10px' }}>⠿</span>}
        </div>
      ))}
    </div>
  )
}

// ── Bracket View — mirrored left/right meeting at Final in center ─────────
function BracketView({ r32Bracket, bracketPicks, bracketScores, scoringRules, locked, onPick, onScore }: {
  r32Bracket: Record<string, { home: string; away: string }>
  bracketPicks: BracketPicks
  bracketScores: Record<string, string>
  scoringRules: BracketScoringRules
  locked: boolean
  onPick: (slot: string, team: string) => void
  onScore: (slot: string, score: string) => void
}) {
  // Split R32 into left (first 8) and right (last 8)
  const leftR32Slots = R32_MATCHUPS.slice(0, 8).map(m => m.slot)
  const rightR32Slots = R32_MATCHUPS.slice(8, 16).map(m => m.slot)

  // Left R16: winners of left R32 pairs
  const leftR16Slots = R16_MATCHUPS.slice(0, 4).map(m => m.slot)
  const rightR16Slots = R16_MATCHUPS.slice(4, 8).map(m => m.slot)

  const leftQFSlots = QF_MATCHUPS.slice(0, 2).map(m => m.slot)
  const rightQFSlots = QF_MATCHUPS.slice(2, 4).map(m => m.slot)

  const leftSFSlot = SF_MATCHUPS[0].slot
  const rightSFSlot = SF_MATCHUPS[1].slot

  const leftRounds = [
    { label: 'R32', slots: leftR32Slots },
    { label: 'R16', slots: leftR16Slots },
    { label: 'QF', slots: leftQFSlots },
    { label: 'SF', slots: [leftSFSlot] },
  ]

  const rightRounds = [
    { label: 'R32', slots: rightR32Slots },
    { label: 'R16', slots: rightR16Slots },
    { label: 'QF', slots: rightQFSlots },
    { label: 'SF', slots: [rightSFSlot] },
  ]

  const sfLeftPick = bracketPicks[leftSFSlot]
  const sfRightPick = bracketPicks[rightSFSlot]
  const champion = bracketPicks['FINAL']

  const MATCH_H = 54 // px — approximate height of one match card (2 teams)
  const MATCH_GAP = 4 // px — gap between matches in same round

  function renderHalf(rounds: typeof leftRounds, side: 'left' | 'right') {
    const cols = side === 'right' ? [...rounds].reverse() : rounds
    // When reversed for right side, we need to know the original round index for spacing
    const getRoundIndex = (label: string) => ['R32','R16','QF','SF'].indexOf(label)

    return (
      <div style={{ display: 'flex', gap: 0, flexDirection: 'row', alignItems: 'flex-start' }}>
        {cols.map(round => {
          const ri = getRoundIndex(round.label)
          // Each match in this round is centered over 2^ri R32 matches
          // Top offset before first match = half the space taken by 2^ri R32 slots minus half a match
          const slotsPerMatch = Math.pow(2, ri)
          const totalSlotH = slotsPerMatch * (MATCH_H + MATCH_GAP)
          const topPad = (totalSlotH - MATCH_H) / 2
          const betweenGap = totalSlotH - MATCH_H

          return (
            <div key={round.label} style={{ minWidth: 130 }}>
              <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#bbb', textAlign: 'center', paddingBottom: 8 }}>
                {round.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {round.slots.map((slot, mi) => {
                  const opponents = getSlotOpponents(slot, r32Bracket, bracketPicks)
                  return (
                    <div key={slot} style={{
                      paddingTop: mi === 0 ? topPad : betweenGap,
                      paddingBottom: 0,
                    }}>
                      <MatchCard
                        slot={slot}
                        home={opponents.home}
                        away={opponents.away}
                        picked={bracketPicks[slot]}
                        score={bracketScores[slot]}
                        showExactScore={slot === 'FINAL'}
                        locked={locked}
                        onPick={onPick}
                        onScore={onScore}
                      />
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8, minWidth: 960 }}>
      {/* Left half */}
      {renderHalf(leftRounds, 'left')}

      {/* Center: Final + Champion */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 120, padding: '0 6px', alignSelf: 'center' }}>
        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#bbb', textAlign: 'center' }}>final · exact score</div>
        <div style={{ border: '1px solid #e0e0db', background: 'white', overflow: 'hidden', width: '100%' }}>
          {[sfLeftPick, sfRightPick].map((team, i) => {
            const active = champion === team
            return (
              <button key={i}
                onClick={() => !locked && team && onPick('FINAL', team)}
                disabled={locked || !team}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                  padding: '5px 7px', border: 'none',
                  borderBottom: i === 0 ? '1px solid #f0f0f0' : 'none',
                  background: active ? '#C8102E' : !team ? '#fafafa' : 'white',
                  color: active ? 'white' : !team ? '#ccc' : '#333',
                  cursor: locked || !team ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: '11px', fontWeight: active ? 700 : 400,
                  textAlign: 'left' as const,
                }}>
                <span style={{ fontSize: 12 }}>{team ? FLAGS[team] || '' : ''}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {team || '—'}
                </span>
              </button>
            )
          })}
          {/* Exact score inputs for final */}
          {sfLeftPick && sfRightPick && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 8px', borderTop: '1px solid #f0f0f0' }}>
              <input type="number" min="0" max="15"
                value={bracketScores['FINAL']?.split('-')[0] ?? ''}
                placeholder="0"
                disabled={locked}
                onChange={e => {
                  const away = bracketScores['FINAL']?.split('-')[1] ?? ''
                  onScore('FINAL', `${e.target.value}-${away}`)
                }}
                style={{ width: 36, border: '1px solid #ddd', padding: '3px', textAlign: 'center', fontSize: '13px', fontFamily: 'inherit' }} />
              <span style={{ color: '#aaa', fontSize: 11 }}>–</span>
              <input type="number" min="0" max="15"
                value={bracketScores['FINAL']?.split('-')[1] ?? ''}
                placeholder="0"
                disabled={locked}
                onChange={e => {
                  const home = bracketScores['FINAL']?.split('-')[0] ?? ''
                  onScore('FINAL', `${home}-${e.target.value}`)
                }}
                style={{ width: 36, border: '1px solid #ddd', padding: '3px', textAlign: 'center', fontSize: '13px', fontFamily: 'inherit' }} />
            </div>
          )}
        </div>
        <div style={{ border: '1px solid #e0e0db', background: 'white', width: '100%', padding: '8px', textAlign: 'center' as const }}>
          <div style={{ fontSize: '9px', color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>champion</div>
          <div style={{ fontSize: 18 }}>{champion ? FLAGS[champion] || '🏆' : '🏆'}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#111', marginTop: 3 }}>{champion || 'TBD'}</div>
        </div>
      </div>

      {/* Right half */}
      {renderHalf(rightRounds, 'right')}
    </div>
  )
}

// ── Single match card ─────────────────────────────────────────────────────
function MatchCard({ slot, home, away, picked, score, showExactScore, locked, onPick, onScore }: {
  slot: string
  home: string
  away: string
  picked: string | undefined
  score: string | undefined
  showExactScore: boolean
  locked: boolean
  onPick: (slot: string, team: string) => void
  onScore: (slot: string, score: string) => void
}) {
  if (!home && !away) return <div style={{ height: showExactScore ? 80 : 54, border: '1px solid transparent' }} />
  const isPlaceholder = (t: string) => !t || t.startsWith('winner of')

  return (
    <div style={{ border: '1px solid #e0e0db', background: 'white', overflow: 'hidden' }}>
      {[home, away].map((team, i) => {
        const active = picked === team
        const placeholder = isPlaceholder(team)
        return (
          <button key={i}
            onClick={() => !locked && !placeholder && team && onPick(slot, team)}
            disabled={locked || placeholder || !team}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, width: '100%',
              padding: '4px 6px', border: 'none',
              borderBottom: i === 0 ? '1px solid #f0f0f0' : 'none',
              background: active ? '#C8102E' : placeholder || !team ? '#fafafa' : 'white',
              color: active ? 'white' : placeholder || !team ? '#ccc' : '#333',
              cursor: locked || placeholder || !team ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: '10px', fontWeight: active ? 700 : 400,
              textAlign: 'left' as const,
            }}>
            <span style={{ fontSize: 11 }}>{team && !placeholder ? FLAGS[team] || '' : ''}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 90 }}>
              {!team ? '—' : placeholder ? team.replace('winner of ', '→') : team}
            </span>
          </button>
        )
      })}
      {/* Exact score inputs — shown when both teams are known and exact mode is on */}
      {showExactScore && picked && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px', borderTop: '1px solid #f0f0f0' }}>
          <input type="number" min="0" max="15"
            value={score?.split('-')[0] ?? ''}
            placeholder="0"
            disabled={locked}
            onChange={e => {
              const away = score?.split('-')[1] ?? ''
              onScore(slot, `${e.target.value}-${away}`)
            }}
            style={{ width: 28, border: '1px solid #ddd', padding: '2px', textAlign: 'center', fontSize: '11px', fontFamily: 'inherit' }} />
          <span style={{ color: '#aaa', fontSize: 10 }}>–</span>
          <input type="number" min="0" max="15"
            value={score?.split('-')[1] ?? ''}
            placeholder="0"
            disabled={locked}
            onChange={e => {
              const home = score?.split('-')[0] ?? ''
              onScore(slot, `${home}-${e.target.value}`)
            }}
            style={{ width: 28, border: '1px solid #ddd', padding: '2px', textAlign: 'center', fontSize: '11px', fontFamily: 'inherit' }} />
        </div>
      )}
    </div>
  )
}
