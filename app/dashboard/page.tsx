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

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      setUser(user)

      const { data: admin } = await supabase.from('pools').select('*').eq('admin_id', user.id).order('created_at', { ascending: false })
      const { data: member } = await supabase.from('pool_members').select('*, pools(*)').eq('user_id', user.id).order('joined_at', { ascending: false })

      setAdminPools(admin || [])
      setMemberPools((member || []).filter(m => (m.pools as any)?.admin_id !== user.id))

      // Check for live fixtures across all tournaments
      const { data: liveFixtures } = await supabase
        .from('fixtures')
        .select('tournament_id')
        .eq('status', 'live')

      if (liveFixtures && liveFixtures.length > 0) {
        const liveTournaments = new Set(liveFixtures.map(f => f.tournament_id))
        const allPools = [...(admin || []), ...((member || []).map(m => m.pools as any))]
        const liveIds = new Set(allPools.filter(p => p && liveTournaments.has(p.tournament_id)).map(p => p.id))
        setLivePoolIds(liveIds)
      }

      setLoading(false)
    }
    load()
    // Refresh live status every 2 minutes
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div style={{padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem'}}>loading...</div>

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

      {adminPools.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i run</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
            {adminPools.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" isLive={livePoolIds.has(pool.id)} />)}
          </div>
        </section>
      )}

      {memberPools.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i'm in</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '0.75rem'}}>
            {memberPools.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" isLive={livePoolIds.has((m.pools as any)?.id)} />)}
          </div>
        </section>
      )}

      {adminPools.length === 0 && memberPools.length === 0 && (
        <div style={{textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)'}}>
          <p style={{color: 'var(--text-dim)', marginBottom: '1rem'}}>no pools yet.</p>
          <Link href="/pool/create">
            <button className="btn-primary" style={{padding: '12px 24px', fontSize: '14px', minHeight: 48}}>create your first pool</button>
          </Link>
        </div>
      )}
    </div>
  )
}

function PoolCard({ pool, role, isLive }: { pool: any, role: 'admin' | 'member', isLive?: boolean }) {
  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  return (
    <Link href={`/pool/${pool.id}`}>
      <div className="card" style={{cursor: 'pointer', transition: 'border-color 0.1s', minHeight: 80, position: 'relative'}}
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
            <span style={{fontSize: '0.7rem', color: 'var(--text-faint)'}}>{pool.tournament_scope?.replace('_', ' ')}</span>
          </div>
        </div>
        <div style={{fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem'}}>{pool.name}</div>
        <div style={{fontSize: '0.75rem', color: 'var(--text-dim)'}}>{pkg?.name || pool.package_id}</div>
      </div>
    </Link>
  )
}
