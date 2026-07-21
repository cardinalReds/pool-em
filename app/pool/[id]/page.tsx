'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RULE_PACKAGES } from '@/types'
import FixturesList from '@/components/FixturesList'
import F1SessionsList from '@/components/F1SessionsList'
import MMAFightCard from '@/components/MMAFightCard'
import ReminderButton from '@/components/ReminderButton'
import InvitePanel from '@/components/InvitePanel'
import { DEFAULT_BRACKET_SCORING } from '@/lib/bracketEngine'
import BracketPicker from '@/components/BracketPicker'
import BracketViewer from '@/components/BracketViewer'
import ShitChat from '@/components/ShitChat'

function getSessionFromCookie() {
  try {
    const cookieName = 'sb-bsrvqpggsxyrxatdtnqf-auth-token'
    const match = document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch { return null }
}

function ArchivePool({ poolId, userId, archived }: { poolId: string; userId: string; archived: boolean }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handle() {
    setStatus('loading')
    const res = await fetch('/api/pool/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId, userId, archived: !archived }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      setStatus('done')
      setTimeout(() => window.location.href = '/dashboard', 1000)
    }
  }

  return (
    <div>
      <button onClick={handle} disabled={status === 'loading'}
        style={{fontSize: '12px', padding: '8px 10px', width: '100%', background: 'white', color: '#888', border: '1px solid #ddd', cursor: status === 'loading' ? 'default' : 'pointer', fontFamily: 'inherit'}}>
        {status === 'loading' ? 'archiving...' : status === 'done' ? '✓ archived' : archived ? 'unarchive pool' : 'archive pool'}
      </button>
      {status === 'error' && <div style={{fontSize: '11px', color: '#C8102E', marginTop: 4}}>{errorMsg}</div>}
    </div>
  )
}

// Every table with a pool_id foreign key — must be cleared before the pools row itself can be deleted
const POOL_CHILD_TABLES = [
  'predictions', 'predictions_v2', 'ghost_entries', 'pool_rules', 'season_prop_rules',
  'bracket_scoring_rules', 'bracket_picks', 'pool_changes', 'messages', 'reminders', 'pool_members',
]

function DeletePool({ poolId }: { poolId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const supabase = createClient()
    for (const table of POOL_CHILD_TABLES) {
      const { error: childError } = await supabase.from(table).delete().eq('pool_id', poolId)
      if (childError) { setError(`failed to delete ${table}: ${childError.message}`); setDeleting(false); return }
    }
    const { error: poolError } = await supabase.from('pools').delete().eq('id', poolId)
    if (poolError) { setError(poolError.message); setDeleting(false); return }
    window.location.href = '/dashboard'
  }

  return (
    <div>
      {!confirming ? (
        <button onClick={() => setConfirming(true)}
          style={{fontSize: '12px', padding: '8px 10px', width: '100%', background: 'white', color: '#C8102E', border: '1px solid #C8102E', cursor: 'pointer', fontFamily: 'inherit'}}>
          delete pool
        </button>
      ) : (
        <div>
          <p style={{fontSize: '12px', color: '#555', marginBottom: '8px'}}>this will delete all picks and members. are you sure?</p>
          <div style={{display: 'flex', gap: '8px'}}>
            <button onClick={() => setConfirming(false)}
              style={{flex: 1, fontSize: '12px', padding: '8px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit'}}>
              cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{flex: 1, fontSize: '12px', padding: '8px', background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit'}}>
              {deleting ? 'deleting...' : 'yes, delete'}
            </button>
          </div>
          {error && <p style={{fontSize: '11px', color: '#C8102E', marginTop: '8px'}}>{error}</p>}
        </div>
      )}
    </div>
  )
}

function Section({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{borderTop: '1px solid #eee'}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <span style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb'}}>{title}</span>
        <span style={{fontSize: '12px', color: '#ccc'}}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{paddingBottom: '14px'}}>{children}</div>}
    </div>
  )
}

