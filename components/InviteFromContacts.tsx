'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getContacts, getFriendIds, addFriend, removeFriend, Contact } from '@/lib/contacts'
import { sportLabel, canonicalSport } from '@/lib/sportLabels'

export default function InviteFromContacts({ poolId }: { poolId: string }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [invitations, setInvitations] = useState<Record<string, { id: string; status: string }>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [poolSport, setPoolSport] = useState<string | null>(null)
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set())

  const [emailText, setEmailText] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ matched: number; unmatched: number; skipped: number } | null>(null)
  const [bulkError, setBulkError] = useState('')

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [contactList, friendSet, { data: members }, { data: invites }, { data: pool }] = await Promise.all([
      getContacts(supabase, user.id),
      getFriendIds(supabase, user.id),
      supabase.from('pool_members').select('user_id').eq('pool_id', poolId),
      supabase.from('pool_invitations').select('id, invited_user_id, status').eq('pool_id', poolId),
      supabase.from('pools').select('sport').eq('id', poolId).single(),
    ])

    setContacts(contactList)
    setFriendIds(friendSet)
    setMemberIds(new Set((members || []).map((m: any) => m.user_id)))
    const invMap: Record<string, { id: string; status: string }> = {}
    ;(invites || []).forEach((i: any) => { invMap[i.invited_user_id] = { id: i.id, status: i.status } })
    setInvitations(invMap)
    const sport = pool?.sport ? canonicalSport(pool.sport) : null
    setPoolSport(sport)

    if (sport && contactList.length > 0) {
      const { data: interests } = await supabase
        .from('user_sport_interests')
        .select('user_id')
        .eq('sport', sport)
        .in('user_id', contactList.map(c => c.userId))
      setInterestedIds(new Set((interests || []).map((i: any) => i.user_id)))
    }
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

  async function toggleFriend(contactUserId: string) {
    if (!userId) return
    if (friendIds.has(contactUserId)) {
      await removeFriend(createClient(), userId, contactUserId)
      setFriendIds(prev => { const next = new Set(prev); next.delete(contactUserId); return next })
    } else {
      const { error } = await addFriend(createClient(), userId, contactUserId)
      if (!error || (error as any).code === '23505') {
        setFriendIds(prev => new Set(prev).add(contactUserId))
      }
    }
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
        // Fire-and-forget — the in-app dashboard card is the real notification;
        // this is just an optional email nudge, don't block the UI on it.
        fetch('/api/invite/notify-pool-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId }),
        }).catch(() => {})
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

  async function sendBulkEmail() {
    const emails = [...new Set(
      emailText.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )]
    if (!emails.length) return
    setBulkSending(true)
    setBulkResult(null)
    setBulkError('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/invite/bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ poolId, emails }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBulkError(data.error || `something went wrong (${res.status})`)
        return
      }
      setBulkResult({
        matched: (data.matched || []).length,
        unmatched: (data.unmatched || []).length,
        skipped: (data.skipped || []).length,
      })
      setEmailText('')
      await load()
    } finally {
      setBulkSending(false)
    }
  }

  if (loading) return <div style={{ fontSize: '11px', color: '#aaa' }}>loading contacts...</div>

  const invitable = contacts.filter(c => !memberIds.has(c.userId) && invitations[c.userId]?.status !== 'accepted' && invitations[c.userId]?.status !== 'declined')
  const invitableIds = invitable.map(c => c.userId)

  const modeButtonStyle = {
    fontSize: '10px', padding: '4px 8px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: 10 }}>
        invite people you've pooled with before — they'll see it on their dashboard and can accept or decline.
      </div>

      {invitable.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' as const }}>
            <button style={modeButtonStyle} onClick={() => setSelected(new Set(invitableIds))}>everyone ({invitableIds.length})</button>
            <button style={modeButtonStyle} onClick={() => setSelected(new Set(invitableIds.filter(id => friendIds.has(id))))}>
              friends ({invitableIds.filter(id => friendIds.has(id)).length})
            </button>
            {poolSport && (
              <button style={modeButtonStyle} onClick={() => setSelected(new Set(invitableIds.filter(id => interestedIds.has(id))))}>
                into {sportLabel(poolSport)} ({invitableIds.filter(id => interestedIds.has(id)).length})
              </button>
            )}
            <button style={modeButtonStyle} onClick={() => setSelected(new Set())}>clear</button>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e0e0db', marginBottom: 10 }}>
            {invitable.map(c => {
              const pending = invitations[c.userId]?.status === 'pending'
              const isFriend = friendIds.has(c.userId)
              const notIntoSport = poolSport && !interestedIds.has(c.userId)
              return (
                <div key={c.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f5f5f5', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(c.userId)} onChange={() => toggle(c.userId)} />
                    <span style={{ flex: 1 }}>{c.displayName}</span>
                  </label>
                  {notIntoSport && (
                    <span title={`hasn't shown interest in ${sportLabel(poolSport!)}`} style={{ fontSize: '10px', color: '#c78a00', whiteSpace: 'nowrap' as const }}>
                      not into {sportLabel(poolSport!)}
                    </span>
                  )}
                  {pending && <span style={{ fontSize: '10px', color: '#aaa' }}>already invited</span>}
                  <button
                    onClick={() => toggleFriend(c.userId)}
                    title={isFriend ? 'remove friend' : 'mark as friend'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: isFriend ? '#C8102E' : '#ddd', padding: 0, lineHeight: 1 }}>
                    {isFriend ? '★' : '☆'}
                  </button>
                </div>
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
        </>
      )}

      {invitable.length === 0 && (
        <div style={{ fontSize: '11px', color: '#aaa', marginBottom: 10 }}>no contacts to invite yet — come back once you've pooled with more people, or invite by email below.</div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: 6 }}>or invite by email</div>
        <textarea
          value={emailText}
          onChange={e => setEmailText(e.target.value)}
          placeholder="paste emails, separated by commas or new lines"
          rows={3}
          style={{ width: '100%', border: '1px solid #e0e0db', padding: '8px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const, marginBottom: 8 }}
        />
        <button
          onClick={sendBulkEmail}
          disabled={bulkSending || !emailText.trim()}
          style={{ width: '100%', padding: '9px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: !emailText.trim() ? 'default' : 'pointer', opacity: !emailText.trim() ? 0.4 : 1, fontFamily: 'inherit' }}>
          {bulkSending ? 'sending...' : 'send email invites'}
        </button>
        {bulkError && (
          <div style={{ fontSize: '11px', color: '#C8102E', marginTop: 6 }}>✗ {bulkError}</div>
        )}
        {bulkResult && (
          <div style={{ fontSize: '11px', color: '#2d7a2d', marginTop: 6 }}>
            ✓ {bulkResult.matched} invited in-app, {bulkResult.unmatched} emailed to join
            {bulkResult.skipped > 0 && `, ${bulkResult.skipped} skipped`}
          </div>
        )}
      </div>
    </div>
  )
}
