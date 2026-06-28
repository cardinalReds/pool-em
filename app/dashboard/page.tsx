'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { RULE_PACKAGES } from '@/types'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [adminPools, setAdminPools] = useState<any[]>([])
  const [memberPools, setMemberPools] = useState<any[]>([])
  const [livePoolIds, setLivePoolIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    setUser(user)

    const { data: admin } = await supabase.from('pools').select('*').eq('admin_id', user.id).order('created_at', { ascending: false })
    const { data: member } = await supabase.from('pool_members').select('*, pools(*)').eq('user_id', user.id).order('joined_at', { ascending: false })

    setAdminPools(admin || [])
    setMemberPools((member || []).filter(m => (m.pools as any)?.admin_id !== user.id))

    const allPools = [...(admin || []), ...((member || []).map(m => m.pools as any))]

    const { data: liveFixtures } = await supabase.from('fixtures').select('tournament_id').eq('status', 'live')
    const { data: liveF1Sessions } = await supabase.from('f1_sessions').select('tournament_id').eq('status', 'In Progress')
    const liveSoccerTournaments = new Set((liveFixtures || []).map((f: any) => f.tournament_id))
    const liveF1Tournaments = new Set((liveF1Sessions || []).map((s: any) => s.tournament_id))
    const allLiveTournaments = new Set([...liveSoccerTournaments, ...liveF1Tournaments])
    if (allLiveTournaments.size > 0) {
      const liveIds = new Set(allPools.filter(p => p && allLiveTournaments.has(p.tournament_id)).map(p => p.id) as string[])
      setLivePoolIds(liveIds)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [])

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

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem'}}>
        <div>
          <h1 style={{fontWeight: 700, fontSize: '1.25rem'}}>your pools</h1>
          <p style={{color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.2rem'}}>FIFA World Cup 2026</p>
        </div>
        <Link href="/pool/create">
          <button className="btn-primary" style={{padding: '10px 18px', fontSize: '13px', minHeight: 44, whiteSpace: 'nowrap'}}>+ new pool</button>
        </Link>
      </div>

      {activeAdmin.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i run</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
            {activeAdmin.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" isLive={livePoolIds.has(pool.id)} onArchive={() => archivePool(pool.id, true)} />)}
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
            {activeMember.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" isLive={livePoolIds.has((m.pools as any)?.id)} />)}
          </div>
        </section>
      )}

      {activeAdmin.length === 0 && activeMember.length === 0 && !hasArchived && (
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
            <span className="section-label" style={{color: 'var(--text-faint)'}}>archived</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
            <span style={{fontSize: '11px', color: 'var(--text-faint)'}}>{showArchived ? '▲' : '▼'}</span>
          </button>
          {showArchived && (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
              {archivedAdmin.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" isLive={false} onUnarchive={() => archivePool(pool.id, false)} />)}
              {archivedMember.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" isLive={false} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PoolCard({ pool, role, isLive, onArchive, onUnarchive }: {
  pool: any
  role: 'admin' | 'member'
  isLive?: boolean
  onArchive?: () => void
  onUnarchive?: () => void
}) {
  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  return (
    <div style={{position: 'relative'}}>
      <Link href={`/pool/${pool.id}`}>
        <div className="card" style={{cursor: 'pointer', transition: 'border-color 0.1s', minHeight: 80, opacity: pool.archived ? 0.6 : 1}}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = isLive ? '#2d7a2d' : 'var(--border)')}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
            <span style={{fontSize: '0.7rem', color: role === 'admin' ? 'var(--red)' : 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase'}}>{role}</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              {isLive && (
                <span style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 700, color: '#2d7a2d', background: '#f0fff0', border: '1px solid #b7edb7', padding: '1px 6px'}}>
                  <span style={{width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', display: 'inline-block', animation: 'pulse 1.5s infinite'}} />
                  live
                </span>
              )}
              {pool.archived && <span style={{fontSize: '0.65rem', color: 'var(--text-faint)', background: 'var(--border-light)', padding: '1px 6px'}}>archived</span>}
              <span style={{fontSize: '0.7rem', color: 'var(--text-faint)'}}>{pool.tournament_scope?.replace('_', ' ')}</span>
            </div>
          </div>
          <div style={{fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem'}}>{pool.name}</div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-dim)'}}>{pkg?.name || pool.package_id}</div>
        </div>
      </Link>
      {onArchive && !pool.archived && (
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
