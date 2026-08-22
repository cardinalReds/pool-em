'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState('')
  const [userId, setUserId] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || '')
        setUserId(user.id)
      }
    }
    load()
  }, [])

  // Unread DM count — recomputed (not incremented) on any relevant change, so it stays
  // correct even if messages get read from another tab/device.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    let conversationIds: string[] = []

    async function refreshCount() {
      if (conversationIds.length === 0) { setUnreadCount(0); return }
      const { count } = await supabase
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .is('read_at', null)
        .neq('sender_id', userId)
      setUnreadCount(count || 0)
    }

    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: convos } = await supabase.from('conversations').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`)
      conversationIds = (convos || []).map(c => c.id)
      await refreshCount()
      if (conversationIds.length === 0) return

      channel = supabase
        .channel(`dm-unread-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=in.(${conversationIds.join(',')})` }, refreshCount)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=in.(${conversationIds.join(',')})` }, refreshCount)
        .subscribe()
    }
    init()

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [userId])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50}}>
        <Link href="/dashboard" style={{fontWeight: 700, fontSize: '1.4rem', color: 'var(--red)', textDecoration: 'none'}}>pool'em</Link>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
          <Link href="/dashboard/profile" style={{fontSize: '0.8rem', color: 'var(--text-dim)', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>your record</Link>
          <Link href="/dashboard/settings" style={{fontSize: '0.8rem', color: 'var(--text-dim)', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>settings</Link>
          <Link href="/dashboard/messages"
            style={{position: 'relative', fontSize: '0.8rem', color: unreadCount > 0 ? 'var(--red)' : 'var(--text-dim)', fontWeight: unreadCount > 0 ? 700 : 400, padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>
            messages
            {unreadCount > 0 && (
              <span style={{marginLeft: 4, background: '#C8102E', color: 'white', fontSize: '0.6rem', fontWeight: 700, borderRadius: 8, padding: '1px 5px', lineHeight: 1.3}}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <Link href={userId ? `/dashboard/u/${userId}` : '/dashboard'} style={{fontSize: '0.8rem', color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>{displayName}</Link>
          <button onClick={handleLogout} style={{fontSize: '0.8rem', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', minHeight: 44}}>log out</button>
        </div>
      </div>
      <main style={{maxWidth: 900, margin: '0 auto', padding: '1.25rem 1rem'}}>
        {children}
      </main>
    </div>
  )
}
