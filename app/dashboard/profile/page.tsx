'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RecordPanel from '@/components/RecordPanel'

export default function ProfilePage() {
  // "Viewing" — defaults to your own record, but anyone sharing a pool with you can be
  // selected instead. This intentionally exposes nothing new: any pool member can
  // already see every other member's picks per-fixture in that pool's "everyone's
  // picks" tables (F1SessionsList, FixturesList, etc.) — this just aggregates the same
  // already-visible data into the same views as your own record, for a shared pool.
  // Ghost entries aren't selectable — they don't have a profile of their own to view.
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [poolIds, setPoolIds] = useState<string[]>([])
  const [otherMembers, setOtherMembers] = useState<{ id: string; name: string }[]>([])
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', user.id),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
      ])
      const ids = [...new Set([
        ...(adminPools || []).map(p => p.id),
        ...(memberRows || []).map(m => m.pool_id),
      ])]

      setViewerId(user.id)
      setPoolIds(ids)
      setViewingUserId(user.id)

      if (ids.length > 0) {
        const { data: allMembers } = await supabase
          .from('pool_members')
          .select('user_id, display_name')
          .in('pool_id', ids)
          .neq('user_id', user.id)
        const seen = new Set<string>()
        const others: { id: string; name: string }[] = []
        for (const m of allMembers || []) {
          if (seen.has(m.user_id)) continue
          seen.add(m.user_id)
          others.push({ id: m.user_id, name: m.display_name })
        }
        setOtherMembers(others.sort((a, b) => a.name.localeCompare(b.name)))
      }
    }
    init()
  }, [])

  if (!viewingUserId) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  const isSelf = viewingUserId === viewerId
  const viewingName = isSelf ? null : otherMembers.find(m => m.id === viewingUserId)?.name || 'this member'

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>{isSelf ? 'your record' : `${viewingName}'s record`}</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          {isSelf ? "your prediction accuracy across every pool you've played" : `${viewingName}'s prediction accuracy across every pool you share`}, broken down by sport and prop.
        </p>
      </div>

      {otherMembers.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.3rem' }}>viewing</label>
          <select value={viewingUserId || ''} onChange={e => setViewingUserId(e.target.value)}
            style={{ fontSize: '0.85rem', padding: '6px 10px', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white', color: '#111', minWidth: 180 }}>
            <option value={viewerId || ''}>you</option>
            {otherMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      <RecordPanel targetUserId={viewingUserId} poolIds={poolIds} subjectLabel={isSelf ? 'you' : (viewingName || 'this member')} viewerId={viewerId || ''} />
    </div>
  )
}
