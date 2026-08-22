'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ConversationRow {
  id: string
  otherUserId: string
  otherName: string
  otherAvatar: string | null
  lastBody: string
  lastAt: string
  unread: number
}

export default function MessagesInboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<ConversationRow[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: convos } = await supabase
        .from('conversations')
        .select('id, user_a, user_b, created_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (!convos || convos.length === 0) { setLoading(false); return }

      const otherIds = convos.map(c => (c.user_a === user.id ? c.user_b : c.user_a))
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherIds)
      const profileMap = new Map((profiles || []).map(p => [p.id, p]))

      const rows = await Promise.all(convos.map(async c => {
        const otherUserId = c.user_a === user.id ? c.user_b : c.user_a
        const profile = profileMap.get(otherUserId)
        const [{ data: lastMsg }, { count: unread }] = await Promise.all([
          supabase.from('direct_messages').select('body, created_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('direct_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', c.id).is('read_at', null).neq('sender_id', user.id),
        ])
        return {
          id: c.id,
          otherUserId,
          otherName: profile?.display_name || 'unknown',
          otherAvatar: profile?.avatar_url || null,
          lastBody: lastMsg?.body || '',
          lastAt: lastMsg?.created_at || c.created_at,
          unread: unread || 0,
        }
      }))

      rows.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
      setConversations(rows)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  return (
    <div>
      <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1rem' }}>messages</h1>
      {conversations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          no conversations yet — start one from a pool-mate's profile.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)' }}>
          {conversations.map((c, i) => (
            <a key={c.id} href={`/dashboard/messages/${c.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-light)',
                textDecoration: 'none', color: 'inherit',
                background: c.unread > 0 ? '#fff5f5' : 'white',
              }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: '#f0f0ed', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {c.otherAvatar
                  ? <img src={c.otherAvatar} alt={c.otherName} style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
                  : <span style={{ fontSize: '1rem', fontWeight: 700, color: '#bbb' }}>{c.otherName.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: c.unread > 0 ? 700 : 600, fontSize: '0.88rem' }}>{c.otherName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {c.lastBody || 'no messages yet'}
                </div>
              </div>
              {c.unread > 0 && (
                <span style={{ background: '#C8102E', color: 'white', fontSize: '0.7rem', fontWeight: 700, borderRadius: 10, padding: '2px 7px', flexShrink: 0 }}>
                  {c.unread}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
