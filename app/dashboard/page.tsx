'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { RULE_PACKAGES } from '@/types'
import { getContacts, getMutualContacts } from '@/lib/contacts'
import { resolveCategoryDescription } from '@/lib/categoryGroups'
import InviteCard, { InviteRule } from '@/components/InviteCard'
import { syncMemberToPublicPools } from '@/lib/publicPoolSync'

interface PendingInvite {
  id: string
  pool_id: string
  pool_name: string
  sport: string
  inviterNames: string[]
  mutualContactNames: string[]
  rules: InviteRule[]
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [adminPools, setAdminPools] = useState<any[]>([])
  const [memberPools, setMemberPools] = useState<any[]>([])
  const [livePoolIds, setLivePoolIds] = useState<Set<string>>(new Set())
  const [overPoolIds, setOverPoolIds] = useState<Set<string>>(new Set())
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [tournamentNames, setTournamentNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [publicPools, setPublicPools] = useState<any[]>([])
  const [publicPoolMemberCounts, setPublicPoolMemberCounts] = useState<Record<string, number>>({})
  const [publicPoolAdminNames, setPublicPoolAdminNames] = useState<Record<string, string>>({})
  const [joiningPublicId, setJoiningPublicId] = useState<string | null>(null)
  const [dueSoonPoolIds, setDueSoonPoolIds] = useState<Set<string>>(new Set())
  const [ghostDueSoonCounts, setGhostDueSoonCounts] = useState<Record<string, number>>({})

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    setUser(user)

    const { data: admin } = await supabase.from('pools').select('*, sport').eq('admin_id', user.id).order('created_at', { ascending: false })
    const { data: member } = await supabase.from('pool_members').select('*, pools(*)').eq('user_id', user.id).order('joined_at', { ascending: false })

    setAdminPools(admin || [])
    setMemberPools((member || []).filter(m => (m.pools as any)?.admin_id !== user.id))

    const allPools = [...(admin || []), ...((member || []).map(m => m.pools as any))]
    const myPoolIds = new Set(allPools.filter(Boolean).map(p => p.id))

    const { data: publicPoolRows } = await supabase
      .from('pools')
      .select('id, name, sport, tournament_id, admin_id, created_at')
      .eq('is_public', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    const allPublic = publicPoolRows || []
    setPublicPools(allPublic)
    if (allPublic.length > 0) {
      const publicIds = allPublic.map(p => p.id)
      const [{ data: pubMembers }, { data: pubAdmins }] = await Promise.all([
        supabase.from('pool_members').select('pool_id').in('pool_id', publicIds),
        supabase.from('profiles').select('id, display_name').in('id', [...new Set(allPublic.map(p => p.admin_id))]),
      ])
      const counts: Record<string, number> = {}
      for (const m of pubMembers || []) counts[m.pool_id] = (counts[m.pool_id] || 0) + 1
      setPublicPoolMemberCounts(counts)
      const names: Record<string, string> = {}
      for (const a of pubAdmins || []) names[a.id] = a.display_name
      setPublicPoolAdminNames(names)
    }

    const { data: liveFixtures } = await supabase.from('fixtures').select('tournament_id').eq('status', 'live')
    const { data: liveF1Sessions } = await supabase.from('f1_sessions').select('tournament_id').eq('status', 'In Progress')

    // MMA: live tag shows from first fight FT until all fights are scored
    const mmaTournamentIds = allPools.filter(p => p?.sport === 'mma').map(p => p.tournament_id).filter(Boolean)
    const mmaTournamentsInProgress = new Set<string>()
    if (mmaTournamentIds.length) {
      const { data: mmaFixtures } = await supabase.from('fixtures').select('tournament_id, status, scored').in('tournament_id', mmaTournamentIds)
      const byTournament: Record<string, any[]> = {}
      for (const f of mmaFixtures || []) {
        if (!byTournament[f.tournament_id]) byTournament[f.tournament_id] = []
        byTournament[f.tournament_id].push(f)
      }
      for (const [tid, fights] of Object.entries(byTournament)) {
        const hasStarted = fights.some(f => f.status !== 'NS')
        const allDone = fights.every(f => f.scored)
        if (hasStarted && !allDone) mmaTournamentsInProgress.add(tid)
      }
    }

    const liveSoccerTournaments = new Set((liveFixtures || []).map((f: any) => f.tournament_id))
    const liveF1Tournaments = new Set((liveF1Sessions || []).map((s: any) => s.tournament_id))
    const allLiveTournaments = new Set([...liveSoccerTournaments, ...liveF1Tournaments, ...mmaTournamentsInProgress])
    if (allLiveTournaments.size > 0) {
      const liveIds = new Set(allPools.filter(p => p && allLiveTournaments.has(p.tournament_id)).map(p => p.id) as string[])
      setLivePoolIds(liveIds)
    }

    // Check which pools are over based on tournament end_date
    const tournamentIds = [...new Set(allPools.filter(p => p?.tournament_id).map(p => p.tournament_id))]
    if (tournamentIds.length > 0) {
      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('id, name, end_date')
        .in('id', tournamentIds)
      const now = new Date()
      const overTournaments = new Set(
        (tournaments || []).filter(t => t.end_date && new Date(t.end_date) <= now).map(t => t.id)
      )
      const overIds = new Set(
        allPools
          .filter(p => p?.tournament_id && overTournaments.has(p.tournament_id) && !p.archived)
          .map(p => p.id) as string[]
      )
      setOverPoolIds(overIds)

      const nameById: Record<string, string> = {}
      for (const t of tournaments || []) nameById[t.id] = t.name
      setTournamentNames(nameById)
    }

    await loadPendingInvites(supabase, user, admin || [], member || [])

    // ── 48h deadline flag ── scoped to CUSTOM package_id, per-game pools (soccer/NFL —
    // the fixtures table). F1/MMA/bracket pools use different deadline shapes entirely
    // and are left out of this flag rather than half-supported.
    const eligiblePools = allPools.filter(p =>
      p && p.package_id === 'CUSTOM' && p.tournament_id && !p.archived
      && (p.deadline_type === 'before_each_game' || p.deadline_type === 'before_weekend')
      && p.sport !== 'mma' && p.sport !== 'f1'
    )

    if (eligiblePools.length > 0) {
      const tIds = [...new Set(eligiblePools.map(p => p.tournament_id))]
      const now48 = new Date()
      const in48h = new Date(now48.getTime() + 48 * 60 * 60 * 1000)
      const { data: upcoming } = await supabase
        .from('fixtures')
        .select('id, tournament_id')
        .in('tournament_id', tIds)
        .eq('status', 'NS')
        .gte('date', now48.toISOString())
        .lte('date', in48h.toISOString())

      const fixturesByTournament: Record<string, Set<number>> = {}
      const allUpcomingIds: number[] = []
      for (const f of upcoming || []) {
        (fixturesByTournament[f.tournament_id] ||= new Set()).add(f.id)
        allUpcomingIds.push(f.id)
      }

      const poolsWithUpcoming = eligiblePools.filter(p => fixturesByTournament[p.tournament_id]?.size)

      if (poolsWithUpcoming.length > 0) {
        const poolIds = poolsWithUpcoming.map(p => p.id)

        const { data: myPicks } = await supabase
          .from('predictions_v2')
          .select('pool_id, fixture_id')
          .eq('user_id', user.id)
          .in('pool_id', poolIds)
          .in('fixture_id', allUpcomingIds)
        const myPickedByPool: Record<string, Set<number>> = {}
        for (const p of myPicks || []) { if (p.fixture_id != null) (myPickedByPool[p.pool_id] ||= new Set()).add(p.fixture_id) }

        const dueSoon = new Set<string>()
        for (const pool of poolsWithUpcoming) {
          const need = fixturesByTournament[pool.tournament_id!]
          const have = myPickedByPool[pool.id] || new Set()
          if ([...need].some(id => !have.has(id))) dueSoon.add(pool.id)
        }
        setDueSoonPoolIds(dueSoon)

        const adminEligiblePoolIds = poolsWithUpcoming.filter(p => p.admin_id === user.id).map(p => p.id)
        if (adminEligiblePoolIds.length > 0) {
          const { data: ghosts } = await supabase.from('ghost_entries').select('id, pool_id').in('pool_id', adminEligiblePoolIds)
          if (ghosts && ghosts.length > 0) {
            const ghostIds = ghosts.map(g => g.id)
            const { data: ghostPicks } = await supabase
              .from('predictions_v2')
              .select('pool_id, user_id, fixture_id')
              .in('pool_id', adminEligiblePoolIds)
              .in('user_id', ghostIds)
              .in('fixture_id', allUpcomingIds)
            const pickedByGhost: Record<string, Set<number>> = {}
            for (const p of ghostPicks || []) { if (p.fixture_id != null) (pickedByGhost[p.user_id] ||= new Set()).add(p.fixture_id) }

            const ghostDueCounts: Record<string, number> = {}
            for (const g of ghosts) {
              if (!g.pool_id) continue
              const pool = poolsWithUpcoming.find(p => p.id === g.pool_id)
              if (!pool) continue
              const need = fixturesByTournament[pool.tournament_id!]
              const have = pickedByGhost[g.id] || new Set()
              if ([...need].some(id => !have.has(id))) ghostDueCounts[g.pool_id] = (ghostDueCounts[g.pool_id] || 0) + 1
            }
            setGhostDueSoonCounts(ghostDueCounts)
          } else {
            setGhostDueSoonCounts({})
          }
        } else {
          setGhostDueSoonCounts({})
        }
      } else {
        setDueSoonPoolIds(new Set())
        setGhostDueSoonCounts({})
      }
    } else {
      setDueSoonPoolIds(new Set())
      setGhostDueSoonCounts({})
    }

    setLoading(false)
  }

  async function loadPendingInvites(supabase: ReturnType<typeof createClient>, user: any, admin: any[], member: any[]) {
    // Self-healing safety net: if the accept write path succeeded on pool_members but
    // failed to flip the invitation's status, don't show a stale invite for a pool
    // they're already in.
    const myPoolIds = new Set([...admin.map((p: any) => p.id), ...member.map((m: any) => m.pool_id)])

    const { data: invRows } = await supabase
      .from('pool_invitations')
      .select('id, pool_id, created_at, pools(name, sport)')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')

    const relevant = (invRows || []).filter((i: any) => !myPoolIds.has(i.pool_id))
    if (relevant.length === 0) { setPendingInvites([]); return }

    const invIds = relevant.map((i: any) => i.id)
    const invPoolIds = [...new Set(relevant.map((i: any) => i.pool_id))]

    const [{ data: inviterRows }, { data: ruleRows }, { data: poolMemberRows }, contactList] = await Promise.all([
      supabase.from('pool_invitation_inviters').select('invitation_id, pool_id, inviter_user_id').in('invitation_id', invIds),
      supabase.from('pool_rules').select('pool_id, category_id, points, ruleset_categories(name, description)').in('pool_id', invPoolIds),
      supabase.from('pool_members').select('pool_id, user_id, display_name').in('pool_id', invPoolIds),
      getContacts(supabase, user.id),
    ])

    const enriched: PendingInvite[] = relevant.map((inv: any) => {
      const inviterIds = (inviterRows || []).filter((r: any) => r.invitation_id === inv.id).map((r: any) => r.inviter_user_id)
      const inviterNames = inviterIds.map((id: string) =>
        (poolMemberRows || []).find((m: any) => m.pool_id === inv.pool_id && m.user_id === id)?.display_name || 'someone')

      const poolMemberIds = new Set((poolMemberRows || []).filter((m: any) => m.pool_id === inv.pool_id).map((m: any) => m.user_id))
      const mutual = getMutualContacts(contactList, poolMemberIds)

      const rules: InviteRule[] = (ruleRows || [])
        .filter((r: any) => r.pool_id === inv.pool_id)
        .map((r: any) => ({
          category_id: r.category_id,
          name: r.ruleset_categories?.name || r.category_id,
          description: resolveCategoryDescription(r.category_id, r.ruleset_categories?.description || ''),
          points: r.points,
        }))

      return {
        id: inv.id,
        pool_id: inv.pool_id,
        pool_name: inv.pools?.name || 'a pool',
        sport: inv.pools?.sport || '',
        inviterNames,
        mutualContactNames: mutual.map(c => c.displayName),
        rules,
      }
    })

    setPendingInvites(enriched)
  }

  async function acceptInvite(invite: PendingInvite) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'member'

    const { error: memberError } = await supabase.from('pool_members').insert({
      pool_id: invite.pool_id, user_id: user.id, display_name: displayName,
    })
    // 23505 = already a member somehow (e.g. joined by link in the meantime) — fine, continue
    if (memberError && memberError.code !== '23505') return

    await syncMemberToPublicPools(supabase, invite.pool_id, user.id, displayName)
    await supabase.from('pool_invitations').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', invite.id)
    window.location.href = `/pool/${invite.pool_id}`
  }

