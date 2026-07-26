'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getContacts, Contact } from '@/lib/contacts'

export default function InviteFromContacts({ poolId }: { poolId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [invitations, setInvitations] = useState<Record<string, { id: string; status: string }>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [sentCount, setSentCount] = useState(0)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [contactList, { data: members }, { data: invites }] = await Promise.all([
      getContacts(supabase, user.id),
      supabase.from('pool_members').select('user_id').eq('pool_id', poolId),
      supabase.from('pool_invitations').select('id, invited_user_id, status').eq('pool_id', poolId),
    ])

    setContacts(contactList)
    setMemberIds(new Set((members || []).map((m: any) => m.user_id)))
    const invMap: Record<string, { id: string; status: string }> = {}
    ;(invites || []).forEach((i: any) => { invMap[i.invited_user_id] = { id: i.id, status: i.status } })
    setInvitations(invMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [poolId])

  function toggle(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function inviteSelected() {
    setInviting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setInviting(false); return }

    let count = 0
    for (const userId of selected) {
      const existing = invitations[userId]
      let invitationId = existing?.id

      if (!invitationId) {
        const { data: created, error } = await supabase
          .from('pool_invitations')
          .insert({ pool_id: poolId, invited_user_id: userId })
          .select('id')
          .single()
        if (error || !created) continue
        invitationId = created.id
      }

      const { error: inviterError } = await supabase
        .from('pool_invitation_inviters')
        .insert({ invitation_id: invitationId, pool_id: poolId, inviter_user_id: user.id })
      // 23505 = already a co-inviter on this invitation — treat as success, not a failure
      if (!inviterError || inviterError.code === '23505') count++
    }

    setSentCount(count)
    setSelected(new Set())
    setInviting(false)
    await load()
  }

  if (loading) return <div style={{ fontSize: '11px', color: '#aaa' }}>loading contacts...</div>

  const invitable = contacts.filter(c => !memberIds.has(c.userId) && invitations[c.userId]?.status !== 'accepted' && invitations[c.userId]?.status !== 'declined')

  if (invitable.length === 0) {
    return <div style={{ fontSize: '11px', color: '#aaa' }}>no contacts to invite yet — invite friends by link, or come back once you've pooled with more people</div>
  }

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: 10 }}>
        invite people you've pooled with before — they'll see it on their dashboard and can accept or decline.
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e0e0db', marginBottom: 10 }}>
        {invitable.map(c => {
          const pending = invitations[c.userId]?.status === 'pending'
          return (
            <label key={c.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={selected.has(c.userId)} onChange={() => toggle(c.userId)} />
              <span style={{ flex: 1 }}>{c.displayName}</span>
              {pending && <span style={{ fontSize: '10px', color: '#aaa' }}>already invited</span>}
            </label>
          )
        })}
      </div>
      <button
        onClick={inviteSelected}
        disabled={selected.size === 0 || inviting}
        style={{ width: '100%', padding: '9px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: selected.size === 0 ? 'default' : 'pointer', opacity: selected.size === 0 ? 0.4 : 1, fontFamily: 'inherit' }}>
        {inviting ? 'inviting...' : `invite selected (${selected.size})`}
      </button>
      {sentCount > 0 && !inviting && (
        <div style={{ fontSize: '11px', color: '#2d7a2d', marginTop: 6 }}>✓ sent {sentCount} invite{sentCount === 1 ? '' : 's'}</div>
      )}
    </div>
  )
}
