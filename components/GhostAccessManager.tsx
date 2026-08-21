'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Member { user_id: string; display_name: string; can_manage_ghosts: boolean }

// Admin-only control, dropped into the "making picks for" ghost box in each sport's
// picks view. Lets the pool admin delegate ghost-entry pick access to a specific member
// without the leaderboard needing a per-row button (which was cramping every row).
export default function GhostAccessManager({ poolId, currentUserId }: { poolId: string; currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('pool_members').select('user_id, display_name, can_manage_ghosts').eq('pool_id', poolId)
      .then(({ data }) => {
        setMembers((data || []).filter((m: Member) => m.user_id !== currentUserId))
        setLoading(false)
      })
  }, [poolId, currentUserId])

  async function grant(userId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('pool_members').update({ can_manage_ghosts: true }).eq('pool_id', poolId).eq('user_id', userId)
    if (error) { console.error(error); return }
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, can_manage_ghosts: true } : m))
    setSelected('')
  }

  async function revoke(userId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('pool_members').update({ can_manage_ghosts: false }).eq('pool_id', poolId).eq('user_id', userId)
    if (error) { console.error(error); return }
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, can_manage_ghosts: false } : m))
  }

  if (loading || members.length === 0) return null

  const granted = members.filter(m => m.can_manage_ghosts)
  const grantable = members.filter(m => !m.can_manage_ghosts)

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0e0db' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>
        ghost pick access
      </div>
      {granted.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: grantable.length > 0 ? 8 : 0 }}>
          {granted.map(m => (
            <span key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', fontSize: '11px', background: '#fff5f5', border: '1px solid #f0d0d0', color: '#C8102E' }}>
              {m.display_name}
              <button type="button" onClick={() => revoke(m.user_id)} title="revoke access"
                style={{ background: 'none', border: 'none', color: '#C8102E', cursor: 'pointer', fontSize: '13px', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {grantable.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', background: 'white', color: selected ? '#111' : '#aaa' }}>
            <option value="">grant a member ghost-pick access...</option>
            {grantable.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
          <button type="button" disabled={!selected} onClick={() => selected && grant(selected)}
            style={{ padding: '6px 12px', background: selected ? '#111' : '#eee', color: selected ? 'white' : '#aaa', border: 'none', fontSize: '12px', fontFamily: 'inherit', cursor: selected ? 'pointer' : 'default' }}>
            grant
          </button>
        </div>
      )}
    </div>
  )
}
