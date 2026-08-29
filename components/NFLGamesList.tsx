'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import GhostAccessManager from '@/components/GhostAccessManager'
import Best5Selector from '@/components/Best5Selector'
import { formatOdds, type OddsFormat } from '@/lib/oddsFormat'

interface NFLFixture {
  id: number
  round: string
  home_team: string
  away_team: string
  home_logo: string | null
  away_logo: string | null
  date: string
  status: string
  city: string | null
  home_score: number | null
  away_score: number | null
  odds_home: number | null
  odds_away: number | null
  line_asian_handicap_home: number | null
  line_total_goals: number | null
  line_ht_asian_handicap_home: number | null
  line_ht_total_points: number | null
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
  fixture_id: number | null
  category_id: string
  value_wld?: string | null
  value_ou?: string | null
  points_earned?: number | null
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles'

function fmt(dateStr: string) {
  const date = new Date(dateStr)
  const time = date.toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const tz = date.toLocaleTimeString('en-US', { timeZone: USER_TZ, timeZoneName: 'short' }).split(' ').pop()
  return `${time} ${tz}`
}

// Fixed, sensible display order — full-game props first, then their 1st-half counterparts.
// No exact-score category — NFL scores are too high-variance to make that a hittable pick.
const CATEGORY_ORDER = [
  'nfl_result', 'nfl_spread', 'nfl_total_points_ou',
  'nfl_ht_result', 'nfl_ht_spread', 'nfl_ht_total_points_ou',
]

export default function NFLGamesList({ poolId, userId, tournamentId, deadlineType = 'before_each_game', isAdmin = false, canManageGhosts = false, cfbGameMode = null, cfbBest10AdminOverride = false }: {
  poolId: string; userId: string; tournamentId: string; deadlineType?: string; isAdmin?: boolean; canManageGhosts?: boolean
  cfbGameMode?: string | null; cfbBest10AdminOverride?: boolean
}) {
  const [games, setGames] = useState<NFLFixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, Pred>>({})
  const [loading, setLoading] = useState(true)
  const [weekIndex, setWeekIndex] = useState(0)
  const [ghostEntries, setGhostEntries] = useState<{ id: string; name: string }[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string>(userId)
  const [newGhostName, setNewGhostName] = useState('')
  const [addingGhost, setAddingGhost] = useState(false)
  // Nudge shown right after a ghost is added — ghosts are (so far) always YouTubers, so
  // the natural next step is filling in their channel info on their own profile page.
  const [justCreatedGhost, setJustCreatedGhost] = useState<{ id: string; name: string } | null>(null)

  // Floating switcher — see the fuller comment in components/FixturesList.tsx. Only
  // shown once the real "making picks for" box has scrolled out of view. Checked via
  // getBoundingClientRect() on a capturing window scroll listener, not
  // IntersectionObserver — see that file's comment for why.
  const ghostBoxRef = useRef<HTMLDivElement>(null)
  const [showFloatingSwitcher, setShowFloatingSwitcher] = useState(false)
  useEffect(() => {
    function checkVisibility() {
      const el = ghostBoxRef.current
      if (!el) { setShowFloatingSwitcher(false); return }
      const rect = el.getBoundingClientRect()
      setShowFloatingSwitcher(rect.bottom < 0 || rect.top > window.innerHeight)
    }
    checkVisibility()
    window.addEventListener('scroll', checkVisibility, true)
    window.addEventListener('resize', checkVisibility)
    return () => {
      window.removeEventListener('scroll', checkVisibility, true)
      window.removeEventListener('resize', checkVisibility)
    }
  }, [isAdmin, canManageGhosts, ghostEntries.length])
  const [ghostBoxCollapsed, setGhostBoxCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(`ghost_box_collapsed_${poolId}`) === '1' } catch { return false }
  })
  function toggleGhostBox() {
    setGhostBoxCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(`ghost_box_collapsed_${poolId}`, next ? '1' : '0') } catch {}
      return next
    })
  }
  const [revealedOddsIds, setRevealedOddsIds] = useState<Set<number>>(new Set())
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('decimal')
  const [oddsAlwaysVisible, setOddsAlwaysVisible] = useState(false)

  // Odds display preference — same pattern as components/FixturesList.tsx, shared across
  // sports via the same profiles columns.
  useEffect(() => {
    if (!userId) return
    createClient().from('profiles').select('odds_format, odds_always_visible').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (data?.odds_format) setOddsFormat(data.odds_format as OddsFormat)
        if (data) setOddsAlwaysVisible(data.odds_always_visible)
      })
  }, [userId])

  async function toggleOddsAlwaysVisible() {
    if (!userId) return
    const next = !oddsAlwaysVisible
    setOddsAlwaysVisible(next)
    await createClient().from('profiles').update({ odds_always_visible: next }).eq('id', userId)
  }
  const [best10Selections, setBest10Selections] = useState<Record<string, number[]>>({})
  const activeEntryIdRef = useRef(activeEntryId)
  useEffect(() => { activeEntryIdRef.current = activeEntryId }, [activeEntryId])
  // NCAAF "best 10 games" — algorithm/admin picks 10 games a week instead of predicting
  // the full ~60-100 game FBS slate. Mirrors FixturesList's isBest5Active for PL.
  const isBest10Active = tournamentId === 'ncaaf_2026' && cfbGameMode === 'best10'

  async function load() {
    const supabase = createClient()
    const [gamesRes, rulesRes, predsRes, ghostRes] = await Promise.all([
      supabase.from('fixtures').select('*').eq('tournament_id', tournamentId).order('date'),
      supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
      supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId),
      supabase.from('ghost_entries').select('id, name').eq('pool_id', poolId),
    ])

    setGames(gamesRes.data || [])
    setPoolRules((rulesRes.data || []).map((r: any) => ({
      category_id: r.category_id, points: r.points, bonus_points: r.bonus_points || 0,
      name: r.ruleset_categories?.name || r.category_id,
      input_type: r.ruleset_categories?.input_type || 'wld',
    })))
    setGhostEntries(ghostRes.data || [])

    // best10 pools: fetch whatever's already selected, then compute-and-store any week
    // that hasn't been picked yet — same flow as FixturesList's PL best5 wiring.
    if (isBest10Active && gamesRes.data && gamesRes.data.length > 0) {
      const { data: existingRows } = await supabase
        .from('pool_matchweek_selections')
        .select('round, fixture_id')
        .eq('pool_id', poolId)
      const selMap: Record<string, number[]> = {}
      for (const r of existingRows || []) {
        (selMap[r.round] ??= []).push(r.fixture_id)
      }
      const rounds = [...new Set((gamesRes.data as any[]).map(g => g.round))]
      const missingRounds = rounds.filter(r => !selMap[r])
      if (missingRounds.length > 0) {
        const computed = await Promise.all(missingRounds.map(round =>
          fetch('/api/ncaaf/best10-select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poolId, round }),
          }).then(r => r.json()).then(j => ({ round, fixtureIds: j.fixtureIds || [] }))
        ))
        for (const { round, fixtureIds } of computed) selMap[round] = fixtureIds
      }
      setBest10Selections(selMap)
    }

    const predMap: Record<string, Pred> = {}
    for (const p of predsRes.data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
    setPreds(predMap)

    // Default to the earliest week that hasn't fully started yet
    const weeks = [...new Set((gamesRes.data || []).map((g: NFLFixture) => g.round))]
    const now = Date.now()
    const nextIdx = weeks.findIndex(w => {
      const weekGames = (gamesRes.data || []).filter((g: NFLFixture) => g.round === w)
      return weekGames.some((g: NFLFixture) => new Date(g.date).getTime() > now)
    })
    setWeekIndex(nextIdx >= 0 ? nextIdx : 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [poolId, userId, tournamentId])

  // Realtime subscription — keep the ghost-entry switcher in sync when the admin
  // adds/removes one from the leaderboard, without needing a full page reload
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`nfl-ghost-entries-${poolId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${poolId}` }, (payload) => {
        const g = payload.new as { id: string; name: string }
        setGhostEntries(prev => prev.some(e => e.id === g.id) ? prev : [...prev, g])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${poolId}` }, (payload) => {
        const deletedId = payload.old.id as string
        setGhostEntries(prev => prev.filter(e => e.id !== deletedId))
        // If we were mid-edit on the entry that just got deleted, fall back to our own picks
        if (activeEntryIdRef.current === deletedId) switchEntry(userId)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [poolId, userId])

  async function switchEntry(entryId: string) {
    // Fetch and set preds BEFORE flipping activeEntryId — the exact-score inputs are
    // uncontrolled (defaultValue) and remount on activeEntryId change (see their key prop
    // below). If activeEntryId flipped first, that remount would land on a render where
    // preds still held the previous entry's data, baking stale digits into the freshly
    // mounted input as its defaultValue — which then never updates again after mount.
    const supabase = createClient()
    const { data } = await supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', entryId)
    const predMap: Record<string, Pred> = {}
    for (const p of data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
    setPreds(predMap)
    setActiveEntryId(entryId)
  }

  async function addGhostEntry() {
    if (!newGhostName.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from('ghost_entries').insert({
      pool_id: poolId, name: newGhostName.trim(), created_by: userId
    }).select().single()
    if (data) {
      setGhostEntries(prev => [...prev, data])
      await switchEntry(data.id)
      setNewGhostName('')
      setAddingGhost(false)
      setJustCreatedGhost({ id: data.id, name: data.name })
    }
  }

  async function deleteGhost(g: { id: string; name: string }) {
    if (!confirm(`Delete ${g.name}? This also removes all of their picks.`)) return
    const supabase = createClient()
    await supabase.from('predictions_v2').delete().eq('pool_id', poolId).eq('user_id', g.id)
    await supabase.from('ghost_entries').delete().eq('id', g.id)
    setGhostEntries(prev => prev.filter(e => e.id !== g.id))
    if (activeEntryId === g.id) switchEntry(userId)
  }

  async function savePred(fixtureId: number, categoryId: string, value: Partial<Pred>) {
    const key = `${fixtureId}:${categoryId}`
    const existing = preds[key]
    setPreds(prev => ({ ...prev, [key]: { ...existing, fixture_id: fixtureId, category_id: categoryId, ...value } }))

    const supabase = createClient()
    if (existing?.id) {
      await supabase.from('predictions_v2').update(value).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('predictions_v2').insert({
        pool_id: poolId, user_id: activeEntryId, fixture_id: fixtureId, category_id: categoryId, ...value
      }).select().single()
      if (data) setPreds(prev => ({ ...prev, [key]: data }))
    }
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>loading...</div>

  const weeks = [...new Set(games.map(g => g.round))]
  if (weeks.length === 0) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>no games found</div>

  const safeIdx = Math.min(Math.max(weekIndex, 0), weeks.length - 1)
  const currentWeek = weeks[safeIdx]
  const allWeekGames = games.filter(g => g.round === currentWeek).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const weekGames = isBest10Active
    ? allWeekGames.filter(g => !best10Selections[currentWeek] || best10Selections[currentWeek].includes(g.id))
    : allWeekGames
  const enabledRules = CATEGORY_ORDER.map(id => poolRules.find(r => r.category_id === id)).filter(Boolean) as PoolRule[]

  // 'before_weekend' pools lock the whole gameweek at the first kickoff of that week,
  // rather than each game locking individually at its own kickoff — mirrors FixturesList's
  // isLocked/matchdayLockTime for PL's "before each match week" option.
  function weekLockTime(round: string): number {
    const weekGamesAll = games.filter(g => g.round === round)
    return Math.min(...weekGamesAll.map(g => new Date(g.date).getTime()))
  }
  function isGameLocked(game: NFLFixture) {
    if (deadlineType === 'before_weekend') {
      return Date.now() >= weekLockTime(game.round)
    }
    return new Date(game.date) <= new Date()
  }

  return (
    <div>
      {/* Entry switcher — admin or a member granted ghost-management access */}
      {(isAdmin || canManageGhosts) && (
        <div ref={ghostBoxRef} style={{ marginBottom: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db' }}>
          <div onClick={toggleGhostBox}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: ghostBoxCollapsed ? 0 : 8 }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>making picks for</span>
            <span style={{ fontSize: '11px', color: '#888' }}>{ghostBoxCollapsed ? 'show ▾' : 'hide ▴'}</span>
          </div>
          {!ghostBoxCollapsed && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
                <button type="button" onClick={() => switchEntry(userId)}
                  style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                    borderColor: activeEntryId === userId ? '#C8102E' : '#ddd',
                    background: activeEntryId === userId ? '#C8102E' : 'white',
                    color: activeEntryId === userId ? 'white' : '#555', fontWeight: activeEntryId === userId ? 700 : 400 }}>
                  you
                </button>
                {ghostEntries.map(g => (
                  <div key={g.id} style={{ display: 'flex' }}>
                    <button type="button" onClick={() => switchEntry(g.id)}
                      style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', borderRight: 'none', fontFamily: 'inherit', cursor: 'pointer',
                        borderColor: activeEntryId === g.id ? '#C8102E' : '#ddd',
                        background: activeEntryId === g.id ? '#C8102E' : 'white',
                        color: activeEntryId === g.id ? 'white' : '#555', fontWeight: activeEntryId === g.id ? 700 : 400 }}>
                      {g.name}
                    </button>
                    <a href={`/dashboard/g/${g.id}`} title={`manage ${g.name}'s profile`}
                      style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid #ddd', borderRight: isAdmin ? 'none' : undefined, background: 'white', color: '#888', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                      ✎
                    </a>
                    {isAdmin && (
                      <button type="button" title={`delete ${g.name}`} onClick={() => deleteGhost(g)}
                        style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid #ddd', background: 'white', color: '#C8102E', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {isAdmin && !addingGhost && (
                  <button type="button" onClick={() => setAddingGhost(true)}
                    style={{ padding: '5px 10px', fontSize: '12px', border: '1px dashed #ddd', background: 'white', color: '#aaa', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + add entry
                  </button>
                )}
              </div>
              {isAdmin && addingGhost && (
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
              {isAdmin && justCreatedGhost && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, padding: '7px 10px', background: '#fff5f5', border: '1px solid #f0d0d0', fontSize: '12px' }}>
                  <span style={{ color: '#555' }}>✓ {justCreatedGhost.name} added — <a href={`/dashboard/g/${justCreatedGhost.id}`} style={{ color: '#C8102E', fontWeight: 600 }}>add their channel info →</a></span>
                  <button type="button" onClick={() => setJustCreatedGhost(null)}
                    style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>×</button>
                </div>
              )}
              {isAdmin && <GhostAccessManager poolId={poolId} currentUserId={userId} />}
            </>
          )}
        </div>
      )}

      {/* Floating switcher — see the fuller comment in components/FixturesList.tsx. Only
          shown once the real box above has scrolled out of view. */}
      {showFloatingSwitcher && (isAdmin || canManageGhosts) && ghostEntries.length > 0 && (
        <div style={{
          position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          background: 'white', border: '1px solid #ddd', borderRadius: 20,
          padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' as const, maxWidth: '92vw',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#888', flexShrink: 0, whiteSpace: 'nowrap' as const }}>
            making picks for
          </span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => switchEntry(userId)}
              style={{
                padding: '4px 10px', fontSize: '12px', border: '1px solid', borderRadius: 3, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                borderColor: activeEntryId === userId ? '#C8102E' : '#ddd',
                background: activeEntryId === userId ? '#C8102E' : 'white',
                color: activeEntryId === userId ? 'white' : '#555', fontWeight: activeEntryId === userId ? 700 : 400,
              }}>
              you
            </button>
            {ghostEntries.map(g => (
              <button type="button" key={g.id} onClick={() => switchEntry(g.id)}
                style={{
                  padding: '4px 10px', fontSize: '12px', border: '1px solid', borderRadius: 3, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  borderColor: activeEntryId === g.id ? '#C8102E' : '#ddd',
                  background: activeEntryId === g.id ? '#C8102E' : 'white',
                  color: activeEntryId === g.id ? 'white' : '#555', fontWeight: activeEntryId === g.id ? 700 : 400,
                }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setWeekIndex(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === 0 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === 0 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center' as const }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>🏈 {currentWeek}</div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>{safeIdx + 1} of {weeks.length}</div>
        </div>
        <button type="button" onClick={() => setWeekIndex(i => Math.min(weeks.length - 1, i + 1))} disabled={safeIdx === weeks.length - 1}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === weeks.length - 1 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === weeks.length - 1 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ›
        </button>
      </div>

      {isBest10Active && isAdmin && cfbBest10AdminOverride && (() => {
        const selectedIds = best10Selections[currentWeek] || []
        const selectedGames = allWeekGames.filter(g => selectedIds.includes(g.id))
        // Swaps close one week before the earliest of the TEN selected kickoffs, not the
        // week's overall first game — mirrors FixturesList's Best5Selector wiring for PL.
        const earliestSelectedKickoff = selectedGames.length > 0
          ? Math.min(...selectedGames.map(g => new Date(g.date).getTime()))
          : null
        const overrideLockTime = earliestSelectedKickoff !== null ? earliestSelectedKickoff - 7 * 24 * 60 * 60 * 1000 : null
        const locked = overrideLockTime !== null && Date.now() >= overrideLockTime
        return (
          <Best5Selector
            poolId={poolId}
            round={currentWeek}
            selectedIds={selectedIds}
            allFixtures={allWeekGames}
            locked={locked}
            lockTime={overrideLockTime !== null ? new Date(overrideLockTime) : null}
            count={10}
            roundNoun="week"
            onSwap={(oldId, newId) => setBest10Selections(prev => ({
              ...prev,
              [currentWeek]: (prev[currentWeek] || []).map(id => id === oldId ? newId : id),
            }))}
          />
        )
      })()}

      {/* Games for this week */}
      {weekGames.map(game => {
        // Ghost entries stay editable past the normal lock — activeEntryId can only ever
        // be `userId` or one of ghostEntries' ids, so this only bypasses lock while an
        // authorized admin/manager is actively picking on a ghost's behalf.
        const locked = activeEntryId === userId && isGameLocked(game)
        const finished = game.status === 'FT'
        const isLive = game.status === 'live'
        const hasAnyPick = enabledRules.some(r => {
          const p = preds[`${game.id}:${r.category_id}`]
          return p?.value_wld || p?.value_ou
        })
        const btnStyle = (active: boolean): React.CSSProperties => ({
          flex: 1, padding: '8px 4px', fontSize: '11px', border: '1px solid',
          cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit',
          borderColor: active ? '#C8102E' : '#ddd',
          background: active ? '#C8102E' : locked ? '#fafafa' : 'white',
          color: active ? 'white' : '#555',
        })
        const hasOdds = game.odds_home != null || game.odds_away != null
        const oddsRevealed = revealedOddsIds.has(game.id)
        const revealed = !!oddsAlwaysVisible || !!oddsRevealed
        const toggleOdds = (e: React.MouseEvent) => {
          e.stopPropagation()
          setRevealedOddsIds(prev => {
            const next = new Set(prev)
            if (next.has(game.id)) next.delete(game.id); else next.add(game.id)
            return next
          })
        }
        const oddsLine = (value: number | null) => hasOdds && (
          <span style={{
            display: 'block', fontSize: '10px', marginTop: 2,
            filter: revealed ? 'none' : 'blur(3px)', transition: 'filter 0.15s',
          }}>
            {value != null ? formatOdds(value, oddsFormat || 'decimal') : '—'}
          </span>
        )

        return (
          <div key={game.id} style={{
            marginBottom: 12,
            background: 'white',
            border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
            borderLeft: isLive ? '4px solid #2d7a2d' : hasAnyPick ? '3px solid #C8102E' : '1px solid #e0e0db',
          }}>
            {/* Meta row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '10px', color: '#aaa' }}>
              <span>{fmt(game.date)}</span>
              {game.city && <span>{game.city}</span>}
              {isLive
                ? <span style={{ color: '#2d7a2d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', display: 'inline-block' }} /> LIVE
                  </span>
                : locked && !finished ? <span>locked</span>
                : !finished ? (
                    <span style={{ color: '#bbb' }}>
                      {deadlineType === 'before_weekend'
                        ? `locks ${fmt(new Date(weekLockTime(game.round)).toISOString())}`
                        : `locks at kickoff · ${fmt(game.date)}`}
                    </span>
                  ) : null}
            </div>

            {/* Team header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 10px', gap: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, gap: 4 }}>
                {game.away_logo
                  ? <img src={game.away_logo} alt={game.away_team} style={{ width: 44, height: 44, objectFit: 'contain' as const }} />
                  : <span style={{ fontSize: '28px' }}>🏈</span>}
                <span style={{ fontWeight: 700, fontSize: '11px', textAlign: 'center' as const, lineHeight: 1.2 }}>{game.away_team}</span>
              </div>
              {(finished || isLive)
                ? <span style={{ fontWeight: 700, fontSize: isLive ? '22px' : '18px', color: isLive ? '#2d7a2d' : '#111', flexShrink: 0, padding: '0 8px' }}>{game.away_score} – {game.home_score}</span>
                : <span style={{ fontSize: '12px', color: '#ccc', flexShrink: 0, padding: '0 8px' }}>@</span>}
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, gap: 4 }}>
                {game.home_logo
                  ? <img src={game.home_logo} alt={game.home_team} style={{ width: 44, height: 44, objectFit: 'contain' as const }} />
                  : <span style={{ fontSize: '28px' }}>🏈</span>}
                <span style={{ fontWeight: 700, fontSize: '11px', textAlign: 'center' as const, lineHeight: 1.2 }}>{game.home_team}</span>
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderTop: '1px solid #f5f5f5' }}>
              {enabledRules.length === 0 && (
                <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center' as const, padding: 8 }}>no predictions configured for this pool</div>
              )}
              {enabledRules.map(rule => {
                const key = `${game.id}:${rule.category_id}`
                const pick = preds[key]
                const isHt = rule.category_id.startsWith('nfl_ht_')
                const spreadLine = isHt ? game.line_ht_asian_handicap_home : game.line_asian_handicap_home
                const totalLine = isHt ? game.line_ht_total_points : game.line_total_goals

                return (
                  <div key={rule.category_id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{rule.name}</span>
                      <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points > 1 ? 's' : ''}</span>
                    </div>

                    {rule.input_type === 'wld' && (rule.category_id === 'nfl_spread' || rule.category_id === 'nfl_ht_spread') && (() => {
                      // A push is only possible when the line is a whole number — half-point
                      // spreads (the vast majority) can never tie, so don't offer that option.
                      const canPush = spreadLine != null && Number.isInteger(spreadLine)
                      return (
                        <div style={{ display: 'flex', gap: 0 }}>
                          <button style={{ ...btnStyle(pick?.value_wld === 'away'), borderRight: 'none' }} disabled={locked}
                            onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'away' })}>
                            {game.away_team}{spreadLine != null ? ` (${spreadLine > 0 ? '+' : ''}${-spreadLine})` : ''}
                          </button>
                          {canPush && (
                            <button style={{ ...btnStyle(pick?.value_wld === 'draw'), borderRight: 'none' }} disabled={locked}
                              onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'draw' })}>
                              push
                            </button>
                          )}
                          <button style={btnStyle(pick?.value_wld === 'home')} disabled={locked}
                            onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'home' })}>
                            {game.home_team}{spreadLine != null ? ` (${spreadLine > 0 ? '+' : ''}${spreadLine})` : ''}
                          </button>
                        </div>
                      )
                    })()}

                    {rule.input_type === 'wld' && rule.category_id !== 'nfl_spread' && rule.category_id !== 'nfl_ht_spread' && (() => {
                      const showOdds = rule.category_id === 'nfl_result' && hasOdds
                      return (
                        <div>
                          <div style={{ display: 'flex', gap: 0 }}>
                            <button style={{ ...btnStyle(pick?.value_wld === 'away'), borderRight: 'none', overflow: 'hidden' }} disabled={locked}
                              onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'away' })}>
                              {game.away_team}
                              {showOdds && oddsLine(game.odds_away)}
                            </button>
                            <button style={{ ...btnStyle(pick?.value_wld === 'draw'), borderRight: 'none', flexShrink: 0, flex: '0 0 60px' }} disabled={locked}
                              onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'draw' })}>
                              tie
                            </button>
                            <button style={{ ...btnStyle(pick?.value_wld === 'home'), overflow: 'hidden' }} disabled={locked}
                              onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'home' })}>
                              {game.home_team}
                              {showOdds && oddsLine(game.odds_home)}
                            </button>
                          </div>
                          {showOdds && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              <span onClick={toggleOdds} style={{ fontSize: '10px', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>
                                {revealed ? 'tap to hide odds' : 'tap to reveal odds'}
                              </span>
                              <span style={{ color: '#ddd', fontSize: '10px' }}>·</span>
                              <span onClick={toggleOddsAlwaysVisible} style={{ fontSize: '10px', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>
                                {oddsAlwaysVisible ? 'stop always showing odds' : 'keep odds visible'}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {rule.input_type === 'ou' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button style={{ ...btnStyle(pick?.value_ou === 'over'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_ou: 'over' })}>
                          over {totalLine ?? '(line TBD)'}
                        </button>
                        <button style={btnStyle(pick?.value_ou === 'under')} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_ou: 'under' })}>
                          under {totalLine ?? '(line TBD)'}
                        </button>
                      </div>
                    )}

                    {pick?.points_earned != null && game.status === 'FT' && (
                      <div style={{ fontSize: '10px', marginTop: 4, color: pick.points_earned > 0 ? '#2d7a2d' : '#aaa' }}>
                        {pick.points_earned > 0 ? `✓ +${pick.points_earned} pts` : '✗ no points'}
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
