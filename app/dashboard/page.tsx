'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { RULE_PACKAGES } from '@/types'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [adminPools, setAdminPools] = useState<any[]>([])
  const [memberPools, setMemberPools] = useState<any[]>([])
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
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem'}}>loading...</div>

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem'}}>
        <div>
          <h1 style={{fontWeight: 700, fontSize: '1.25rem'}}>your pools</h1>
          <p style={{color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.2rem'}}>FIFA World Cup 2026</p>
        </div>
        <Link href="/pool/create"><button className="btn-primary">+ new pool</button></Link>
      </div>

      {adminPools.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i run</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem'}}>
            {adminPools.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" />)}
          </div>
        </section>
      )}

      {memberPools.length > 0 && (
        <section style={{marginBottom: '2rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
            <span className="section-label">pools i'm in</span>
            <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem'}}>
            {memberPools.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" />)}
          </div>
        </section>
      )}

      {adminPools.length === 0 && memberPools.length === 0 && (
        <div style={{textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)'}}>
          <p style={{color: 'var(--text-dim)', marginBottom: '1rem'}}>no pools yet.</p>
          <Link href="/pool/create"><button className="btn-primary">create your first pool</button></Link>
        </div>
      )}
    </div>
  )
}

function PoolCard({ pool, role }: { pool: any, role: 'admin' | 'member' }) {
  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  return (
    <Link href={`/pool/${pool.id}`}>
      <div className="card" style={{cursor: 'pointer', transition: 'border-color 0.1s'}}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
          <span style={{fontSize: '0.7rem', color: role === 'admin' ? 'var(--red)' : 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase'}}>{role}</span>
          <span style={{fontSize: '0.7rem', color: 'var(--text-faint)'}}>{pool.tournament_scope?.replace('_', ' ')}</span>
        </div>
        <div style={{fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem'}}>{pool.name}</div>
        <div style={{fontSize: '0.75rem', color: 'var(--text-dim)'}}>{pkg?.name || pool.package_id}</div>
      </div>
    </Link>
  )
}
