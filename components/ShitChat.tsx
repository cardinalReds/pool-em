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
}

export default function ShitChat({ poolId, userId, displayName }: ShitChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data, count } = await supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(limit)
      setMessages((data || []).reverse())
      if (count !== null) setTotal(count)
    }
    load()

    const channel = supabase
      .channel(`chat-${poolId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `pool_id=eq.${poolId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
        setTotal(t => t + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, limit])

  // Scroll to bottom when new messages arrive
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
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb' }}>
          shit chat 💬
        </span>
        {total > limit && (
          <button type="button" onClick={() => setLimit(l => l + 50)}
            style={{ fontSize: '10px', color: '#C8102E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            load {Math.min(50, total - limit)} older messages ↑
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#ccc', fontSize: '12px', marginTop: 40 }}>
            no messages yet. start the shit chat 💬
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.user_id === userId
          const prevMsg = messages[i - 1]
          const showName = !prevMsg || prevMsg.user_id !== msg.user_id
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe ? 'flex-end' : 'flex-start',
              marginTop: showName && i > 0 ? 6 : 0,
            }}>
              {showName && (
                <span style={{ fontSize: '10px', color: '#aaa', marginBottom: 2, marginLeft: isMe ? 0 : 2, marginRight: isMe ? 2 : 0 }}>
                  {isMe ? 'you' : msg.display_name}
                </span>
              )}
              <div style={{
                maxWidth: '80%', padding: '7px 11px',
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
      <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 8, flexShrink: 0 }}>
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
          }}
        />
        <button type="button" onClick={sendMessage} disabled={!input.trim() || sending}
          style={{
            padding: '8px 16px',
            background: input.trim() ? '#C8102E' : '#ddd',
            color: 'white', border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            fontSize: '13px', fontFamily: 'inherit', fontWeight: 600,
          }}>
          {sending ? '...' : 'send'}
        </button>
      </div>
    </div>
  )
}