  async function declineInvite(invite: PendingInvite) {
    const supabase = createClient()
    await supabase.from('pool_invitations').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', invite.id)
    setPendingInvites(prev => prev.filter(p => p.id !== invite.id))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [])

  // New invites should show up without waiting for the 120s poll.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-invitations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pool_invitations', filter: `invited_user_id=eq.${user.id}` }, () => {
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  async function joinPublicPool(poolId: string) {
    if (!user) return
    setJoiningPublicId(poolId)
    const supabase = createClient()
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'member'
    const { error } = await supabase.from('pool_members').insert({
      pool_id: poolId, user_id: user.id, display_name: displayName,
    })
    // 23505 = already a member — fine, just go to the pool
    if (!error || error.code === '23505') {
      window.location.href = `/pool/${poolId}`
      return
    }
    setJoiningPublicId(null)
  }

  async function archivePool(poolId: string, archived: boolean) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await fetch('/api/pool/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId, userId: user.id, archived }),
    })
    load()
  }

  if (loading) return <div style={{padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem'}}>loading...</div>

  const activeAdmin = adminPools.filter(p => !p.archived)
  const archivedAdmin = adminPools.filter(p => p.archived)
  const activeMember = memberPools.filter(m => !(m.pools as any)?.archived)
  const archivedMember = memberPools.filter(m => (m.pools as any)?.archived)
  const hasArchived = archivedAdmin.length > 0 || archivedMember.length > 0
  const myPoolIds = new Set([...adminPools.map(p => p.id), ...memberPools.map(m => (m.pools as any)?.id)])

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem'}}>
        <div>
          <h1 style={{fontWeight: 700, fontSize: '1.25rem'}}>your pools</h1>

        </div>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <Link href="/pool/join">
            <button className="btn-ghost" style={{padding: '10px 18px', fontSize: '13px', minHeight: 44, whiteSpace: 'nowrap'}}>have a join code?</button>
          </Link>
          <Link href="/pool/create">
            <button className="btn-primary" style={{padding: '10px 18px', fontSize: '13px', minHeight: 44, whiteSpace: 'nowrap'}}>+ new pool</button>
          </Link>
        </div>
      </div>

      {pendingInvites.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">you've been invited</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          {pendingInvites.map(invite => (
            <InviteCard
              key={invite.id}
              poolName={invite.pool_name}
              sport={invite.sport}
              inviterNames={invite.inviterNames}
              mutualContactNames={invite.mutualContactNames}
              rules={invite.rules}
              onAccept={() => acceptInvite(invite)}
              onDecline={() => declineInvite(invite)}
            />
          ))}
        </section>
      )}

      {activeAdmin.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i run</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
            {activeAdmin.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" isLive={livePoolIds.has(pool.id)} isOver={overPoolIds.has(pool.id)} onArchive={() => archivePool(pool.id, true)} tournamentName={tournamentNames[pool.tournament_id]} dueSoon={dueSoonPoolIds.has(pool.id)} ghostDueSoonCount={ghostDueSoonCounts[pool.id] || 0} />)}
          </div>
        </section>
      )}

      {activeMember.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i'm in</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
            {activeMember.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" isLive={livePoolIds.has((m.pools as any)?.id)} tournamentName={tournamentNames[(m.pools as any)?.tournament_id]} dueSoon={dueSoonPoolIds.has((m.pools as any)?.id)} />)}
          </div>
        </section>
      )}

      {publicPools.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">public pools</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.6rem'}}>
            {publicPools.map(pool => {
              const alreadyIn = myPoolIds.has(pool.id)
              return (
                <div key={pool.id} className="card" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap'}}>
                  <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span style={{fontWeight: 600, fontSize: '0.9rem'}}>{pool.name}</span>
                      {alreadyIn && <span style={{fontSize: '0.65rem', fontWeight: 600, color: 'var(--green)', background: '#f0faf0', border: '1px solid #b7edb7', padding: '1px 6px'}}>you're in this pool</span>}
                    </div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2}}>
                      {tournamentNames[pool.tournament_id] || pool.sport} · run by {publicPoolAdminNames[pool.admin_id] || 'someone'} · {publicPoolMemberCounts[pool.id] || 0} member{publicPoolMemberCounts[pool.id] === 1 ? '' : 's'}
                    </div>
                  </div>
                  {alreadyIn ? (
                    <Link href={`/pool/${pool.id}`}>
                      <button className="btn-secondary" style={{padding: '8px 16px', fontSize: '0.8rem', minHeight: 40}}>open</button>
                    </Link>
                  ) : (
                    <button
                      className="btn-primary"
                      disabled={joiningPublicId === pool.id}
                      onClick={() => joinPublicPool(pool.id)}
                      style={{padding: '8px 16px', fontSize: '0.8rem', minHeight: 40}}>
                      {joiningPublicId === pool.id ? 'joining...' : 'join'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeAdmin.length === 0 && activeMember.length === 0 && publicPools.length === 0 && !hasArchived && (
        <div style={{textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)'}}>
          <p style={{color: 'var(--text-dim)', marginBottom: '1rem'}}>no pools yet.</p>
          <Link href="/pool/create">
            <button className="btn-primary" style={{padding: '12px 24px', fontSize: '14px', minHeight: 48}}>create your first pool</button>
          </Link>
        </div>
      )}

      {hasArchived && (
        <section style={{marginBottom: '2rem'}}>
          <button onClick={() => setShowArchived(s => !s)}
            style={{display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', marginBottom: showArchived ? '0.75rem' : 0}}>
            <span className="section-label" style={{color: 'var(--text-faint)'}}>archived pools</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
            <span style={{fontSize: '11px', color: 'var(--text-faint)'}}>{showArchived ? '▲' : '▼'}</span>
          </button>
          {showArchived && (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
              {archivedAdmin.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" isLive={false} onUnarchive={() => archivePool(pool.id, false)} tournamentName={tournamentNames[pool.tournament_id]} />)}
              {archivedMember.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" isLive={false} tournamentName={tournamentNames[(m.pools as any)?.tournament_id]} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PoolCard({ pool, role, isLive, isOver, onArchive, onUnarchive, tournamentName, dueSoon, ghostDueSoonCount }: {
  pool: any
  role: 'admin' | 'member'
  isLive?: boolean
  isOver?: boolean
  onArchive?: () => void
  onUnarchive?: () => void
  tournamentName?: string
  dueSoon?: boolean
  ghostDueSoonCount?: number
}) {
  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  return (
    <div style={{position: 'relative'}}>
      <Link href={`/pool/${pool.id}`}>
        <div className="card" style={{cursor: 'pointer', transition: 'border-color 0.1s', minHeight: 80, opacity: pool.archived ? 0.6 : 1}}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = isLive ? '#2d7a2d' : 'var(--border)')}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <span style={{fontSize: '0.7rem', color: role === 'admin' ? 'var(--red)' : 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase'}}>{role}</span>
              <span style={{fontSize: '0.65rem', color: 'var(--text-faint)'}}>· {pool.is_public ? 'public' : 'private'}</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              {isLive && (
                <span style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 700, color: '#2d7a2d', background: '#f0fff0', border: '1px solid #b7edb7', padding: '1px 6px'}}>
                  <span style={{width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', display: 'inline-block', animation: 'pulse 1.5s infinite'}} />
                  live
                </span>
              )}
              {pool.archived && <span style={{fontSize: '0.65rem', color: 'var(--text-faint)', background: 'var(--border-light)', padding: '1px 6px'}}>archived</span>}
              {dueSoon && (
                <span style={{fontSize: '0.65rem', fontWeight: 700, color: '#a15c00', background: '#fff6e5', border: '1px solid #f0d28a', padding: '1px 6px'}}>
                  ⏱ pick due soon
                </span>
              )}
              {!!ghostDueSoonCount && (
                <span style={{fontSize: '0.65rem', fontWeight: 700, color: '#a15c00', background: '#fff6e5', border: '1px solid #f0d28a', padding: '1px 6px'}}>
                  ⏱ {ghostDueSoonCount} ghost{ghostDueSoonCount !== 1 ? 's' : ''} due soon
                </span>
              )}
            </div>
          </div>
          <div style={{fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem'}}>{pool.name}</div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-dim)'}}>{tournamentName || pkg?.name || pool.package_id}</div>
        </div>
      </Link>
      {onArchive && !pool.archived && isOver && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onArchive() }}
          style={{position: 'absolute', bottom: 8, right: 8, fontSize: '10px', color: 'var(--text-faint)', background: 'none', border: '1px solid var(--border-light)', padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit'}}>
          archive
        </button>
      )}
      {onUnarchive && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onUnarchive() }}
          style={{position: 'absolute', bottom: 8, right: 8, fontSize: '10px', color: 'var(--text-faint)', background: 'none', border: '1px solid var(--border-light)', padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit'}}>
          unarchive
        </button>
      )}
    </div>
  )
}
