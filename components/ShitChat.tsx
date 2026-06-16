'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  pool_id: string
  user_id: string
  display_name: string
  content: string
  created_at: string
}

interface ShitChatProps {
  poolId: string
  userId: string
  displayName: string
  limit?: number
}

export default function ShitChat({ poolId, userId, displayName, limit = 50 }: ShitChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()

    // Load messages
    async function load() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(showMore ? 100 : limit)
      setMessages((data || []).reverse())
    }
    load()

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${poolId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `pool_id=eq.${poolId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, limit, showMore])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    const supabase = createClient()
    await supabase.from('messages').insert({
      pool_id: poolId,
      user_id: userId,
      display_name: displayName,
      content: input.trim(),
    })
    setInput('')
    setSending(false)
    inputRef.current?.focus()
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb' }}>
          shit chat 💬
        </span>
        <button type="button" onClick={() => setShowMore(p => !p)}
          style={{ fontSize: '10px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {showMore ? 'show less' : 'show more'}
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#ccc', fontSize: '12px', marginTop: 40 }}>
            no messages yet. start the shit chat 💬
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.user_id === userId
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe ? 'flex-end' : 'flex-start',
            }}>
              {!isMe && (
                <span style={{ fontSize: '10px', color: '#aaa', marginBottom: 2, marginLeft: 2 }}>{msg.display_name}</span>
              )}
              <div style={{
                maxWidth: '80%', padding: '8px 12px',
                background: isMe ? '#C8102E' : '#f0f0f0',
                color: isMe ? 'white' : '#111',
                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                fontSize: '13px', lineHeight: 1.4,
              }}>
                {msg.content}
              </div>
              <span style={{ fontSize: '9px', color: '#ccc', marginTop: 2, marginRight: isMe ? 2 : 0, marginLeft: isMe ? 0 : 2 }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
          placeholder="say something..."
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid #ddd',
            fontSize: '13px', fontFamily: 'inherit', outline: 'none',
            borderRadius: 0,
          }}
        />
        <button type="button" onClick={sendMessage} disabled={!input.trim() || sending}
          style={{
            padding: '8px 16px', background: input.trim() ? '#C8102E' : '#ddd',
            color: 'white', border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            fontSize: '13px', fontFamily: 'inherit', fontWeight: 600,
          }}>
          {sending ? '...' : 'send'}
        </button>
      </div>
    </div>
  )
}