export default function PoolPage({ params }: { params: { id: string } }) {
  const [pool, setPool] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [yourLeaderboard, setYourLeaderboard] = useState<any[]>([])
  const [yourLeaderboardFixtureCount, setYourLeaderboardFixtureCount] = useState(0)
  const [leaderboardTab, setLeaderboardTab] = useState<'overall' | 'h2h'>('overall')
  const [h2hOpponent, setH2hOpponent] = useState<any>(null)
  const [allPredsCached, setAllPredsCached] = useState<any[]>([])
  const [finishedFixtureIds, setFinishedFixtureIds] = useState<Set<number>>(new Set())
  const [totalFixtureCount, setTotalFixtureCount] = useState(0)
  const [finishedFixtureCount, setFinishedFixtureCount] = useState(0)
  const [poolRules, setPoolRules] = useState<any[]>([])
  const [bracketScoringRules, setBracketScoringRules] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'picks' | 'leaderboard' | 'chat' | 'settings'>('picks')
  const mobilePanelRef = useRef<HTMLDivElement>(null)

  function switchMobilePanel(panel: 'picks' | 'leaderboard' | 'chat' | 'settings') {
    setMobilePanel(panel)
    setTimeout(() => mobilePanelRef.current?.scrollTo({ top: 0 }), 0)
  }
  const [mobileSortMode, setMobileSortMode] = useState<'date' | 'group' | 'round'>('group')
  const [mobileViewMode, setMobileViewMode] = useState<'pages' | 'list'>('pages')
  const [chatWidth, setChatWidth] = useState(260)
  const [isResizingChat, setIsResizingChat] = useState(false)

  useEffect(() => {
    if (!isResizingChat) return
    document.body.style.userSelect = 'none'
    function onMove(e: MouseEvent) {
      const newWidth = window.innerWidth - e.clientX
      setChatWidth(Math.min(600, Math.max(220, newWidth)))
    }
    function onUp() { setIsResizingChat(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizingChat])
  const [recentChanges, setRecentChanges] = useState<any[]>([])
  const [changesDismissed, setChangesDismissed] = useState(false)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      let currentUser = null
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        currentUser = authUser
      } else {
        const session = getSessionFromCookie()
        if (session?.access_token) {
          await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
          const { data: { user: restored } } = await supabase.auth.getUser()
          currentUser = restored
        }
      }
      if (!currentUser) { window.location.href = '/auth/login'; return }
      setUser(currentUser)

      const { data: pool } = await supabase.from('pools').select('*').eq('id', params.id).single()
      if (!pool) { setNotFound(true); setLoading(false); return }
      
      // Fetch tournament end_date to know if competition is over
      if (pool.tournament_id) {
        const { data: tournament } = await supabase.from('tournaments').select('end_date').eq('id', pool.tournament_id).maybeSingle()
        if (tournament?.end_date) pool.tournament_end_date = tournament.end_date
      }
      
      setPool(pool)
      setInviteUrl(`${window.location.origin}/pool/join/${pool.invite_code}`)

      const { data: fetchedMembership } = await supabase.from('pool_members').select('id, last_seen_changes_at').eq('pool_id', pool.id).eq('user_id', currentUser.id).single()
      let membership = fetchedMembership
      if (!membership && pool.admin_id === currentUser.id) {
        // Admin's own membership row is missing — can happen if it failed to save at creation
        // time (fixed separately, but pre-existing pools can still be affected). Self-heal
        // instead of bouncing the pool's own admin to the "you've been invited" join screen.
        const { data: healedMembership } = await supabase.from('pool_members').insert({
          pool_id: pool.id,
          user_id: currentUser.id,
          display_name: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Admin',
        }).select('id, last_seen_changes_at').single()
        membership = healedMembership
      }
      if (!membership) { window.location.href = `/pool/join/${pool.invite_code}`; return }

      // Load changes since last seen
      const lastSeen = membership.last_seen_changes_at
      const { data: changesData } = await supabase
        .from('pool_changes')
        .select('changes, changed_at')
        .eq('pool_id', pool.id)
        .gt('changed_at', lastSeen || '2000-01-01')
        .order('changed_at', { ascending: false })
        .limit(5)

      if (changesData && changesData.length > 0) {
        setRecentChanges(changesData)
        // Mark as seen
        await supabase.from('pool_members').update({ last_seen_changes_at: new Date().toISOString() }).eq('id', membership.id)
      }

      const { data: members } = await supabase.from('pool_members').select('*').eq('pool_id', pool.id)

      const pointsMap: Record<string, number> = {}
      const maxPossibleMap: Record<string, number> = {}
      if (pool.deadline_type === 'before_tournament' && pool.sport !== 'mma') {
        const { data: bracketScores } = await supabase
          .from('bracket_picks')
          .select('user_id, bracket_scores')
          .eq('pool_id', pool.id)
        bracketScores?.forEach(b => {
          if (b.bracket_scores?.total) pointsMap[b.user_id] = b.bracket_scores.total
          if (b.bracket_scores?.max_possible != null) maxPossibleMap[b.user_id] = b.bracket_scores.max_possible
        })
      } else if (pool.package_id === 'CUSTOM') {
        const { data: scores } = await supabase.from('predictions_v2').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      } else {
        const { data: scores } = await supabase.from('predictions').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      }
      // Include ghost entries in leaderboard
      const { data: ghosts } = await supabase.from('ghost_entries').select('id, name').eq('pool_id', pool.id)
      const ghostMembers = (ghosts || []).map(g => ({ user_id: g.id, display_name: g.name, is_paid: false, is_ghost: true }))
      const allMembers = [...(members || []), ...ghostMembers]

      setLeaderboard(allMembers.map(m => ({ ...m, points: pointsMap[m.user_id] || 0, maxPossible: maxPossibleMap[m.user_id] })).sort((a, b) => b.points - a.points))

      // ── "Your Leaderboard" — total points across only the fixtures the LOGGED-IN user predicted on ──
      if (pool.package_id === 'CUSTOM' && pool.deadline_type !== 'before_tournament') {
        const { data: allPreds } = await supabase
          .from('predictions_v2')
          .select('user_id, fixture_id, points_earned, value_wld, value_text, value_ou, value_yesno, value_number')
          .eq('pool_id', pool.id)

        setAllPredsCached(allPreds || [])

        // F1 pools store picks against f1_sessions, not fixtures — predictions_v2.fixture_id
        // holds the session id in that case, so "finished" has to be looked up in the right table.
        const isF1 = pool.sport === 'f1'
        const gameTable = isF1 ? 'f1_sessions' : 'fixtures'

        // Total games in this tournament
        const { count: fixtureCount } = await supabase
          .from(gameTable)
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', pool.tournament_id)
        setTotalFixtureCount(fixtureCount || 0)

        // Only count finished games for the predicted count display
        const { data: finishedFixtures } = isF1
          ? await supabase.from(gameTable).select('id').eq('tournament_id', pool.tournament_id).eq('scored', true)
          : await supabase.from(gameTable).select('id').eq('tournament_id', pool.tournament_id).eq('status', 'FT')
        const finishedIds = new Set((finishedFixtures || []).map((f: any) => f.id))
        setFinishedFixtureIds(finishedIds)
        setFinishedFixtureCount(finishedFixtures?.length || 0)

        // Step 1: find the finished fixtures THIS user predicted on
        const myFixtureIds = new Set<number>()
        allPreds?.forEach(p => {
          if (p.user_id !== currentUser.id || p.fixture_id === null) return
          if (!finishedIds.has(p.fixture_id)) return
          const hasValue = p.value_wld || p.value_text || p.value_ou || p.value_yesno !== null || p.value_number !== null
          if (hasValue) myFixtureIds.add(p.fixture_id)
        })

        // Step 2: sum everyone's points, but only for fixtures in myFixtureIds
        const restrictedPointsMap: Record<string, number> = {}
        allPreds?.forEach(p => {
          if (p.fixture_id === null || !myFixtureIds.has(p.fixture_id)) return
          restrictedPointsMap[p.user_id] = (restrictedPointsMap[p.user_id] || 0) + (p.points_earned ?? 0)
        })

        const perPickLeaderboard = (members || [])
          .map(m => ({ ...m, points: restrictedPointsMap[m.user_id] || 0 }))
          .sort((a, b) => b.points - a.points)

        setYourLeaderboard(perPickLeaderboard)
        setYourLeaderboardFixtureCount(myFixtureIds.size)
      }

      if (pool.package_id === 'CUSTOM') {
        const { data: rules } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points, ruleset_categories(name, input_type)')
          .eq('pool_id', pool.id)
          .order('category_id')
        setPoolRules(rules || [])
      }

      // Fetch bracket scoring rules for before_tournament pools
      if (pool.deadline_type === 'before_tournament') {
        const { data: bsr } = await supabase
          .from('bracket_scoring_rules')
          .select('*')
          .eq('pool_id', pool.id)
          .maybeSingle()
        setBracketScoringRules(bsr)
      }

      // Check for live fixtures
      const { data: liveFixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', pool.tournament_id)
        .eq('status', 'live')
        .limit(1)
      setIsLive((liveFixtures?.length ?? 0) > 0)

      setLoading(false)
    }
    load()

    // Subscribe to fixture status changes for live indicator
    const supabase = createClient()
    const channel = supabase
      .channel('pool-live-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, (payload) => {
        if (payload.new.status === 'live') setIsLive(true)
        else if (payload.new.status === 'finished' || payload.new.status === 'NS') {
          // Re-check if any games still live
          supabase.from('fixtures').select('id').eq('status', 'live').limit(1)
            .then(({ data }) => setIsLive((data?.length ?? 0) > 0))
        }
      })
      .subscribe()

    // Ghost entries are added from the picks tab (a different component) — subscribe
    // so the leaderboard picks up new/removed entries without a manual page refresh.
    const ghostChannel = supabase
      .channel('pool-ghost-entries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${params.id}` }, (payload) => {
        setLeaderboard(prev => prev.some(m => m.user_id === payload.new.id) ? prev : [
          ...prev,
          { user_id: payload.new.id, display_name: payload.new.name, is_paid: false, is_ghost: true, points: 0 },
        ].sort((a, b) => b.points - a.points))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${params.id}` }, (payload) => {
        setLeaderboard(prev => prev.filter(m => m.user_id !== payload.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(ghostChannel) }
  }, [params.id])

  async function togglePaid(memberId: string, currentValue: boolean) {
    const supabase = createClient()
    await supabase.from('pool_members').update({ is_paid: !currentValue }).eq('id', memberId)
    setLeaderboard(prev => prev.map(m => m.id === memberId ? { ...m, is_paid: !currentValue } : m))
  }

  if (loading) return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#888'}}>
      loading...
    </div>
  )

  if (notFound) return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px'}}>
      pool not found.
    </div>
  )

  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  const isAdmin = pool.admin_id === user?.id

  // Buy-in collection summary — how much of the pot has actually been collected so far
  const payingMembers = leaderboard.filter(m => !m.is_ghost)
  const paidCount = payingMembers.filter(m => m.is_paid).length
  const totalCollected = paidCount * (pool.buy_in_amount || 0)
  const totalDue = payingMembers.length * (pool.buy_in_amount || 0)

  function CollectionSummary() {
    if (!isAdmin || !pool.buy_in_amount || payingMembers.length === 0) return null
    return (
      <div style={{fontSize: '11px', color: '#555', marginTop: 4}}>
        ${totalCollected} of ${totalDue} collected · {paidCount} of {payingMembers.length} paid
      </div>
    )
  }

  function PaidPill({ member }: { member: any }) {
    if (isAdmin) {
      return (
        <button onClick={() => togglePaid(member.id, member.is_paid)}
          style={{fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: 10, border: '1px solid',
            borderColor: member.is_paid ? '#2d7a2d' : '#ddd',
            background: member.is_paid ? '#2d7a2d' : 'white',
            color: member.is_paid ? 'white' : '#888', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0}}>
          {member.is_paid ? 'paid' : 'mark paid'}
        </button>
      )
    }
    return (
      <span style={{fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: 10, border: '1px solid',
        borderColor: member.is_paid ? '#2d7a2d' : '#ddd',
        background: member.is_paid ? '#e8f5e9' : '#fafafa',
        color: member.is_paid ? '#2d7a2d' : '#aaa', flexShrink: 0}}>
        {member.is_paid ? 'paid' : 'unpaid'}
      </span>
    )
  }

  const sidebarContent = (
    <div style={{padding: isMobile ? '16px' : '40px 24px', maxWidth: isMobile ? '100%' : 280, margin: isMobile ? 0 : '0 auto', width: '100%'}}>

      <div style={{fontWeight: 700, fontSize: '16px', marginBottom: '2px'}}>{pool.name}</div>
      <div style={{fontSize: '11px', color: '#888', marginBottom: '8px'}}>
        {pool.tournament_scope?.replace('_', ' ')} · {pkg?.name || 'custom'}
        {isAdmin && <span style={{color: '#C8102E', marginLeft: '6px', fontWeight: 600}}>admin</span>}
      </div>

      {/* Edit button — admin only, before tournament starts */}
      {isAdmin && (!pool.tournament_end_date || new Date() < new Date(pool.tournament_end_date)) && (
        <a href={`/pool/${pool.id}/edit`}>
          <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '12px'}}>
            ✏️ edit pool
          </button>
        </a>
      )}

      {/* Change notifications */}
      {!isAdmin && recentChanges.length > 0 && !changesDismissed && (
        <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '10px 12px', marginBottom: '12px', fontSize: '11px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
            <span style={{fontWeight: 600, color: '#888'}}>pool was updated</span>
            <button onClick={() => setChangesDismissed(true)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', padding: 0}}>×</button>
          </div>
          {recentChanges.map((c, i) => (
            <div key={i} style={{marginBottom: i < recentChanges.length - 1 ? 4 : 0}}>
              <span style={{color: '#aaa', fontSize: '10px'}}>{new Date(c.changed_at).toLocaleDateString()} · </span>
              {Object.entries(c.changes as Record<string, any>).map(([key, val]: [string, any]) => (
                <span key={key} style={{display: 'block', color: '#555', marginLeft: '8px'}}>
                  • {key.replace(/_/g, ' ')}: {val.from ?? 'none'} → {val.to ?? 'none'}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Buy-in */}
      {!isAdmin && pool.buy_in_amount && (pool.venmo_handle || pool.zelle_handle) && !leaderboard.find(m => m.user_id === user?.id)?.is_paid && (
        <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '12px', marginBottom: '16px'}}>
          <p style={{fontSize: '12px', fontWeight: 600, marginBottom: '4px'}}>💰 ${pool.buy_in_amount} buy-in due</p>
          <p style={{fontSize: '11px', color: '#888', marginBottom: '8px'}}>please pay before the first match kicks off.</p>
          {pool.payout_structure && <p style={{fontSize: '11px', color: '#666', marginBottom: '8px'}}>🏆 {pool.payout_structure}</p>}
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            {pool.venmo_handle && (
              <a href={`https://venmo.com/${pool.venmo_handle}?txn=pay&amount=${pool.buy_in_amount}&note=${encodeURIComponent(pool.name + ' buy-in')}`} target="_blank" rel="noopener noreferrer">
                <button style={{width: '100%', padding: '10px', fontSize: '13px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit'}}>
                  pay @{pool.venmo_handle} via venmo →
                </button>
              </a>
            )}
            {pool.zelle_handle && (
              <div style={{padding: '10px', background: '#111', color: 'white', fontSize: '12px', fontWeight: 600, textAlign: 'center' as const}}>
                zelle: {pool.zelle_handle}
              </div>
            )}
          </div>
        </div>
      )}
      {isAdmin && pool.buy_in_amount && (
        <div style={{background: '#f9f9f9', border: '1px solid #eee', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#555'}}>
          💰 ${pool.buy_in_amount} buy-in{pool.payout_structure ? ` · 🏆 ${pool.payout_structure}` : ''}
          <CollectionSummary />
        </div>
      )}

      {/* Leaderboard */}
      {isLive && (
        <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 0 8px',fontSize:'10px',fontWeight:700,color:'#2d7a2d',textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'#2d7a2d',display:'inline-block'}}/>
          live scoreboard · if results hold
        </div>
      )}
      <Section title="leaderboard" defaultOpen={true}>
        {/* H2H dropdown */}
        {yourLeaderboard.length > 0 && (
          <div style={{marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8}}>
            <span style={{fontSize: '11px', color: '#aaa', flexShrink: 0}}>head to head:</span>
            <select value={h2hOpponent?.user_id || ''} onChange={e => {
              const opp = leaderboard.find(m => m.user_id === e.target.value)
              setH2hOpponent(opp || null)
            }} style={{fontSize: '12px', border: '1px solid #ddd', padding: '4px 8px', fontFamily: 'inherit', flex: 1, color: '#333', background: 'white'}}>
              <option value=''>pick a player...</option>
              {leaderboard.filter(m => m.user_id !== user?.id).map(m => (
                <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* H2H result */}
        {h2hOpponent && (() => {
          const myId = user?.id
          const oppId = h2hOpponent.user_id
          const hasValue = (p: any) => p.value_wld || p.value_text || p.value_ou || p.value_yesno !== null || p.value_number !== null
          const myFixtures = new Set(allPredsCached.filter(p => p.user_id === myId && hasValue(p) && finishedFixtureIds.has(p.fixture_id)).map(p => p.fixture_id))
          const oppFixtures = new Set(allPredsCached.filter(p => p.user_id === oppId && hasValue(p) && finishedFixtureIds.has(p.fixture_id)).map(p => p.fixture_id))
          const sharedFixtures = new Set([...myFixtures].filter(id => oppFixtures.has(id)))
          const myPts = allPredsCached.filter(p => p.user_id === myId && sharedFixtures.has(p.fixture_id)).reduce((sum, p) => sum + (p.points_earned || 0), 0)
          const oppPts = allPredsCached.filter(p => p.user_id === oppId && sharedFixtures.has(p.fixture_id)).reduce((sum, p) => sum + (p.points_earned || 0), 0)
          const myName = leaderboard.find(m => m.user_id === myId)?.display_name || 'you'
          const winner = myPts > oppPts ? myName : oppPts > myPts ? h2hOpponent.display_name : null
          return (
            <div style={{marginBottom: 12, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db'}}>
              <div style={{fontSize: '10px', color: '#aaa', marginBottom: 8}}>{sharedFixtures.size} games predicted by both</div>
              <div style={{display: 'flex', gap: 8}}>
                {[{name: myName, pts: myPts, isMe: true}, {name: h2hOpponent.display_name, pts: oppPts, isMe: false}]
                  .sort((a, b) => b.pts - a.pts)
                  .map((p, i) => (
                    <div key={p.name} style={{flex: 1, padding: '8px 10px', background: 'white', border: '1px solid',
                      borderColor: i === 0 && winner ? '#2d7a2d' : '#e0e0db',
                      borderLeft: `3px solid ${p.isMe ? '#C8102E' : '#ddd'}`}}>
                      <div style={{fontSize: '11px', color: p.isMe ? '#C8102E' : '#555', fontWeight: 600, marginBottom: 2}}>{p.name}{p.isMe ? ' (you)' : ''}</div>
                      <div style={{fontSize: '20px', fontWeight: 700, color: i === 0 && winner ? '#2d7a2d' : '#888'}}>{p.pts}</div>
                    </div>
                  ))}
              </div>
              {winner && <div style={{fontSize: '11px', color: '#2d7a2d', marginTop: 8, textAlign: 'center' as const}}>{winner === myName ? 'you win 🎉' : `${winner} wins`}</div>}
              {!winner && <div style={{fontSize: '11px', color: '#aaa', marginTop: 8, textAlign: 'center' as const}}>draw</div>}
            </div>
          )
        })()}

        <div style={{fontSize: '10px', color: '#aaa', marginBottom: '8px', display: 'flex', alignItems: 'center'}}>
          <span style={{flex: 1, minWidth: 0, textAlign: 'left' as const}}>player</span>
          <div style={{display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0}}>
            {pool.buy_in_amount && <span style={{width: 68, textAlign: 'center' as const, flexShrink: 0}}>paid</span>}
            <span style={{width: 40, textAlign: 'center' as const, flexShrink: 0}}>pts</span>
            {pool.deadline_type === 'before_tournament' && <span style={{width: 40, textAlign: 'center' as const, flexShrink: 0}}>max possible</span>}
          </div>
        </div>
        {leaderboard.map((member, i) => (
          <div key={member.id || member.user_id} style={{
            display: 'flex', alignItems: 'center',
            padding: '7px 8px', marginBottom: '1px',
            background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
            borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
          }}>
            <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, textAlign: 'left' as const}}>
              {i + 1}. {member.display_name}{member.is_ghost ? <span style={{fontSize: '10px', color: '#bbb', marginLeft: 4}}>ghost</span> : ''}
            </span>
            <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
              {isAdmin && member.is_ghost && (
                <button onClick={async () => {
                  if (!confirm(`Delete ${member.display_name}?`)) return
                  const supabase = (await import('@/lib/supabase/client')).createClient()
                  await supabase.from('predictions_v2').delete().eq('pool_id', pool.id).eq('user_id', member.user_id)
                  await supabase.from('ghost_entries').delete().eq('id', member.user_id)
                  setLeaderboard(prev => prev.filter(m => m.user_id !== member.user_id))
                }} style={{fontSize: '11px', color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit'}}>
                  delete
                </button>
              )}
              {pool.buy_in_amount && (
                <div style={{width: 68, display: 'flex', justifyContent: 'center', flexShrink: 0}}>
                  <PaidPill member={member} />
                </div>
              )}
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', width: 40, textAlign: 'center' as const, flexShrink: 0}}>
                {member.points}
              </span>
              {pool.deadline_type === 'before_tournament' && (
                <span style={{fontSize: '11px', color: '#bbb', width: 40, textAlign: 'center' as const, flexShrink: 0}}>
                  {member.maxPossible != null ? member.maxPossible : ''}
                </span>
              )}
            </div>
          </div>
        ))}
      </Section>

      {yourLeaderboard.length > 0 && (
        <Section title="your leaderboard" defaultOpen={false}>
          <div style={{fontSize: '11px', color: '#aaa', marginBottom: '4px'}}>Based only on the games you predicted.</div>
          <div style={{fontSize: '11px', color: '#aaa', marginBottom: '10px'}}>You've predicted {yourLeaderboardFixtureCount} out of {finishedFixtureCount} games.</div>
          {yourLeaderboard.map((member, i) => (
            <div key={member.id || member.user_id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', marginBottom: '1px', background: member.user_id === user?.id ? '#fff5f5' : 'transparent', borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`}}>
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1}}>{i + 1}. {member.display_name}</span>
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', minWidth: 24, textAlign: 'right' as const}}>{member.points}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Scoring */}
      <Section title="scoring" defaultOpen={!isMobile}>
        {pool.deadline_type === 'before_tournament' && pool.sport !== 'mma' ? (
          <div style={{fontSize: '12px', color: '#555', lineHeight: 1.9}}>
            {(() => {
              const bsr = bracketScoringRules
              const fmt = bsr?.group_format || 'standings'
              return (<>
                <div style={{fontWeight: 600, marginBottom: '4px', color: '#111'}}>
                  group stage: {fmt === 'standings' ? 'pick standings' : fmt === 'wld' ? 'win/draw/loss' : 'exact score'}
                </div>
                {fmt === 'standings' && (
                  <div style={{color: '#888'}}>
                    1st: {bsr?.standings_first ?? 3}pts · 2nd: {bsr?.standings_second ?? 2}pts · 3rd qualifier: {bsr?.standings_third ?? 1}pt
                  </div>
                )}
                {fmt === 'wld' && (
                  <div style={{color: '#888'}}>correct result: {bsr?.wld_pts ?? 1}pt per game</div>
                )}
                {fmt === 'exact' && (
                  <div style={{color: '#888'}}>3pts result · 2pts per team score · 3pt bonus (10pts max)</div>
                )}
                <div style={{fontWeight: 600, marginTop: '8px', marginBottom: '4px', color: '#111'}}>knockout rounds</div>
                <div style={{color: '#888'}}>
                  R32: {bsr?.r32_pts ?? 1}pt · R16: {bsr?.r16_pts ?? 2}pts · QF: {bsr?.qf_pts ?? 4}pts · SF: {bsr?.sf_pts ?? 6}pts
                </div>
                <div style={{fontWeight: 600, marginTop: '8px', marginBottom: '4px', color: '#111'}}>final</div>
                <div style={{color: '#888'}}>
                  {bsr?.final_pts ?? 12}pts per finalist · 2pts per correct team goal · +3pt exact bonus · +10pts correct winner
                </div>
              </>)
            })()}
          </div>
        ) : pool.package_id === 'CUSTOM' ? (
          <div>
            {poolRules.map((rule: any) => {
              const isExact = rule.category_id === 'soccer_exact_score' || rule.category_id === 'soccer_ht_exact_score'
              const isCardPts = rule.category_id === 'soccer_card_points_ou' || rule.category_id === 'soccer_cards_home_away' || rule.category_id === 'soccer_cards_ht'
              return (
                <div key={rule.category_id}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid #f5f5f5'}}>
                    <span style={{fontSize: '12px', color: '#555'}}>{rule.ruleset_categories?.name || rule.category_id}</span>
                    <span style={{fontSize: '12px', color: '#111', fontWeight: 600, marginLeft: '8px', flexShrink: 0}}>
                      {isExact ? `${rule.points}pt/team${rule.bonus_points > 0 ? ` +${rule.bonus_points}` : ''}` : `${rule.points} pt${rule.points !== 1 ? 's' : ''}`}
                      {rule.category_id === 'soccer_team_to_advance' && <span style={{fontSize: '10px', color: '#aaa', fontWeight: 400}}> +2/round</span>}
                    </span>
                  </div>
                  {isCardPts && (
                    <div style={{fontSize: '10px', color: '#aaa', padding: '3px 0 5px', lineHeight: 1.6}}>
                      🟨 yellow = 10pts · 🟥 straight red = 25pts · 2nd yellow = 35pts
                    </div>
                  )}
                </div>
              )
            })}
            {pool.sport === 'mma' && poolRules.length >= 3 && (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f5f5f5'}}>
                <span style={{fontSize: '12px', color: '#555'}}>🎯 perfect fight bonus</span>
                <span style={{fontSize: '12px', color: '#C8102E', fontWeight: 600}}>+4 pts</span>
              </div>
            )}
            <div style={{fontSize: '11px', color: '#aaa', marginTop: '8px'}}>
              deadline: before kickoff
            </div>
          </div>
        ) : (
          <div style={{fontSize: '12px', color: '#555', lineHeight: 1.8}}>
            {pkg?.scoring.correct_result ? `correct result: ${pkg.scoring.correct_result} pt` : ''}
            {pkg?.scoring.correct_first_scorer ? <><br />first scorer: {pkg.scoring.correct_first_scorer} pts</> : ''}
            {pkg?.scoring.correct_exact_score ? <><br />exact score: {pkg.scoring.correct_exact_score} pts</> : ''}
            <br />deadline: {pool.deadline_type === 'before_each_game' ? 'before kickoff' : 'before tournament'}
          </div>
        )}
      </Section>

      {/* Invite — admins always, members too if the pool allows it */}
      {(isAdmin || pool.allow_member_invites) && (
        <Section title="invite" defaultOpen={!isMobile}>
          <InvitePanel poolName={pool.name} inviteUrl={inviteUrl} buyInAmount={pool.buy_in_amount} inviterName={user?.user_metadata?.display_name || user?.email?.split('@')[0] || null} />
        </Section>
      )}

      {/* Reminder */}
      <Section title="remind me" defaultOpen={!isMobile}>
        <ReminderButton poolId={pool.id} userId={user.id} userEmail={user.email || ''} />
      </Section>

      {/* Delete */}
      {isAdmin && (
        <Section title="danger zone" defaultOpen={false}>
          {pool.tournament_end_date && new Date(pool.tournament_end_date) <= new Date() && (
            <ArchivePool poolId={pool.id} userId={user.id} archived={!!pool.archived} />
          )}
          <div style={{marginTop: 12}}>
            <DeletePool poolId={pool.id} />
          </div>
        </Section>
      )}
    </div>
  )

  return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px'}}>

      {/* Nav */}
      <div style={{background: '#111', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50}}>
        <a href="/dashboard" style={{fontWeight: 700, fontSize: '13px', color: 'white', textDecoration: 'none'}}>pool'em</a>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <span style={{fontSize: '11px', color: '#888'}}>
            {user?.user_metadata?.display_name || user?.email?.split('@')[0]} ·{' '}
            <button type="button" onClick={async () => { const s = createClient(); await s.auth.signOut(); window.location.href = '/' }}
              style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit'}}>
              out
            </button>
          </span>
        </div>
      </div>

      {isMobile ? (
        // ── Mobile layout — bottom tab bar ───────────────────────────────
        <div style={{minHeight: 'calc(100vh - 41px)', display: 'flex', flexDirection: 'column' as const, paddingBottom: 60}}>

          {/* Always-visible summary/notices — mirrors desktop sidebar, shown regardless of active tab */}
          <div style={{padding: '12px 16px 0'}}>
            {isAdmin && (!pool.tournament_end_date || new Date() < new Date(pool.tournament_end_date)) && (
              <a href={`/pool/${pool.id}/edit`}>
                <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '12px'}}>
                  ✏️ edit pool
                </button>
              </a>
            )}
            {isAdmin && pool.buy_in_amount && (
              <div style={{background: '#f9f9f9', border: '1px solid #eee', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: '#555'}}>
                💰 ${pool.buy_in_amount} buy-in{pool.payout_structure ? ` · 🏆 ${pool.payout_structure}` : ''}
                <CollectionSummary />
              </div>
            )}
            {!isAdmin && recentChanges.length > 0 && !changesDismissed && (
              <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '10px 12px', marginBottom: '12px', fontSize: '11px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                  <span style={{fontWeight: 600, color: '#888'}}>pool was updated</span>
                  <button onClick={() => setChangesDismissed(true)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', padding: 0}}>×</button>
                </div>
                {recentChanges.map((c, i) => (
                  <div key={i} style={{marginBottom: i < recentChanges.length - 1 ? 4 : 0}}>
                    <span style={{color: '#aaa', fontSize: '10px'}}>{new Date(c.changed_at).toLocaleDateString()} · </span>
                    {Object.entries(c.changes as Record<string, any>).map(([key, val]: [string, any]) => (
                      <span key={key} style={{display: 'block', color: '#555', marginLeft: '8px'}}>
                        • {key.replace(/_/g, ' ')}: {val.from ?? 'none'} → {val.to ?? 'none'}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel content */}
          <div ref={mobilePanelRef} style={{flex: 1, overflowY: 'auto' as const}}>

            {/* Picks panel */}
            {mobilePanel === 'picks' && (
              <div style={{padding: '16px'}}>
                {!isAdmin && pool.buy_in_amount && (pool.venmo_handle || pool.zelle_handle) && !leaderboard.find(m => m.user_id === user?.id)?.is_paid && (
                  <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '12px', marginBottom: '16px'}}>
                    <p style={{fontSize: '13px', fontWeight: 600, marginBottom: '4px'}}>💰 ${pool.buy_in_amount} buy-in due</p>
                    <p style={{fontSize: '11px', color: '#888', marginBottom: '8px'}}>please pay before the first match kicks off.</p>
                    {pool.payout_structure && <p style={{fontSize: '11px', color: '#666', marginBottom: '8px'}}>🏆 {pool.payout_structure}</p>}
                    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                      {pool.venmo_handle && (
                        <a href={`https://venmo.com/${pool.venmo_handle}?txn=pay&amount=${pool.buy_in_amount}&note=${encodeURIComponent(pool.name + ' buy-in')}`} target="_blank" rel="noopener noreferrer">
                          <button type="button" style={{width: '100%', padding: '10px', fontSize: '13px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit'}}>
                            pay @{pool.venmo_handle} via venmo →
                          </button>
                        </a>
                      )}
                      {pool.zelle_handle && (
                        <div style={{padding: '10px', background: '#111', color: 'white', fontSize: '12px', fontWeight: 600, textAlign: 'center' as const}}>
                          zelle: {pool.zelle_handle}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {user && pool.deadline_type === 'before_tournament' && pool.sport !== 'mma' ? (
                  <>
                    <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={new Date() >= new Date('2026-06-11T19:00:00Z')} isAdmin={isAdmin} tournamentId={pool.tournament_id} />
                    {new Date() >= new Date('2026-06-11T19:00:00Z') && (
                      <div style={{ marginTop: 32 }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                        <BracketViewer poolId={pool.id} />
                      </div>
                    )}
                  </>
                ) : user && (
                  pool.sport === 'f1'
                    ? <F1SessionsList poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} />
                    : pool.sport === 'mma'
                    ? <MMAFightCard poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} />
                    : <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} hideControls={true} externalSortMode={mobileSortMode} externalViewMode={mobileViewMode} isAdmin={isAdmin} />
                )}
              </div>
            )}

            {/* Leaderboard panel */}
            {mobilePanel === 'leaderboard' && (
              <div style={{padding: '16px', background: 'white', minHeight: '100%'}}>
                <div style={{fontWeight: 700, fontSize: '15px', marginBottom: 12}}>{pool.name}</div>
                {isLive && (
                  <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 0 8px',fontSize:'10px',fontWeight:700,color:'#2d7a2d',textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#2d7a2d',display:'inline-block'}}/>
                    live scoreboard · if results hold
                  </div>
                )}
                {/* H2H dropdown */}
                {yourLeaderboard.length > 0 && (
                  <div style={{marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8}}>
                    <span style={{fontSize: '11px', color: '#aaa', flexShrink: 0}}>head to head:</span>
                    <select value={h2hOpponent?.user_id || ''} onChange={e => {
                      const opp = leaderboard.find(m => m.user_id === e.target.value)
                      setH2hOpponent(opp || null)
                    }} style={{fontSize: '12px', border: '1px solid #ddd', padding: '4px 8px', fontFamily: 'inherit', flex: 1, color: '#333', background: 'white'}}>
                      <option value=''>pick a player...</option>
                      {leaderboard.filter(m => m.user_id !== user?.id).map(m => (
                        <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* H2H result */}
                {h2hOpponent && (() => {
                  const myId = user?.id
                  const oppId = h2hOpponent.user_id
                  const hasValue = (p: any) => p.value_wld || p.value_text || p.value_ou || p.value_yesno !== null || p.value_number !== null
                  const myFixtures = new Set(allPredsCached.filter(p => p.user_id === myId && hasValue(p) && finishedFixtureIds.has(p.fixture_id)).map(p => p.fixture_id))
                  const oppFixtures = new Set(allPredsCached.filter(p => p.user_id === oppId && hasValue(p) && finishedFixtureIds.has(p.fixture_id)).map(p => p.fixture_id))
                  const sharedFixtures = new Set([...myFixtures].filter(id => oppFixtures.has(id)))
                  const myPts = allPredsCached.filter(p => p.user_id === myId && sharedFixtures.has(p.fixture_id)).reduce((sum, p) => sum + (p.points_earned || 0), 0)
                  const oppPts = allPredsCached.filter(p => p.user_id === oppId && sharedFixtures.has(p.fixture_id)).reduce((sum, p) => sum + (p.points_earned || 0), 0)
                  const myName = leaderboard.find(m => m.user_id === myId)?.display_name || 'you'
                  const winner = myPts > oppPts ? myName : oppPts > myPts ? h2hOpponent.display_name : null
                  return (
                    <div style={{marginBottom: 12, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db'}}>
                      <div style={{fontSize: '10px', color: '#aaa', marginBottom: 8}}>{sharedFixtures.size} games predicted by both</div>
                      <div style={{display: 'flex', gap: 8}}>
                        {[{name: myName, pts: myPts, isMe: true}, {name: h2hOpponent.display_name, pts: oppPts, isMe: false}]
                          .sort((a, b) => b.pts - a.pts)
                          .map((p, i) => (
                            <div key={p.name} style={{flex: 1, padding: '8px 10px', background: 'white', border: '1px solid',
                              borderColor: i === 0 && winner ? '#2d7a2d' : '#e0e0db',
                              borderLeft: `3px solid ${p.isMe ? '#C8102E' : '#ddd'}`}}>
                              <div style={{fontSize: '11px', color: p.isMe ? '#C8102E' : '#555', fontWeight: 600, marginBottom: 2}}>{p.name}{p.isMe ? ' (you)' : ''}</div>
                              <div style={{fontSize: '20px', fontWeight: 700, color: i === 0 && winner ? '#2d7a2d' : '#888'}}>{p.pts}</div>
                            </div>
                          ))}
                      </div>
                      {winner && <div style={{fontSize: '11px', color: '#2d7a2d', marginTop: 8, textAlign: 'center' as const}}>{winner === myName ? 'you win 🎉' : `${winner} wins`}</div>}
                      {!winner && <div style={{fontSize: '11px', color: '#aaa', marginTop: 8, textAlign: 'center' as const}}>draw</div>}
                    </div>
                  )
                })()}
                {/* Leaderboard table */}
                <div style={{fontSize: '10px', color: '#aaa', marginBottom: '8px', display: 'flex', alignItems: 'center'}}>
                  <span style={{flex: 1}}>player</span>
                  <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                    {pool.buy_in_amount && <span style={{width: 68, textAlign: 'center' as const}}>paid</span>}
                    <span style={{width: 40, textAlign: 'center' as const}}>pts</span>
                    {pool.deadline_type === 'before_tournament' && <span style={{width: 40, textAlign: 'center' as const}}>max</span>}
                  </div>
                </div>
                {leaderboard.map((member, i) => (
                  <div key={member.id || member.user_id} style={{
                    display: 'flex', alignItems: 'center',
                    padding: '7px 8px', marginBottom: '1px',
                    background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
                    borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
                  }}>
                    <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const}}>
                      {i + 1}. {member.display_name}{member.is_ghost ? <span style={{fontSize: '10px', color: '#bbb', marginLeft: 4}}>ghost</span> : ''}
                    </span>
                    <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                      {isAdmin && member.is_ghost && (
                        <button onClick={async () => {
                          if (!confirm(`Delete ${member.display_name}?`)) return
                          const supabase = (await import('@/lib/supabase/client')).createClient()
                          await supabase.from('predictions_v2').delete().eq('pool_id', pool.id).eq('user_id', member.user_id)
                          await supabase.from('ghost_entries').delete().eq('id', member.user_id)
                          setLeaderboard(prev => prev.filter(m => m.user_id !== member.user_id))
                        }} style={{fontSize: '11px', color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit'}}>
                          delete
                        </button>
                      )}
                      {pool.buy_in_amount && (
                        <div style={{width: 68, display: 'flex', justifyContent: 'center', flexShrink: 0}}>
                          <PaidPill member={member} />
                        </div>
                      )}
                      <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', width: 40, textAlign: 'center' as const}}>
                        {member.points}
                      </span>
                      {pool.deadline_type === 'before_tournament' && (
                        <span style={{fontSize: '11px', color: '#bbb', width: 40, textAlign: 'center' as const}}>
                          {member.maxPossible != null ? member.maxPossible : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Your leaderboard */}
                {yourLeaderboard.length > 0 && (
                  <div style={{marginTop: 20, borderTop: '1px solid #eee', paddingTop: 16}}>
                    <div style={{fontSize: '11px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 4}}>your leaderboard</div>
                    <div style={{fontSize: '11px', color: '#aaa', marginBottom: 10}}>Based only on the games you predicted. You've predicted {yourLeaderboardFixtureCount} out of {finishedFixtureCount} games.</div>
                    {yourLeaderboard.map((member, i) => (
                      <div key={member.id || member.user_id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', marginBottom: '1px', background: member.user_id === user?.id ? '#fff5f5' : 'transparent', borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`}}>
                        <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1}}>{i + 1}. {member.display_name}</span>
                        <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888'}}>{member.points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mobilePanel === 'chat' && user && (
              <div style={{height: 'calc(100vh - 101px)'}}>
                <ShitChat poolId={pool.id} userId={user.id} displayName={user.user_metadata?.display_name || user.email?.split('@')[0] || 'anon'} />
              </div>
            )}

            {/* Settings panel */}
            {mobilePanel === 'settings' && (
              <div style={{padding: '16px', background: 'white', minHeight: '100%'}}>
                <div style={{fontSize: '13px', fontWeight: 700, marginBottom: 16}}>settings</div>

                {/* View options — only for soccer */}
                {pool.sport !== 'mma' && pool.sport !== 'f1' && (
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>sort by</div>
                    <div style={{display: 'flex', border: '1px solid #ddd', overflow: 'hidden', marginBottom: 12}}>
                      {(['date', 'group', 'round'] as const).map((mode, i) => (
                        <button key={mode} type="button" onClick={() => setMobileSortMode(mode)}
                          style={{flex: 1, padding: '10px 8px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: mobileSortMode === mode ? '#111' : 'white', color: mobileSortMode === mode ? 'white' : '#888', minHeight: 44}}>
                          {mode}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>display</div>
                    <div style={{display: 'flex', border: '1px solid #ddd', overflow: 'hidden'}}>
                      {(['pages', 'list'] as const).map((mode, i) => (
                        <button key={mode} type="button" onClick={() => setMobileViewMode(mode)}
                          style={{flex: 1, padding: '10px 8px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: mobileViewMode === mode ? '#111' : 'white', color: mobileViewMode === mode ? 'white' : '#888', minHeight: 44}}>
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invite — admins always, members too if the pool allows it */}
                {(isAdmin || pool.allow_member_invites) && (
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>invite</div>
                    <div style={{display: 'flex', gap: 8}}>
                      <input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pool/join/${pool.invite_code}`}
                        style={{flex: 1, border: '1px solid #e0e0db', padding: '8px', fontSize: '11px', fontFamily: 'inherit', background: '#f7f7f5', color: '#555'}} />
                      <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/pool/join/${pool.invite_code}`)}
                        style={{padding: '8px 12px', background: '#111', color: 'white', border: 'none', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'}}>
                        copy
                      </button>
                    </div>
                  </div>
                )}

                {/* Scoring */}
                <div style={{marginBottom: 20}}>
                  <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>scoring</div>
                  {poolRules.map((rule: any) => {
                    const isExact = rule.category_id === 'soccer_exact_score' || rule.category_id === 'soccer_ht_exact_score'
                    return (
                      <div key={rule.category_id} style={{display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5'}}>
                        <span style={{fontSize: '12px', color: '#555'}}>{rule.ruleset_categories?.name || rule.category_id}</span>
                        <span style={{fontSize: '12px', fontWeight: 600}}>
                          {isExact ? `${rule.points}pt/team` : `${rule.points} pts`}
                          {rule.category_id === 'soccer_team_to_advance' && <span style={{fontSize: '10px', color: '#aaa', fontWeight: 400}}> +2/round</span>}
                        </span>
                      </div>
                    )
                  })}
                  {pool.sport === 'mma' && poolRules.length >= 3 && (
                    <div style={{display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5'}}>
                      <span style={{fontSize: '12px', color: '#555'}}>🎯 perfect fight bonus</span>
                      <span style={{fontSize: '12px', fontWeight: 600, color: '#C8102E'}}>+4 pts</span>
                    </div>
                  )}
                </div>

                {/* Reminders */}
                {user && (
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>reminders</div>
                    <ReminderButton poolId={pool.id} userId={user.id} userEmail={user.email || ''} />
                  </div>
                )}

                {/* Danger zone — admin only */}
                {isAdmin && (
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#C8102E', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>danger zone</div>
                    {pool.tournament_end_date && new Date(pool.tournament_end_date) <= new Date() && (
                      <div style={{marginBottom: 8}}>
                        <ArchivePool poolId={pool.id} userId={user.id} archived={!!pool.archived} />
                      </div>
                    )}
                    <DeletePool poolId={pool.id} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom tab bar */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
            background: 'white', borderTop: '1px solid #e0e0db',
            display: 'flex', zIndex: 100,
          }}>
            {([
              { id: 'picks', label: 'picks', symbol: '📋' },
              { id: 'leaderboard', label: 'leaderboard', symbol: '🏆' },
              { id: 'chat', label: 'shit chat', symbol: '💬' },
              { id: 'settings', label: 'settings', symbol: '⚙️' },
            ] as const).map(tab => (
              <button key={tab.id} type="button" onClick={() => switchMobilePanel(tab.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
                  gap: 2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  borderTop: mobilePanel === tab.id ? '2px solid #C8102E' : '2px solid transparent',
                  color: mobilePanel === tab.id ? '#C8102E' : '#aaa',
                }}>
                <span style={{fontSize: 18}} aria-hidden="true">{tab.symbol}</span>
                <span style={{fontSize: 10, fontWeight: mobilePanel === tab.id ? 600 : 400}}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        // ── Desktop layout — 3 columns ───────────────────────────────────
        <div style={{display: 'grid', gridTemplateColumns: `280px 1fr ${chatWidth}px`, minHeight: 'calc(100vh - 41px)'}}>
          {/* Sidebar */}
          <div style={{background: 'white', borderRight: '1px solid #e0e0db', overflowY: 'auto'}}>
            {sidebarContent}
          </div>
          {/* Predictions */}
          <div style={{padding: '40px 24px', overflowY: 'auto', display: 'flex', justifyContent: 'center'}}>
            <div style={{width: '100%', maxWidth: 560}}>
              {user && pool.deadline_type === 'before_tournament' && pool.sport !== 'mma' ? (
                <>
                  <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={new Date() >= new Date('2026-06-11T19:00:00Z')} isAdmin={isAdmin} tournamentId={pool.tournament_id} />
                  {new Date() >= new Date('2026-06-11T19:00:00Z') && (
                    <div style={{ marginTop: 32 }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                      <BracketViewer poolId={pool.id} />
                    </div>
                  )}
                </>
              ) : user && (
                pool.sport === 'f1'
                  ? <F1SessionsList poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} />
                  : pool.sport === 'mma'
                  ? <MMAFightCard poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} />
                  : <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} isAdmin={isAdmin} />
              )}
            </div>
          </div>
          {/* Chat */}
          {user && (
            <div style={{borderLeft: '1px solid #e0e0db', background: 'white', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 41px)', position: 'sticky', top: 41}}>
              <div
                onMouseDown={() => setIsResizingChat(true)}
                style={{
                  position: 'absolute', left: -3, top: 0, bottom: 0, width: 6,
                  cursor: 'col-resize', zIndex: 10,
                  background: isResizingChat ? 'rgba(200,16,46,0.3)' : 'transparent',
                }}
              />
              <ShitChat poolId={pool.id} userId={user.id} displayName={user.user_metadata?.display_name || user.email?.split('@')[0] || 'anon'} />
            </div>
          )}
        </div>
      )}
      <div style={{textAlign: 'center', padding: '12px', fontSize: '11px', color: '#bbb', borderTop: '1px solid #eee', background: 'white'}}>
        questions or issues? <a href="mailto:fred@cardinalreds.com" style={{color: '#aaa', textDecoration: 'none'}}>fred@cardinalreds.com</a>
      </div>
    </div>
  )
}
