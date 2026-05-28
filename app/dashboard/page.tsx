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
      
      if (!user) {
        window.location.href = '/auth/login'
        return
      }
      
      setUser(user)

      const { data: admin } = await supabase
        .from('pools')
        .select('*')
        .eq('admin_id', user.id)
        .order('created_at', { ascending: false })

      const { data: member } = await supabase
        .from('pool_members')
        .select('*, pools(*)')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })

      setAdminPools(admin || [])
      setMemberPools((member || []).filter(m => (m.pools as any)?.admin_id !== user.id))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="font-display text-turf-400 tracking-widest animate-pulse">LOADING...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-5xl text-chalk tracking-wider">YOUR POOLS</h1>
          <p className="text-sm mt-1" style={{color: 'var(--chalk-dim)'}}>FIFA World Cup 2026</p>
        </div>
        <Link href="/pool/create">
          <button className="btn-turf">+ NEW POOL</button>
        </Link>
      </div>

      {adminPools.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-display text-xl tracking-wider" style={{color: 'var(--chalk-dim)'}}>POOLS I RUN</span>
            <div className="flex-1 h-px" style={{background: 'rgba(245,240,232,0.1)'}} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminPools.map(pool => <PoolCard key={pool.id} pool={pool} role="admin" />)}
          </div>
        </section>
      )}

      {memberPools.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-display text-xl tracking-wider" style={{color: 'var(--chalk-dim)'}}>POOLS I'M IN</span>
            <div className="flex-1 h-px" style={{background: 'rgba(245,240,232,0.1)'}} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberPools.map(m => <PoolCard key={m.id} pool={(m.pools as any)} role="member" />)}
          </div>
        </section>
      )}

      {adminPools.length === 0 && memberPools.length === 0 && (
        <div className="text-center py-24">
          <div className="font-display text-6xl text-turf-400 mb-4">⚽</div>
          <h2 className="font-display text-3xl text-chalk mb-3 tracking-wider">NO POOLS YET</h2>
          <p className="mb-8" style={{color: 'var(--chalk-dim)'}}>Create your first pool or ask a friend for their invite link.</p>
          <Link href="/pool/create">
            <button className="btn-turf">CREATE YOUR FIRST POOL</button>
          </Link>
        </div>
      )}
    </div>
  )
}

function PoolCard({ pool, role }: { pool: any, role: 'admin' | 'member' }) {
  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  return (
    <Link href={`/pool/${pool.id}`}>
      <div className="card hover:border-turf-400/30 transition-all cursor-pointer group">
        <div className="flex items-start justify-between mb-3">
          <span className="badge text-turf-400 text-xs">{role === 'admin' ? 'ADMIN' : 'MEMBER'}</span>
          <span className="text-xs" style={{color: 'var(--chalk-dim)'}}>{pool.tournament_scope?.replace('_', ' ').toUpperCase()}</span>
        </div>
        <h3 className="font-display text-2xl text-chalk tracking-wider mb-1 group-hover:text-turf-400 transition-colors">
          {pool.name}
        </h3>
        <p className="text-sm" style={{color: 'var(--chalk-dim)'}}>{pkg?.name || pool.package_id}</p>
      </div>
    </Link>
  )
}
