'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

export const FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czechia': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Türkiye': '🇹🇷',
  'Germany': '🇩🇪', 'Curaçao': '🇨🇼', 'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Cape Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'Congo DR': '🇨🇩', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
  // Legacy / other
  'Poland': '🇵🇱', 'Serbia': '🇷🇸', 'Denmark': '🇩🇰', 'Cabo Verde': '🇨🇻',
  'Chile': '🇨🇱', 'Peru': '🇵🇪', 'Morocco': '🇲🇦',
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
  const [step, setStepState] = useState<Step>('groups')
  const [showSummary, setShowSummary] = useState(false)

  function setStep(s: Step) {
    setStepState(s)
    sessionStorage.setItem(`bracket_step_${poolId}`, s)
  }

  // Restore step from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(`bracket_step_${poolId}`) as Step | null
    if (saved) setStepState(saved)
  }, [poolId])
  const [groupPicks, setGroupPicks] = useState<GroupPicks>({})
  const [bestThirdGroups, setBestThirdGroups] = useState<string[]>([])
  const [bracketPicks, setBracketPicks] = useState<BracketPicks>({})
  const [bracketScores, setBracketScores] = useState<Record<string, string>>({})
  const [r32Bracket, setR32Bracket] = useState<Record<string, { home: string; away: string }>>({})
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
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
        const defaults: GroupPicks = {}
        Object.entries(WC_2026_GROUPS).forEach(([g, teams]) => {
          defaults[g] = [...teams] as [string, string, string, string]
        })
        setGroupPicks({ ...defaults, ...(data.group_picks || {}) })
        setBestThirdGroups(data.best_third_groups || [])
        setBracketPicks(data.bracket_picks || {})
        setBracketScores(data.bracket_scores || {})
        if (Object.keys(data.bracket_picks || {}).length > 0) {
          setShowSummary(true)
        }
      } else {
        // Try sessionStorage backup first
        const savedGroups = sessionStorage.getItem(`bracket_groups_${poolId}`)
        const savedThirds = sessionStorage.getItem(`bracket_thirds_${poolId}`)
        const savedPicks = sessionStorage.getItem(`bracket_picks_${poolId}`)
        const savedScores = sessionStorage.getItem(`bracket_scores_${poolId}`)

        const defaults: GroupPicks = {}
        Object.entries(WC_2026_GROUPS).forEach(([g, teams]) => {
          defaults[g] = [...teams] as [string, string, string, string]
        })

        if (savedGroups) {
          try { setGroupPicks({ ...defaults, ...JSON.parse(savedGroups) }) } catch { setGroupPicks(defaults) }
        } else {
          setGroupPicks(defaults)
        }
        if (savedThirds) { try { setBestThirdGroups(JSON.parse(savedThirds)) } catch {} }
        if (savedPicks) { try { setBracketPicks(JSON.parse(savedPicks)) } catch {} }
        if (savedScores) { try { setBracketScores(JSON.parse(savedScores)) } catch {} }

        // If we had session picks, try to save them to DB
        if (savedPicks && Object.keys(JSON.parse(savedPicks)).length > 0) {
          setShowSummary(true)
        }
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

  async function persistPicks(): Promise<boolean> {
    const supabase = createClient()
    const { error } = await supabase.from('bracket_picks').upsert({
      pool_id: poolId,
      user_id: userId,
      tournament_id: 'wc_2026',
      group_picks: groupPicks,
      best_third_groups: bestThirdGroups,
      bracket_picks: bracketPicks,
      bracket_scores: bracketScores,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pool_id,user_id' })
    if (error) {
      console.error('bracket save error:', error)
      return false
    }
    return true
  }

  async function handleSave() {
    setSaving(true)
    const ok = await persistPicks()
    setSaving(false)
    if (ok) setShowSummary(true)
  }

  async function handleSaveAndExit() {
    setSaving(true)
    await persistPicks()
    window.location.href = '/dashboard'
  }

  function setGroupRanking(group: string, ranked: string[]) {
    setGroupPicks(prev => ({ ...prev, [group]: ranked as [string, string, string, string] }))
  }

  function toggleThirdGroup(group: string) {
    setBestThirdGroups(prev => {
      if (prev.includes(group)) return prev.filter(g => g !== group)
      if (prev.length >= 8) return prev
      return [...prev, group]
    })
  }

  function pickBracket(slot: string, team: string) {
    setBracketPicks(prev => {
      const next = { ...prev, [slot]: team }
      const cascadeSlot = findNextSlot(slot)
      if (cascadeSlot) {
        const opponents = getNextSlotOpponents(cascadeSlot, next)
        if (next[cascadeSlot] && opponents.home !== next[cascadeSlot] && opponents.away !== next[cascadeSlot]) {
          delete next[cascadeSlot]
          const further = findNextSlot(cascadeSlot)
          if (further && next[further]) delete next[further]
        }
      }
      return next
    })
  }

  // Save picks to sessionStorage on every change as backup
  useEffect(() => {
    if (loading) return
    sessionStorage.setItem(`bracket_groups_${poolId}`, JSON.stringify(groupPicks))
  }, [groupPicks, loading])

  useEffect(() => {
    if (loading) return
    sessionStorage.setItem(`bracket_thirds_${poolId}`, JSON.stringify(bestThirdGroups))
  }, [bestThirdGroups, loading])

  useEffect(() => {
    if (loading) return
    sessionStorage.setItem(`bracket_picks_${poolId}`, JSON.stringify(bracketPicks))
    sessionStorage.setItem(`bracket_scores_${poolId}`, JSON.stringify(bracketScores))
  }, [bracketPicks, bracketScores, loading])
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (loading) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const ok = await persistPicks()
      if (ok) { setAutoSaved(true); setTimeout(() => setAutoSaved(false), 2000) }
    }, 1500)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [groupPicks, bestThirdGroups, bracketPicks, bracketScores])

  function findNextSlot(slot: string): string | null {
    if (slot.startsWith('R32')) {
      const r16 = R16_MATCHUPS.find(m => m.home === slot || m.away === slot)
      return r16?.slot || null
    }
    if (slot.startsWith('R16')) {
      const qf = QF_MATCHUPS.find(m => m.home === slot || m.away === slot)
      return qf?.slot || null
    }
    if (slot.startsWith('QF')) {
      const sf = SF_MATCHUPS.find(m => m.home === slot || m.away === slot)
      return sf?.slot || null
    }
    if (slot.startsWith('SF')) return 'FINAL'
    return null
  }

  function getNextSlotOpponents(slot: string, picks: BracketPicks): { home: string; away: string } {
    return getSlotOpponents(slot, r32Bracket, picks)
  }

  const groupsComplete = Object.keys(groupPicks).length === 12 &&
    Object.values(groupPicks).every(picks => picks.length === 4)
  const thirdsComplete = bestThirdGroups.length === 8

  if (loading) return <div style={{ color: '#aaa', fontSize: '12px' }}>loading...</div>

  // ── Summary view ───────────────────────────────────────────────────────
  if (showSummary) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' as const, gap: 8 }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>your bracket</h2>
            <p style={{ fontSize: '11px', color: '#888' }}>picks are saved · locked at kickoff Jun 12</p>
          </div>
          {!locked && (
            <button onClick={() => setShowSummary(false)}
              style={{ padding: '8px 16px', background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, minHeight: 44 }}>
              edit picks
            </button>
          )}
        </div>

        {/* Group picks summary */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '10px' }}>group stage</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: '8px' }}>
            {Object.entries(groupPicks).map(([group, teams]) => (
              <div key={group} style={{ background: 'white', border: '1px solid #e0e0db', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#bbb', textTransform: 'uppercase' as const, marginBottom: '6px' }}>Group {group}</div>
                {teams.slice(0, 3).map((team, i) => (
                  <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: '11px' }}>
                    <span style={{ fontSize: '9px', color: i === 0 ? '#C8102E' : '#aaa', minWidth: 14, fontWeight: 600 }}>{i + 1}</span>
                    <span>{FLAGS[team] || ''}</span>
                    <span style={{ fontWeight: i < 2 ? 600 : 400, color: i < 2 ? '#111' : '#888' }}>{team}</span>
                    {i === 2 && bestThirdGroups.includes(group) && (
                      <span style={{ fontSize: '9px', color: '#2d7a2d', marginLeft: 2 }}>✓ adv</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Knockout bracket — full visual */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '10px' }}>knockout bracket</div>
          <div style={{ overflowX: 'auto', marginLeft: '-20px', marginRight: '-20px', paddingLeft: '20px', paddingRight: '20px' }}>
            <BracketView
              r32Bracket={r32Bracket}
              bracketPicks={bracketPicks}
              bracketScores={bracketScores}
              scoringRules={scoringRules}
              locked={true}
              onPick={() => {}}
              onScore={() => {}}
            />
          </div>
        </div>

        {/* Champion */}
        {bracketPicks['FINAL'] && (
          <div style={{ padding: '12px', background: '#fff5f5', border: '1px solid #f0d0d0', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#C8102E', fontWeight: 600, marginBottom: '4px' }}>🏆 your champion</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '14px', fontWeight: 700 }}>
              <span>{FLAGS[bracketPicks['FINAL']] || ''}</span>
              <span>{bracketPicks['FINAL']}</span>
              {bracketScores['FINAL'] && <span style={{ fontSize: '12px', color: '#888', fontWeight: 400 }}>· final score: {bracketScores['FINAL']}</span>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px' }}>
      {/* Step tabs + auto-save indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #eee', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: 0 }}>
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
        <div style={{ fontSize: '10px', color: '#2d7a2d', marginBottom: '6px', opacity: autoSaved ? 1 : 0, transition: 'opacity 0.3s' }}>
          ✓ saved
        </div>
      </div>

      {/* Step 1: Group picks */}
      {step === 'groups' && (
        <div>
          <div style={{ background: '#f9f9f9', border: '1px solid #eee', padding: '12px 14px', marginBottom: '16px', borderLeft: '3px solid #C8102E' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '3px' }}>rank each group from 1st to 4th</div>
            <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.6 }}>
              The top 2 teams from each group advance to the Round of 32. Drag to reorder — your rankings will be used to build your bracket automatically.
            </div>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
            {!locked && (
              <button onClick={handleSaveAndExit} disabled={saving}
                style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', minHeight: 44 }}>
                {saving ? 'saving...' : 'save & exit'}
              </button>
            )}
            <button
              onClick={() => setStep('thirds')}
              style={{ padding: '8px 20px', background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, minHeight: 44, marginLeft: 'auto' }}>
              next: pick best 3rd place teams →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Best 8 third place teams */}
      {step === 'thirds' && (
        <div>
          <div style={{ background: '#f9f9f9', border: '1px solid #eee', padding: '12px 14px', marginBottom: '16px', borderLeft: '3px solid #C8102E' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '3px' }}>pick the 8 best 3rd-place teams</div>
            <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.6 }}>
              In the World Cup, the 8 best 3rd-place finishers also advance to the knockout stage. Select which 8 groups you think will produce a qualifying 3rd-place team. The order you select them is used to rank them.
            </div>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('groups')}
                style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', minHeight: 44 }}>
                ← back
              </button>
              {!locked && (
                <button onClick={handleSaveAndExit} disabled={saving}
                  style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', minHeight: 44 }}>
                  {saving ? 'saving...' : 'save & exit'}
                </button>
              )}
            </div>
            <button
              onClick={() => setStep('bracket')}
              disabled={!thirdsComplete}
              style={{ padding: '8px 20px', background: thirdsComplete ? '#111' : '#ddd', color: 'white', border: 'none', cursor: thirdsComplete ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, minHeight: 44 }}>
              next: fill in bracket →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Knockout bracket */}
      {step === 'bracket' && (
        <div>
          <div style={{ background: '#f9f9f9', border: '1px solid #eee', padding: '12px 14px', marginBottom: '16px', borderLeft: '3px solid #C8102E' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '3px' }}>pick who advances each round</div>
            <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.6 }}>
              Your R32 matchups are set from your group picks. Click a team to advance them — they'll carry through automatically. The Final always requires an exact score. You earn points for each team you correctly predict in that round.
            </div>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee', flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('thirds')}
                style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', minHeight: 44 }}>
                ← back
              </button>
              {!locked && (
                <button onClick={handleSaveAndExit} disabled={saving}
                  style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', minHeight: 44 }}>
                  {saving ? 'saving...' : 'save & exit'}
                </button>
              )}
            </div>
            {!locked && (
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 24px', background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, minHeight: 44 }}>
                {saving ? 'saving...' : 'save bracket →'}
              </button>
            )}
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
  // Visual order matches fotmob official bracket exactly
  // Left: M74+M77→R16_1, M73+M75→R16_2, M84+M88→R16_3, M83+M81→R16_4
  const leftR32Slots = ['R32_M74','R32_M77','R32_M73','R32_M75','R32_M84','R32_M88','R32_M83','R32_M81']
  // Right: M76+M78→R16_5, M79+M80→R16_6, M86+M82→R16_7, M85+M87→R16_8
  const rightR32Slots = ['R32_M76','R32_M78','R32_M79','R32_M80','R32_M86','R32_M82','R32_M85','R32_M87']
  const leftR16Slots = ['R16_1','R16_2','R16_3','R16_4']
  const rightR16Slots = ['R16_5','R16_6','R16_7','R16_8']

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 150, padding: '0 6px', alignSelf: 'center' }}>
        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#bbb', textAlign: 'center' }}>final</div>

        <div style={{ border: '1px solid #e0e0db', background: 'white', overflow: 'hidden', width: '100%' }}>
          {sfLeftPick && sfRightPick ? (<>
            {/* Score row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: 4, textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 56 }}>
                  {FLAGS[sfLeftPick] || ''} {sfLeftPick.split(' ')[0]}
                </div>
                <input type="number" min="0" max="15"
                  value={bracketScores['FINAL']?.split('-')[0] ?? ''}
                  placeholder="0" disabled={locked}
                  onChange={e => {
                    const away = bracketScores['FINAL']?.split('-')[1] ?? '0'
                    const homeVal = e.target.value
                    onScore('FINAL', `${homeVal}-${away}`)
                    const h = parseInt(homeVal) || 0
                    const a = parseInt(away) || 0
                    if (h !== a) onPick('FINAL', h > a ? sfLeftPick! : sfRightPick!)
                  }}
                  style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '14px', fontFamily: 'inherit', fontWeight: 600 }} />
              </div>
              <span style={{ color: '#ccc', fontSize: 12, paddingTop: 18 }}>–</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: 4, textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 56 }}>
                  {FLAGS[sfRightPick] || ''} {sfRightPick.split(' ')[0]}
                </div>
                <input type="number" min="0" max="15"
                  value={bracketScores['FINAL']?.split('-')[1] ?? ''}
                  placeholder="0" disabled={locked}
                  onChange={e => {
                    const home = bracketScores['FINAL']?.split('-')[0] ?? '0'
                    const awayVal = e.target.value
                    onScore('FINAL', `${home}-${awayVal}`)
                    const h = parseInt(home) || 0
                    const a = parseInt(awayVal) || 0
                    if (h !== a) onPick('FINAL', h > a ? sfLeftPick! : sfRightPick!)
                  }}
                  style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '14px', fontFamily: 'inherit', fontWeight: 600 }} />
              </div>
            </div>

            {/* After extra time note */}
            <div style={{ textAlign: 'center' as const, fontSize: '9px', color: '#bbb', padding: '3px 8px', borderTop: '1px solid #f0f0f0' }}>
              after extra time
            </div>

            {/* Penalty picker — only shown if draw */}
            {(() => {
              const parts = bracketScores['FINAL']?.split('-') ?? []
              const h = parseInt(parts[0])
              const a = parseInt(parts[1])
              if (isNaN(h) || isNaN(a) || h !== a) return null
              return (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '6px 8px' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: 4, textAlign: 'center' as const }}>who wins on penalties?</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[sfLeftPick, sfRightPick].map(team => (
                      <button key={team}
                        onClick={() => !locked && team && onPick('FINAL', team)}
                        disabled={locked}
                        style={{
                          flex: 1, padding: '5px 2px', fontSize: '10px', fontWeight: 600, border: '1px solid',
                          borderColor: champion === team ? '#C8102E' : '#ddd',
                          background: champion === team ? '#C8102E' : 'white',
                          color: champion === team ? 'white' : '#555',
                          cursor: locked ? 'default' : 'pointer',
                          fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                        }}>
                        {FLAGS[team!] || ''} {team!.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </>) : (
            <div style={{ textAlign: 'center' as const, color: '#ccc', fontSize: '11px', padding: '16px 8px' }}>
              pick your semi-finalists first
            </div>
          )}
        </div>

        {/* Champion — derived from score */}
        <div style={{ border: '1px solid #e0e0db', background: 'white', width: '100%', padding: '10px 8px', textAlign: 'center' as const }}>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>champion</div>
          <div style={{ fontSize: 22 }}>{champion ? FLAGS[champion] || '🏆' : '🏆'}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginTop: 4 }}>{champion || 'TBD'}</div>
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
