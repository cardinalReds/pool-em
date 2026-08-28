'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'
import { RULE_PACKAGES } from '@/types'
import FixturesList from '@/components/FixturesList'
import F1SessionsList from '@/components/F1SessionsList'
import MMAFightCard from '@/components/MMAFightCard'
import NFLGamesList from '@/components/NFLGamesList'
import ReminderButton from '@/components/ReminderButton'
import InvitePanel from '@/components/InvitePanel'
import BuyInInvitePanel from '@/components/BuyInInvitePanel'
import InviteFromContacts from '@/components/InviteFromContacts'
import { DEFAULT_BRACKET_SCORING } from '@/lib/bracketEngine'
import { syncMemberToPublicPools } from '@/lib/publicPoolSync'
import BracketPicker from '@/components/BracketPicker'
import BracketViewer from '@/components/BracketViewer'
import ShitChat from '@/components/ShitChat'
import SeasonPropsTicket from '@/components/SeasonPropsTicket'
import WeeklyPot from '@/components/WeeklyPot'
import WeeklyLeaderboard from '@/components/WeeklyLeaderboard'

function getSessionFromCookie() {
  try {
    const cookieName = 'sb-bsrvqpggsxyrxatdtnqf-auth-token'
    const match = document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch { return null }
}

function ArchivePool({ poolId, archived }: { poolId: string; archived: boolean }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handle() {
    setStatus('loading')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/pool/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ poolId, archived: !archived }),
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
const POOL_CHILD_TABLES: (keyof Database['public']['Tables'])[] = [
  'predictions', 'predictions_v2', 'ghost_entries', 'pool_rules', 'season_prop_rules',
  'bracket_scoring_rules', 'bracket_picks', 'pool_changes', 'messages', 'reminders',
  'pool_invitation_inviters', 'pool_invitations', 'pool_members',
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
      const { error: childError } = await supabase.from(table as any).delete().eq('pool_id', poolId)
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
  const [leaderboardScope, setLeaderboardScope] = useState<'all' | 'yours' | 'rival'>('all')
  const [rival, setRival] = useState<any>(null)
  const [allPredsCached, setAllPredsCached] = useState<any[]>([])
  const [finishedFixtureIds, setFinishedFixtureIds] = useState<Set<number>>(new Set())
  const [totalFixtureCount, setTotalFixtureCount] = useState(0)
  const [finishedFixtureCount, setFinishedFixtureCount] = useState(0)
  const [roundByFixtureId, setRoundByFixtureId] = useState<Record<number, string>>({})
  const [roundsInOrder, setRoundsInOrder] = useState<string[]>([])
  const [selectedRound, setSelectedRound] = useState<string>('all')
  const [poolRules, setPoolRules] = useState<any[]>([])
  const [bracketScoringRules, setBracketScoringRules] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'picks' | 'leaderboard' | 'chat' | 'settings'>('picks')
  // Lives up here rather than inside ScopedLeaderboard — that's a function defined fresh
  // on every PoolPage render, so a useState declared inside it gets a new component
  // identity (and its state silently reset) on every re-render; hooks in PoolPage's own
  // body don't have that problem, and ScopedLeaderboard already closes over this scope.
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false)
  const mobilePanelRef = useRef<HTMLDivElement>(null)

  function switchMobilePanel(panel: 'picks' | 'leaderboard' | 'chat' | 'settings') {
    setMobilePanel(panel)
    setTimeout(() => mobilePanelRef.current?.scrollTo({ top: 0 }), 0)
  }
  const [mobileSortMode, setMobileSortMode] = useState<'date' | 'group' | 'round'>('group')
  const [seasonPropsLocked, setSeasonPropsLocked] = useState(false)
  const [bracketLockTime, setBracketLockTime] = useState<Date | null>(null)
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
    let cancelled = false
    let fixturesChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

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

      // Explicit column list, not select('*') — this page is visible to every pool member
      // (not just the admin), so bank_account_number/bank_sort_code must never be fetched
      // here; RLS allows the read (its policy is intentionally open for invite-code
      // browsing), but RLS is row-level, not column-level, so over-fetching would still
      // leak those fields to the browser.
      const { data: pool } = await supabase.from('pools').select('admin_fee_percent, admin_id, allow_member_invites, archived, buy_in_amount, cfb_best10_admin_override, cfb_game_mode, created_at, deadline_type, id, invite_code, is_active, is_public, name, package_id, payout_structure, pick_mode, pl_best_weeks, pl_best5_admin_override, pl_game_mode, prize_season, prize_weekly, season_buy_in, season_props_enabled, sport, tournament_id, tournament_scope, updated_at, venmo_handle, weekly_buy_in, weekly_payout_structure, zelle_handle').eq('id', params.id).single()
      if (!pool) { setNotFound(true); setLoading(false); return }
      // Effect already cleaned up (e.g. React Strict Mode's mount-unmount-remount in dev,
      // or a fast params.id change) — bail before subscribing so we never leak a channel
      // the cleanup below has already run past.
      if (cancelled) return

      // Subscribe to fixture status changes for the live indicator, scoped to this
      // pool's own tournament — set up here (rather than synchronously above) because
      // the filter needs pool.tournament_id, which we've only just fetched.
      if (pool.tournament_id) {
        fixturesChannel = supabase
          .channel('pool-live-status')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `tournament_id=eq.${pool.tournament_id}` }, (payload: any) => {
            if (payload.new.status === 'live') setIsLive(true)
            else if (payload.new.status === 'finished' || payload.new.status === 'NS') {
              // Re-check if any games still live
              supabase.from('fixtures').select('id').eq('tournament_id', pool.tournament_id).eq('status', 'live').limit(1)
                .then(({ data }) => setIsLive((data?.length ?? 0) > 0))
            }
          })
          .subscribe()
      }

      // Fetch tournament end_date to know if competition is over
      if (pool.tournament_id) {
        const { data: tournament } = await supabase.from('tournaments').select('end_date').eq('id', pool.tournament_id).maybeSingle()
        if (tournament?.end_date) (pool as any).tournament_end_date = tournament.end_date
      }

      // Bracket-style pools lock at the tournament's first kickoff, not a fixed date —
      // derive it from fixtures the same way SeasonPropsTicket derives matchday-1 lock time.
      if (pool.deadline_type === 'before_tournament' && pool.sport !== 'mma' && pool.tournament_id) {
        const { data: firstFixture } = await supabase.from('fixtures').select('date').eq('tournament_id', pool.tournament_id).order('date', { ascending: true }).limit(1).maybeSingle()
        if (firstFixture?.date) setBracketLockTime(new Date(firstFixture.date))
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
        if (healedMembership) {
          await syncMemberToPublicPools(supabase, pool.id, currentUser.id, currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Admin')
        }
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
          const scores = b.bracket_scores as { total?: number; max_possible?: number } | null
          if (scores?.total) pointsMap[b.user_id] = scores.total
          if (scores?.max_possible != null) maxPossibleMap[b.user_id] = scores.max_possible
        })
      } else if (pool.package_id === 'CUSTOM') {
        const { data: scores } = await supabase.from('predictions_v2').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      } else {
        const { data: scores } = await supabase.from('predictions').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      }
      // Include ghost entries in leaderboard
      const { data: ghosts } = await supabase.from('ghost_entries').select('id, name, is_paid').eq('pool_id', pool.id)
      const ghostMembers = (ghosts || []).map(g => ({ id: g.id, user_id: g.id, display_name: g.name, is_paid: !!g.is_paid, is_ghost: true }))
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

        // Counts games that have started scoring — finished OR live, not just finished.
        // Live games already contribute to `points` below (points_earned updates in
        // real time as a match plays out), so excluding them here undercounted the
        // denominator relative to the score it was sitting next to.
        // f1_sessions has no `round` column — the natural "round" for F1 is the Grand Prix
        // weekend itself (competition_name), since a weekend groups several sessions
        // (practice/qualifying/sprint/race) the way a matchday groups several fixtures.
        const { data: finishedFixtures } = isF1
          ? await supabase.from(gameTable).select('id, competition_name, date').eq('tournament_id', pool.tournament_id).eq('scored', true)
          : await supabase.from(gameTable).select('id, round, date').eq('tournament_id', pool.tournament_id).in('status', ['FT', 'live'])
        const finishedIds = new Set((finishedFixtures || []).map((f: any) => f.id))
        setFinishedFixtureIds(finishedIds)
        setFinishedFixtureCount(finishedFixtures?.length || 0)

        // Round/week breakdown — only meaningful for pools with a repeating per-game
        // cadence (PL/NFL matchdays, F1 GP weekends), not bracket tournaments (one long
        // progression) or MMA (single card). Self-determines relevance below via
        // roundsInOrder.length > 1 rather than checking sport/deadline_type directly.
        const roundMap: Record<number, string> = {}
        const earliestByRound: Record<string, number> = {}
        ;(finishedFixtures || []).forEach((f: any) => {
          const roundLabel = isF1 ? f.competition_name : f.round
          if (!roundLabel) return
          roundMap[f.id] = roundLabel
          const t = new Date(f.date).getTime()
          if (!(roundLabel in earliestByRound) || t < earliestByRound[roundLabel]) earliestByRound[roundLabel] = t
        })
        setRoundByFixtureId(roundMap)
        setRoundsInOrder(Object.keys(earliestByRound).sort((a, b) => earliestByRound[b] - earliestByRound[a]))
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

    // Ghost entries are added from the picks tab (a different component) — subscribe
    // so the leaderboard picks up new/removed entries without a manual page refresh.
    const supabase = createClient()
    const ghostChannel = supabase
      .channel('pool-ghost-entries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${params.id}` }, (payload) => {
        setLeaderboard(prev => prev.some(m => m.user_id === payload.new.id) ? prev : [
          ...prev,
          { id: payload.new.id, user_id: payload.new.id, display_name: payload.new.name, is_paid: false, is_ghost: true, points: 0 },
        ].sort((a, b) => b.points - a.points))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ghost_entries', filter: `pool_id=eq.${params.id}` }, (payload) => {
        setLeaderboard(prev => prev.filter(m => m.user_id !== payload.old.id))
      })
      .subscribe()

    // Leaderboard points otherwise only ever load once — nothing was watching
    // predictions_v2 itself, so a fixture's points_earned changing after the fact (a
    // cron finishing scoring, or a ghost pick edited post-lock/post-finish — see
    // FixturesList.tsx) never showed up here until a manual page reload. Re-pulls the
    // same pointsMap/leaderboard/allPredsCached computation `load()` does above, scoped
    // down to just that recomputation rather than the whole page load.
    let predictionsChannel: ReturnType<typeof supabase.channel> | null = null
    async function refreshPoints() {
      const { data: freshPool } = await supabase.from('pools').select('id, tournament_id, deadline_type, package_id, sport').eq('id', params.id).maybeSingle()
      if (!freshPool) return

      const pointsMap: Record<string, number> = {}
      const maxPossibleMap: Record<string, number> = {}
      if (freshPool.deadline_type === 'before_tournament' && freshPool.sport !== 'mma') {
        const { data: bracketScores } = await supabase.from('bracket_picks').select('user_id, bracket_scores').eq('pool_id', freshPool.id)
        bracketScores?.forEach((b: any) => {
          const scores = b.bracket_scores as { total?: number; max_possible?: number } | null
          if (scores?.total) pointsMap[b.user_id] = scores.total
          if (scores?.max_possible != null) maxPossibleMap[b.user_id] = scores.max_possible
        })
      } else if (freshPool.package_id === 'CUSTOM') {
        const { data: scores } = await supabase.from('predictions_v2').select('user_id, points_earned').eq('pool_id', freshPool.id)
        scores?.forEach((s: any) => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      } else {
        const { data: scores } = await supabase.from('predictions').select('user_id, points_earned').eq('pool_id', freshPool.id)
        scores?.forEach((s: any) => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      }

      const [{ data: members }, { data: ghosts }] = await Promise.all([
        supabase.from('pool_members').select('*').eq('pool_id', freshPool.id),
        supabase.from('ghost_entries').select('id, name, is_paid').eq('pool_id', freshPool.id),
      ])
      const ghostMembers = (ghosts || []).map((g: any) => ({ id: g.id, user_id: g.id, display_name: g.name, is_paid: !!g.is_paid, is_ghost: true }))
      const allMembers = [...(members || []), ...ghostMembers]
      setLeaderboard(allMembers.map((m: any) => ({ ...m, points: pointsMap[m.user_id] || 0, maxPossible: maxPossibleMap[m.user_id] })).sort((a: any, b: any) => b.points - a.points))

      if (freshPool.package_id === 'CUSTOM' && freshPool.deadline_type !== 'before_tournament') {
        const { data: allPreds } = await supabase.from('predictions_v2')
          .select('user_id, fixture_id, points_earned, value_wld, value_text, value_ou, value_yesno, value_number')
          .eq('pool_id', freshPool.id)
        setAllPredsCached(allPreds || [])
      }
    }
    // Debounced — a scoring cron updates one row per prediction on a fixture (could be
    // a dozen-plus members at once), which would otherwise fire refreshPoints() once per
    // row in a tight burst for what's really one logical event.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refreshPoints, 500)
    }
    predictionsChannel = supabase
      .channel('pool-predictions-scoring')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions_v2', filter: `pool_id=eq.${params.id}` }, scheduleRefresh)
      .subscribe()

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
      if (fixturesChannel) supabase.removeChannel(fixturesChannel)
      supabase.removeChannel(ghostChannel)
      if (predictionsChannel) supabase.removeChannel(predictionsChannel)
    }
  }, [params.id])

  async function togglePaid(member: any) {
    const supabase = createClient()
    const newValue = !member.is_paid
    if (member.is_ghost) {
      await supabase.from('ghost_entries').update({ is_paid: newValue }).eq('id', member.id)
    } else {
      await supabase.from('pool_members').update({ is_paid: newValue }).eq('id', member.id)
    }
    setLeaderboard(prev => prev.map(m => m.id === member.id && m.is_ghost === member.is_ghost ? { ...m, is_paid: newValue } : m))
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
  const canManageGhosts = !!leaderboard.find(m => m.user_id === user?.id && !m.is_ghost)?.can_manage_ghosts

  // Buy-in collection summary — how much of the pot has actually been collected so far.
  // Ghosts are excluded — same as weekly-pot credits, ghosts never have money tracked
  // against them.
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
        <button onClick={() => togglePaid(member)}
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

  // One leaderboard, two orthogonal filters: scope (which games count toward points —
  // all of them, just yours, or just the ones you and a rival both picked) and round
  // (a time filter, composes freely with scope). Replaces what used to be four separate
  // tabs that all rendered the same list of names with different, unexplained totals.
  function ScopedLeaderboard() {
    const hasScopedData = allPredsCached.length > 0
    const myId = user?.id
    const hasValue = (p: any) => p.value_wld || p.value_text || p.value_ou || p.value_yesno !== null || p.value_number !== null

    // The countable unit differs by sport: F1 predictions are made per session
    // (practice/qualifying/sprint/race), but fans think in race weekends, so the
    // figure shown needs to dedupe sessions down to their round (competition_name)
    // rather than counting raw session rows. MMA predictions are per fight, not "games".
    const isF1 = pool.sport === 'f1'
    const isMma = pool.sport === 'mma'
    const unit = isF1 ? 'round' : isMma ? 'fight' : 'game'
    const unitPlural = isF1 ? 'rounds' : isMma ? 'fights' : 'games'
    const countUnits = (fixtureIds: Iterable<number>) => isF1
      ? new Set([...fixtureIds].map(id => roundByFixtureId[id]).filter(Boolean)).size
      : new Set(fixtureIds).size

    const roundFilteredIds = selectedRound === 'all'
      ? finishedFixtureIds
      : new Set([...finishedFixtureIds].filter(id => roundByFixtureId[id] === selectedRound))

    // Distinct-unit count from a member's own predictions, intersected with a given
    // fixture set — this is the "games/rounds/fights counted" figure on each row.
    function gamesAndPoints(userId: string, fixtureIds: Set<number>) {
      const rows = allPredsCached.filter(p => p.user_id === userId && hasValue(p) && fixtureIds.has(p.fixture_id))
      const distinctFixtures = new Set(rows.map(p => p.fixture_id))
      const points = rows.reduce((sum, p) => sum + (p.points_earned || 0), 0)
      return { points, games: countUnits(distinctFixtures) }
    }

    let countedFixtureIds = roundFilteredIds
    if (leaderboardScope === 'yours' && myId) {
      const myFixtures = new Set(allPredsCached.filter(p => p.user_id === myId && hasValue(p)).map(p => p.fixture_id))
      countedFixtureIds = new Set([...roundFilteredIds].filter(id => myFixtures.has(id)))
    } else if (leaderboardScope === 'rival' && myId && rival) {
      const myFixtures = new Set(allPredsCached.filter(p => p.user_id === myId && hasValue(p)).map(p => p.fixture_id))
      const rivalFixtures = new Set(allPredsCached.filter(p => p.user_id === rival.user_id && hasValue(p)).map(p => p.fixture_id))
      countedFixtureIds = new Set([...roundFilteredIds].filter(id => myFixtures.has(id) && rivalFixtures.has(id)))
    }

    const isUnrestrictedOverall = leaderboardScope === 'all' && selectedRound === 'all'
    const members = leaderboardScope === 'rival' && rival
      ? leaderboard.filter(m => m.user_id === myId || m.user_id === rival.user_id)
      : leaderboard

    const rows = members.map(m => {
      if (isUnrestrictedOverall) {
        // Exact parity with the pre-existing server-computed total — points come
        // straight from `leaderboard`, never recomputed client-side.
        const games = hasScopedData ? gamesAndPoints(m.user_id, finishedFixtureIds).games : null
        return { ...m, games }
      }
      const { points, games } = gamesAndPoints(m.user_id, countedFixtureIds)
      return { ...m, points, games }
    }).sort((a, b) => b.points - a.points)

    const n = countUnits(countedFixtureIds)
    const nUnit = n === 1 ? unit : unitPlural
    const explainer = leaderboardScope === 'all'
      ? `everyone’s total points across every ${unit} in the pool.`
      : leaderboardScope === 'yours'
      ? `fair fight — everyone re-scored using only the ${n} ${nUnit} you picked. good if you joined late.`
      : rival
      ? `just you vs. ${rival.display_name}, counting only the ${n} ${nUnit} you both picked.`
      : 'pick a rival below to compare.'

    const emptyState = leaderboardScope === 'yours' && n === 0
      ? 'you haven’t made any picks yet — this view will make sense once you do.'
      : leaderboardScope === 'rival' && !rival
      ? 'pick a rival above to see the comparison.'
      : leaderboardScope === 'rival' && rival && n === 0
      ? `you and ${rival.display_name} haven’t picked any of the same ${unitPlural} yet.`
      : null

    function renderRow(member: any, i: number) {
      return (
        <div key={member.id || member.user_id} style={{
          display: 'flex', alignItems: 'center',
          padding: '7px 8px', marginBottom: '1px',
          background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
          borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
        }}>
          <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, textAlign: 'left' as const}}>
            {i + 1}. {member.is_ghost
              ? <a href={`/dashboard/g/${member.user_id}`} style={{color: 'inherit', textDecoration: 'none'}}>{member.display_name}*</a>
              : <a href={`/dashboard/u/${member.user_id}`} style={{color: 'inherit', textDecoration: 'none'}}>{member.display_name}</a>}
          </span>
          <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
            {isUnrestrictedOverall && pool.buy_in_amount && !member.is_ghost && (
              <div style={{width: 68, display: 'flex', justifyContent: 'center', flexShrink: 0}}>
                <PaidPill member={member} />
              </div>
            )}
            <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', textAlign: 'right' as const, flexShrink: 0, whiteSpace: 'nowrap' as const}}>
              {member.points}{member.games != null && <span style={{fontSize: '10px', fontWeight: 400, color: '#bbb'}}> · {member.games}</span>}
            </span>
            {isUnrestrictedOverall && pool.deadline_type === 'before_tournament' && (
              <span style={{fontSize: '11px', color: '#bbb', width: 40, textAlign: 'center' as const, flexShrink: 0}}>
                {member.maxPossible != null ? member.maxPossible : ''}
              </span>
            )}
          </div>
        </div>
      )
    }

    return (
      <div>
        {isLive && (
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 0 8px',fontSize:'10px',fontWeight:700,color:'#2d7a2d',textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#2d7a2d',display:'inline-block'}}/>
            live scoreboard · if results hold
          </div>
        )}

        {hasScopedData && (
          <>
            <div style={{marginBottom: 8}}>
              <label style={{display: 'block', fontSize: '10px', color: '#aaa', marginBottom: 3}}>counting points from:</label>
              <select value={leaderboardScope} onChange={e => setLeaderboardScope(e.target.value as any)}
                style={{fontSize: '12px', border: '1px solid #ddd', padding: '5px 6px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, color: '#333', background: 'white'}}>
                <option value='all'>all {unitPlural}</option>
                <option value='yours'>only {unitPlural} I picked</option>
                <option value='rival'>{unitPlural} me + a rival both picked</option>
              </select>
            </div>

            {leaderboardScope === 'rival' && (
              <div style={{marginBottom: 8}}>
                <label style={{display: 'block', fontSize: '10px', color: '#aaa', marginBottom: 3}}>compare with:</label>
                <select value={rival?.user_id || ''} onChange={e => {
                  const opp = leaderboard.find(m => m.user_id === e.target.value)
                  setRival(opp || null)
                }} style={{fontSize: '12px', border: '1px solid #ddd', padding: '5px 6px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, color: '#333', background: 'white'}}>
                  <option value=''>pick a player...</option>
                  {leaderboard.filter(m => m.user_id !== user?.id).map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
            )}

            {roundsInOrder.length > 1 && (
              <div style={{marginBottom: 10}}>
                <label style={{display: 'block', fontSize: '10px', color: '#aaa', marginBottom: 3}}>round:</label>
                <select value={selectedRound} onChange={e => setSelectedRound(e.target.value)}
                  style={{fontSize: '12px', border: '1px solid #ddd', padding: '5px 6px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, color: '#333', background: 'white'}}>
                  <option value='all'>all rounds</option>
                  {roundsInOrder.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{fontSize: '11px', color: '#aaa', marginBottom: 10}}>{explainer}</div>
          </>
        )}

        {!hasScopedData && (
          <div style={{fontSize: '11px', color: '#aaa', marginBottom: 10}}>
            once picks are in, you'll be able to filter this by round or scope it to just your {unitPlural}.
          </div>
        )}

        {emptyState ? (
          <div style={{fontSize: '12px', color: '#aaa', padding: '16px 0', textAlign: 'center' as const}}>{emptyState}</div>
        ) : (
          <>
            <div style={{fontSize: '10px', color: '#aaa', marginBottom: '8px', display: 'flex', alignItems: 'center'}}>
              <span style={{flex: 1, minWidth: 0, textAlign: 'left' as const}}>player</span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0}}>
                {isUnrestrictedOverall && pool.buy_in_amount && <span style={{width: 68, textAlign: 'center' as const, flexShrink: 0}}>paid</span>}
                <span style={{width: 64, textAlign: 'right' as const, flexShrink: 0}}>pts{hasScopedData ? ` · ${unitPlural}` : ''}</span>
                {isUnrestrictedOverall && pool.deadline_type === 'before_tournament' && <span style={{width: 40, textAlign: 'center' as const, flexShrink: 0}}>max</span>}
              </div>
            </div>
            {(leaderboardExpanded ? rows : rows.slice(0, 5)).map((member, i) => renderRow(member, i))}
            {rows.length > 5 && (
              <button type="button" onClick={() => setLeaderboardExpanded(e => !e)}
                style={{
                  display: 'block', width: '100%', marginTop: 6, padding: '6px 0', background: 'none',
                  border: 'none', borderTop: '1px solid #f0f0f0', color: '#888', fontSize: '11px',
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                {leaderboardExpanded ? 'show top 5' : `show all ${rows.length}`}
              </button>
            )}
          </>
        )}

        {rows.some(m => m.is_ghost) && (
          <div style={{fontSize: '10px', color: '#bbb', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0'}}>
            * predictions are inputted by the admin based on weekly video predictions.
          </div>
        )}

        {isUnrestrictedOverall && user && pool.weekly_buy_in > 0 && <WeeklyLeaderboard poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} />}
      </div>
    )
  }

  function PrizesPanel({ pool }: { pool: any }) {
    // Season payout_structure is saved as "<template> · best N of 38 matchdays counted" — split for cleaner display
    const [seasonTemplate, ...rest] = (pool.payout_structure || '').split(' · best ')
    const seasonBestWeeksNote = rest.length > 0 ? `best ${rest.join(' · best ')}` : null
    const feePercent = pool.admin_fee_percent
    const seasonPrizePool = feePercent && totalDue > 0 ? (totalDue * (1 - feePercent / 100)).toFixed(2) : null

    return (
      <div style={{ border: '1px solid #eee', marginBottom: 16, background: '#fdfdfc' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '8px 12px', borderBottom: '1px solid #eee' }}>prizes</div>
        {pool.buy_in_amount > 0 && (
          <div style={{ padding: '10px 12px', borderBottom: pool.weekly_buy_in ? '1px solid #eee' : 'none' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#C8102E', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>season pot</div>
            <div style={{ fontSize: '12px', color: '#555' }}>💰 ${pool.buy_in_amount} buy-in{feePercent ? ` · ${feePercent}% admin fee` : ''}</div>
            {seasonTemplate && <div style={{ fontSize: '11px', color: '#888', marginTop: 2 }}>🏆 {seasonTemplate}</div>}
            {seasonBestWeeksNote && <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>{seasonBestWeeksNote}</div>}
            {seasonPrizePool && <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>of ${seasonPrizePool} prize pool (after fee)</div>}
            <CollectionSummary />
          </div>
        )}
        {pool.weekly_buy_in > 0 && (
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#C8102E', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>weekly pot</div>
            <div style={{ fontSize: '12px', color: '#555' }}>💰 ${pool.weekly_buy_in} per matchday{feePercent ? ` · ${feePercent}% admin fee` : ''}</div>
            {pool.weekly_payout_structure && <div style={{ fontSize: '11px', color: '#888', marginTop: 2 }}>🏆 {pool.weekly_payout_structure}</div>}
          </div>
        )}
      </div>
    )
  }

  const sidebarContent = (
    <div style={{padding: isMobile ? '16px' : '40px 24px', maxWidth: isMobile ? '100%' : 280, margin: isMobile ? 0 : '0 auto', width: '100%'}}>

      <div style={{fontWeight: 700, fontSize: '16px', marginBottom: '2px'}}>{pool.name}</div>
      <div style={{fontSize: '11px', color: '#888', marginBottom: '8px'}}>
        {pool.tournament_scope?.replace('_', ' ')} · {pkg?.name || 'custom'}
        {isAdmin && <span style={{color: '#C8102E', marginLeft: '6px', fontWeight: 600}}>admin</span>}
      </div>

      {/* Edit + share recap buttons — admin only */}
      {isAdmin && (
        <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
          {(!pool.tournament_end_date || new Date() < new Date(pool.tournament_end_date)) && (
            <a href={`/pool/${pool.id}/edit`}>
              <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'}}>
                ✏️ edit pool
              </button>
            </a>
          )}
          <a href={`/pool/${pool.id}/recap`}>
            <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'}}>
              share recap
            </button>
          </a>
        </div>
      )}

      {/* Change notifications */}
      {!isAdmin && recentChanges.length > 0 && !changesDismissed && (
        <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '10px 12px', marginBottom: '12px', fontSize: '11px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
            <span style={{fontWeight: 600, color: '#888'}}>pool was updated</span>
            <button onClick={() => setChangesDismissed(true)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', minWidth: 32, minHeight: 32}}>×</button>
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
      {/* Leaderboard */}
      <Section title="leaderboard" defaultOpen={true}>
        <ScopedLeaderboard />
      </Section>

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

      {(pool.buy_in_amount || pool.weekly_buy_in) && <PrizesPanel pool={pool} />}
      {user && pool.weekly_buy_in > 0 && <WeeklyPot poolId={pool.id} userId={user.id} isAdmin={isAdmin} weeklyBuyIn={pool.weekly_buy_in} tournamentId={pool.tournament_id} poolName={pool.name} venmoHandle={pool.venmo_handle} zelleHandle={pool.zelle_handle} weeklyPayoutStructure={pool.weekly_payout_structure} adminFeePercent={pool.admin_fee_percent} />}

      {/* Invite — admins always, members too if the pool allows it */}
      {(isAdmin || pool.allow_member_invites || pool.is_public) && (
        <Section title="invite" defaultOpen={!isMobile}>
          {(pool.buy_in_amount || pool.weekly_buy_in) ? (
            <BuyInInvitePanel poolId={pool.id} />
          ) : (
            <InvitePanel poolName={pool.name} inviteUrl={inviteUrl} buyInAmount={pool.buy_in_amount} inviterName={user?.user_metadata?.display_name || user?.email?.split('@')[0] || null} />
          )}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f5f5f5' }}>
            <InviteFromContacts poolId={pool.id} />
          </div>
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
            <ArchivePool poolId={pool.id} archived={!!pool.archived} />
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
      <div style={{background: 'white', borderBottom: '1px solid var(--border)', padding: '0.5rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50}}>
        <a href="/dashboard" style={{fontWeight: 700, fontSize: '1.4rem', color: 'var(--red)', textDecoration: 'none'}}>pool'em</a>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <a href="/dashboard/profile" style={{fontSize: '11px', color: '#888', textDecoration: 'none'}}>your record</a>
          <span style={{fontSize: '11px', color: '#888'}}>
            {user && <a href={`/dashboard/u/${user.id}`} style={{color: '#888', textDecoration: 'none'}}>{user?.user_metadata?.display_name || user?.email?.split('@')[0]}</a>} ·{' '}
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
            {isAdmin && (
              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                {(!pool.tournament_end_date || new Date() < new Date(pool.tournament_end_date)) && (
                  <a href={`/pool/${pool.id}/edit`}>
                    <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'}}>
                      ✏️ edit pool
                    </button>
                  </a>
                )}
                <a href={`/pool/${pool.id}/recap`}>
                  <button style={{fontSize: '11px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'}}>
                    share recap
                  </button>
                </a>
              </div>
            )}
            {!isAdmin && recentChanges.length > 0 && !changesDismissed && (
              <div style={{background: '#fffbf0', border: '1px solid #f0e0a0', padding: '10px 12px', marginBottom: '12px', fontSize: '11px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                  <span style={{fontWeight: 600, color: '#888'}}>pool was updated</span>
                  <button onClick={() => setChangesDismissed(true)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '14px', minWidth: 32, minHeight: 32}}>×</button>
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
                    <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={!!bracketLockTime && new Date() >= bracketLockTime} isAdmin={isAdmin} tournamentId={pool.tournament_id} />
                    {!!bracketLockTime && new Date() >= bracketLockTime && (
                      <div style={{ marginTop: 32 }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                        <BracketViewer poolId={pool.id} tournamentId={pool.tournament_id} />
                      </div>
                    )}
                  </>
                ) : user && (
                  pool.sport === 'f1'
                    ? <F1SessionsList poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} canManageGhosts={canManageGhosts} />
                    : pool.sport === 'mma'
                    ? <MMAFightCard poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} canManageGhosts={canManageGhosts} />
                    : pool.sport === 'nfl'
                    ? <NFLGamesList poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} deadlineType={pool.deadline_type} isAdmin={isAdmin} canManageGhosts={canManageGhosts} cfbGameMode={pool.cfb_game_mode} cfbBest10AdminOverride={pool.cfb_best10_admin_override} />
                    : <>
                        {pool.season_props_enabled && !seasonPropsLocked && <SeasonPropsTicket poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} onLockChange={setSeasonPropsLocked} />}
                        <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} hideControls={true} externalSortMode={mobileSortMode} externalViewMode={mobileViewMode} isAdmin={isAdmin} canManageGhosts={canManageGhosts} plGameMode={pool.pl_game_mode} plBest5AdminOverride={pool.pl_best5_admin_override} />
                        {pool.season_props_enabled && seasonPropsLocked && <SeasonPropsTicket poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} onLockChange={setSeasonPropsLocked} />}
                      </>
                )}
              </div>
            )}

            {/* Leaderboard panel */}
            {mobilePanel === 'leaderboard' && (
              <div style={{padding: '16px', background: 'white', minHeight: '100%'}}>
                <div style={{fontWeight: 700, fontSize: '15px', marginBottom: 12}}>{pool.name}</div>
                <ScopedLeaderboard />

                {(pool.buy_in_amount || pool.weekly_buy_in) && <div style={{marginTop: 20}}><PrizesPanel pool={pool} /></div>}
                {user && pool.weekly_buy_in > 0 && <WeeklyPot poolId={pool.id} userId={user.id} isAdmin={isAdmin} weeklyBuyIn={pool.weekly_buy_in} tournamentId={pool.tournament_id} poolName={pool.name} venmoHandle={pool.venmo_handle} zelleHandle={pool.zelle_handle} weeklyPayoutStructure={pool.weekly_payout_structure} adminFeePercent={pool.admin_fee_percent} />}
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
                {(isAdmin || pool.allow_member_invites || pool.is_public) && (
                  <div style={{marginBottom: 20}}>
                    <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>invite</div>
                    {(pool.buy_in_amount || pool.weekly_buy_in) ? (
                      <BuyInInvitePanel poolId={pool.id} />
                    ) : (
                      <div style={{display: 'flex', gap: 8}}>
                        <input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pool/join/${pool.invite_code}`}
                          style={{flex: 1, border: '1px solid #e0e0db', padding: '8px', fontSize: '11px', fontFamily: 'inherit', background: '#f7f7f5', color: '#555'}} />
                        <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/pool/join/${pool.invite_code}`)}
                          style={{padding: '8px 12px', background: '#111', color: 'white', border: 'none', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'}}>
                          copy
                        </button>
                      </div>
                    )}
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f5f5f5' }}>
                      <InviteFromContacts poolId={pool.id} />
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
                        <ArchivePool poolId={pool.id} archived={!!pool.archived} />
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
                  <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={!!bracketLockTime && new Date() >= bracketLockTime} isAdmin={isAdmin} tournamentId={pool.tournament_id} />
                  {!!bracketLockTime && new Date() >= bracketLockTime && (
                    <div style={{ marginTop: 32 }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                      <BracketViewer poolId={pool.id} tournamentId={pool.tournament_id} />
                    </div>
                  )}
                </>
              ) : user && (
                pool.sport === 'f1'
                  ? <F1SessionsList poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} canManageGhosts={canManageGhosts} />
                  : pool.sport === 'mma'
                  ? <MMAFightCard poolId={pool.id} userId={user.id} deadlineType={pool.deadline_type} tournamentId={pool.tournament_id} isAdmin={isAdmin} canManageGhosts={canManageGhosts} />
                  : pool.sport === 'nfl'
                  ? <NFLGamesList poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} deadlineType={pool.deadline_type} isAdmin={isAdmin} canManageGhosts={canManageGhosts} cfbGameMode={pool.cfb_game_mode} cfbBest10AdminOverride={pool.cfb_best10_admin_override} />
                  : <>
                      {pool.season_props_enabled && !seasonPropsLocked && <SeasonPropsTicket poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} onLockChange={setSeasonPropsLocked} />}
                      <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} isAdmin={isAdmin} canManageGhosts={canManageGhosts} plGameMode={pool.pl_game_mode} plBest5AdminOverride={pool.pl_best5_admin_override} />
                      {pool.season_props_enabled && seasonPropsLocked && <SeasonPropsTicket poolId={pool.id} userId={user.id} tournamentId={pool.tournament_id} onLockChange={setSeasonPropsLocked} />}
                    </>
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
