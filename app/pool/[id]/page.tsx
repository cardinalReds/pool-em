'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RULE_PACKAGES } from '@/types'
import FixturesList from '@/components/FixturesList'
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

function DeletePool({ poolId }: { poolId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('predictions').delete().eq('pool_id', poolId)
    await supabase.from('predictions_v2').delete().eq('pool_id', poolId)
    await supabase.from('pool_members').delete().eq('pool_id', poolId)
    await supabase.from('reminders').delete().eq('pool_id', poolId)
    await supabase.from('pools').delete().eq('id', poolId)
    window.location.href = '/dashboard'
  }

  return (
    <div>
      <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '8px'}}>danger zone</div>
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
  const [totalFixtureCount, setTotalFixtureCount] = useState(0)
  const [finishedFixtureCount, setFinishedFixtureCount] = useState(0)
  const [poolRules, setPoolRules] = useState<any[]>([])
  const [bracketScoringRules, setBracketScoringRules] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'sidebar' | 'predictions' | 'chat'>('predictions')
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
      setPool(pool)
      setInviteUrl(`${window.location.origin}/pool/join/${pool.invite_code}`)

      const { data: membership } = await supabase.from('pool_members').select('id, last_seen_changes_at').eq('pool_id', pool.id).eq('user_id', currentUser.id).single()
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
      if (pool.deadline_type === 'before_tournament') {
        const { data: bracketScores } = await supabase
          .from('bracket_picks')
          .select('user_id, bracket_scores')
          .eq('pool_id', pool.id)
        bracketScores?.forEach(b => {
          if (b.bracket_scores?.total) pointsMap[b.user_id] = b.bracket_scores.total
        })
      } else if (pool.package_id === 'CUSTOM') {
        const { data: scores } = await supabase.from('predictions_v2').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      } else {
        const { data: scores } = await supabase.from('predictions').select('user_id, points_earned').eq('pool_id', pool.id)
        scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      }
      setLeaderboard((members || []).map(m => ({ ...m, points: pointsMap[m.user_id] || 0 })).sort((a, b) => b.points - a.points))

      // ── "Your Leaderboard" — total points across only the fixtures the LOGGED-IN user predicted on ──
      if (pool.package_id === 'CUSTOM' && pool.deadline_type !== 'before_tournament') {
        const { data: allPreds } = await supabase
          .from('predictions_v2')
          .select('user_id, fixture_id, points_earned, value_wld, value_text, value_ou, value_yesno, value_number')
          .eq('pool_id', pool.id)

        // Total fixtures in this tournament
        const { count: fixtureCount } = await supabase
          .from('fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', pool.tournament_id)
        setTotalFixtureCount(fixtureCount || 0)
        setFinishedFixtureCount(finishedFixtures?.length || 0)

        // Only count finished fixtures for the "predicted X out of Y" display
        const { data: finishedFixtures } = await supabase
          .from('fixtures')
          .select('id')
          .eq('tournament_id', pool.tournament_id)
          .eq('status', 'FT')
        const finishedIds = new Set((finishedFixtures || []).map(f => f.id))

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
    return () => { supabase.removeChannel(channel) }
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

  const sidebarContent = (
    <div style={{padding: isMobile ? '16px' : '40px 24px', maxWidth: isMobile ? '100%' : 280, margin: isMobile ? 0 : '0 auto', width: '100%'}}>

      <div style={{fontWeight: 700, fontSize: '16px', marginBottom: '2px'}}>{pool.name}</div>
      <div style={{fontSize: '11px', color: '#888', marginBottom: '8px'}}>
        {pool.tournament_scope?.replace('_', ' ')} · {pkg?.name || 'custom'}
        {isAdmin && <span style={{color: '#C8102E', marginLeft: '6px', fontWeight: 600}}>admin</span>}
      </div>

      {/* Edit button — admin only, before tournament starts */}
      {isAdmin && new Date() < new Date('2026-06-12T19:00:00Z') && (
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
      {isAdmin && pool.buy_in_amount && pool.payout_structure && (
        <div style={{background: '#f9f9f9', border: '1px solid #eee', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#555'}}>
          💰 ${pool.buy_in_amount} buy-in · 🏆 {pool.payout_structure}
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
        {isAdmin && pool.buy_in_amount && (
          <div style={{fontSize: '10px', color: '#aaa', marginBottom: '8px', display: 'flex', justifyContent: 'space-between'}}>
            <span>player</span>
            <div style={{display: 'flex', gap: 20}}>
              <span>paid</span>
              <span>pts</span>
            </div>
          </div>
        )}
        {leaderboard.map((member, i) => (
          <div key={member.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 8px', marginBottom: '1px',
            background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
            borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
          }}>
            <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1}}>
              {i + 1}. {member.display_name}
            </span>
            <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
              {isAdmin && pool.buy_in_amount && (
                <button
                  onClick={() => togglePaid(member.id, member.is_paid)}
                  title={member.is_paid ? 'mark as unpaid' : 'mark as paid'}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', border: '1px solid',
                    borderColor: member.is_paid ? '#2d7a2d' : '#ddd',
                    background: member.is_paid ? '#2d7a2d' : 'white',
                    color: 'white', fontSize: '12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                  {member.is_paid ? '✓' : ''}
                </button>
              )}
              {!isAdmin && pool.buy_in_amount && (
                <span style={{fontSize: '11px', color: member.is_paid ? '#2d7a2d' : '#ddd'}}>
                  {member.is_paid ? '✓' : '○'}
                </span>
              )}
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', minWidth: 24, textAlign: 'right' as const}}>
                {member.points}
              </span>
            </div>
          </div>
        ))}
      </Section>

      {yourLeaderboard.length > 0 && (
        <Section title="your leaderboard" defaultOpen={false}>
          <div style={{fontSize: '11px', color: '#aaa', marginBottom: '4px'}}>
            Based only on the games you predicted.
          </div>
          <div style={{fontSize: '11px', color: '#aaa', marginBottom: '10px'}}>
            You've predicted {yourLeaderboardFixtureCount} games.
          </div>
          {yourLeaderboard.map((member, i) => (
            <div key={member.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 8px', marginBottom: '1px',
              background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
              borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
            }}>
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555', flex: 1}}>
                {i + 1}. {member.display_name}
              </span>
              <span style={{fontSize: '13px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888', minWidth: 24, textAlign: 'right' as const}}>
                {member.points}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Scoring */}
      <Section title="scoring" defaultOpen={!isMobile}>
        {pool.deadline_type === 'before_tournament' ? (
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

      {/* Invite */}
      {isAdmin && (
        <Section title="invite" defaultOpen={!isMobile}>
          <InvitePanel poolId={pool.id} poolName={pool.name} inviteUrl={inviteUrl} buyInAmount={pool.buy_in_amount} payoutStructure={pool.payout_structure} />
        </Section>
      )}

      {/* Reminder */}
      <Section title="remind me" defaultOpen={!isMobile}>
        <ReminderButton poolId={pool.id} userId={user.id} userEmail={user.email || ''} />
      </Section>

      {/* Delete */}
      {isAdmin && new Date() < new Date('2026-06-11T19:00:00Z') && (
        <Section title="danger zone" defaultOpen={false}>
          <DeletePool poolId={pool.id} />
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
          {isMobile && (
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <button type="button" onClick={() => setMobilePanel(p => p === 'sidebar' ? 'predictions' : p === 'predictions' ? 'chat' : 'sidebar')}
                style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', padding: '4px'}}>
                ‹
              </button>
              <span style={{fontSize: '10px', color: '#888', minWidth: 70, textAlign: 'center' as const}}>
                {mobilePanel === 'sidebar' ? '☰ menu' : mobilePanel === 'predictions' ? '📋 picks' : '💬 chat'}
              </span>
              <button type="button" onClick={() => setMobilePanel(p => p === 'sidebar' ? 'chat' : p === 'predictions' ? 'sidebar' : 'predictions')}
                style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', padding: '4px'}}>
                ›
              </button>
            </div>
          )}
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
        // ── Mobile layout — panel navigation ─────────────────────────────
        <div>
          {mobilePanel === 'sidebar' && (
            <div style={{background: 'white'}}>
              {sidebarContent}
            </div>
          )}
          {mobilePanel === 'predictions' && (
            <div style={{padding: '16px'}}>
              {/* Buy-in banner on mobile predictions panel */}
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
              {user && pool.deadline_type === 'before_tournament' ? (
                <>
                  <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={new Date() >= new Date('2026-06-11T19:00:00Z')} />
                  {new Date() >= new Date('2026-06-11T19:00:00Z') && (
                    <div style={{ marginTop: 32 }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                      <BracketViewer poolId={pool.id} />
                    </div>
                  )}
                </>
              ) : user && (
                <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} />
              )}
            </div>
          )}
          {mobilePanel === 'chat' && user && (
            <div style={{height: 'calc(100vh - 41px)'}}>
              <ShitChat poolId={pool.id} userId={user.id} displayName={user.user_metadata?.display_name || user.email?.split('@')[0] || 'anon'} />
            </div>
          )}
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
              {user && pool.deadline_type === 'before_tournament' ? (
                <>
                  <BracketPicker poolId={pool.id} userId={user.id} scoringRules={bracketScoringRules || DEFAULT_BRACKET_SCORING} locked={new Date() >= new Date('2026-06-11T19:00:00Z')} />
                  {new Date() >= new Date('2026-06-11T19:00:00Z') && (
                    <div style={{ marginTop: 32 }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>everyone's picks</div>
                      <BracketViewer poolId={pool.id} />
                    </div>
                  )}
                </>
              ) : user && (
                <FixturesList poolId={pool.id} userId={user.id} packageId={pool.package_id} deadlineType={pool.deadline_type} scope={pool.tournament_scope} tournamentId={pool.tournament_id} />
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
