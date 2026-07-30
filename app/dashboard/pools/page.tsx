'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sportLabel } from '@/lib/sportLabels'

interface PublicPool {
  id: string
  name: string
  sport: string
  tournament_id: string
  admin_id: string
  created_at: string | null
}

export default function BrowsePoolsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [pools, setPools] = useState<PublicPool[]>([])
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [adminNames, setAdminNames] = useState<Record<string, string>>({})
  const [myPoolIds, setMyPoolIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    setUserId(user.id)

    const { data: publicPools } = await supabase
      .from('pools')
      .select('id, name, sport, tournament_id, admin_id, created_at')
      .eq('is_public', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const list = publicPools || []
    setPools(list)
    const poolIds = list.map(p => p.id)

    if (poolIds.length > 0) {
      const [{ data: members }, { data: myMemberships }, { data: admins }] = await Promise.all([
        supabase.from('pool_members').select('pool_id').in('pool_id', poolIds),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id).in('pool_id', poolIds),
        supabase.from('profiles').select('id, display_name').in('id', [...new Set(list.map(p => p.admin_id))]),
      ])
      const counts: Record<string, number> = {}
      for (const m of members || []) counts[m.pool_id] = (counts[m.pool_id] || 0) + 1
      setMemberCounts(counts)
      setMyPoolIds(new Set((myMemberships || []).map(m => m.pool_id)))
      const names: Record<string, string> = {}
      for (const a of admins || []) names[a.id] = a.display_name
      setAdminNames(names)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function joinPool(poolId: string) {
    if (!userId) return
    setJoiningId(poolId)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'member'

    const { error: joinError } = await supabase.from('pool_members').insert({
      pool_id: poolId, user_id: userId, display_name: displayName,
    })
    // 23505 = already a member — fine, just go to the pool
    if (joinError && joinError.code !== '23505') {
      setError(joinError.message)
      setJoiningId(null)
      return
    }
    window.location.href = `/pool/${poolId}`
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  return (
    <div>
      <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>browse pools</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        public pools anyone can join — no invite needed.
      </p>

      {error && <p style={{ fontSize: '0.8rem', color: 'var(--red)', marginBottom: '1rem' }}>{error}</p>}

      {pools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          no public pools right now — check back later, or make your own pool public when you create it.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {pools.map(pool => {
            const isMember = myPoolIds.has(pool.id)
            return (
              <div key={pool.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pool.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
                    {sportLabel(pool.sport)} · run by {adminNames[pool.admin_id] || 'someone'} · {memberCounts[pool.id] || 0} member{memberCounts[pool.id] === 1 ? '' : 's'}
                  </div>
                </div>
                {isMember ? (
                  <a href={`/pool/${pool.id}`}><button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 40 }}>open</button></a>
                ) : (
                  <button
                    className="btn-primary"
                    disabled={joiningId === pool.id}
                    onClick={() => joinPool(pool.id)}
                    style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 40 }}>
                    {joiningId === pool.id ? 'joining...' : 'join'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
