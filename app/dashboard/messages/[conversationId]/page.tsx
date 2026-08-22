'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Msg {
  id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

export default function ConversationThreadPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.conversationId as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [myId, setMyId] = useState('')
  const [otherName, setOtherName] = useState('')
  const [otherUserId, setOtherUserId] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setMyId(user.id)

      const { data: convo } = await supabase.from('conversations').select('id, user_a, user_b').eq('id', conversationId).maybeSingle()
      if (!convo || (convo.user_a !== user.id && convo.user_b !== user.id)) { setNotFound(true); setLoading(false); return }

      const otherId = convo.user_a === user.id ? convo.user_b : convo.user_a
      setOtherUserId(otherId)
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', otherId).maybeSingle()
      setOtherName(profile?.display_name || 'unknown')

      const { data: msgs } = await supabase.from('direct_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
      setMessages(msgs || [])
      setLoading(false)

      // Mark their messages as read now that we've opened the thread
      const unreadIds = (msgs || []).filter(m => m.sender_id !== user.id && !m.read_at).map(m => m.id)
      if (unreadIds.length > 0) {
        await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      }
    }
    load()

    const supabase = createClient()
    const channel = supabase
      .channel(`dm-thread-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const msg = payload.new as Msg
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        if (msg.sender_id !== myId) {
          supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id).then(() => {})
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft('')
    const supabase = createClient()
    const { error } = await supabase.from('direct_messages').insert({ conversation_id: conversationId, sender_id: myId, body })
    if (error) { setDraft(body); console.error(error) }
    setSending(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>
  if (notFound) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>conversation not found.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <a href="/dashboard/messages" style={{ color: '#888', textDecoration: 'none', fontSize: '1.1rem' }}>←</a>
        <a href={`/dashboard/u/${otherUserId}`} style={{ fontWeight: 700, fontSize: '1.1rem', color: 'inherit', textDecoration: 'none' }}>{otherName}</a>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, border: '1px solid var(--border)', padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', margin: 'auto' }}>say hi to {otherName}.</p>
        ) : (
          messages.map(m => {
            const mine = m.sender_id === myId
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '0.5rem 0.75rem', fontSize: '0.85rem',
                  background: mine ? '#C8102E' : '#f0f0ed',
                  color: mine ? 'white' : '#111',
                  borderRadius: mine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  whiteSpace: 'pre-wrap' as const, overflowWrap: 'break-word' as const,
                }}>
                  {m.body}
                  <div style={{ fontSize: '0.65rem', marginTop: '0.2rem', opacity: 0.7 }}>
                    {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="write a message..." maxLength={4000}
          style={{ flex: 1, padding: '0.6rem 0.75rem', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '0.85rem' }} />
        <button onClick={send} disabled={!draft.trim() || sending}
          style={{ padding: '0.6rem 1.2rem', background: draft.trim() ? '#111' : '#ddd', color: 'white', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '0.85rem' }}>
          send
        </button>
      </div>
    </div>
  )
}
