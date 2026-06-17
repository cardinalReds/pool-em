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
  reply_to: string | null
  reactions: Record<string, string[]> | null
}

interface ShitChatProps {
  poolId: string
  userId: string
  displayName: string
}

const REACTION_EMOJIS = ['👍', '😂', '❤️', '😮', '😢', '🔥']

export default function ShitChat({ poolId, userId, displayName }: ShitChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
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
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `pool_id=eq.${poolId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, limit])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    const supabase = createClient()
    await supabase.from('messages').insert({
      pool_id: poolId,
      user_id: userId,
      display_name: displayName,
      content: input.trim(),
      reply_to: replyingTo?.id ?? null,
    })
    setInput('')
    setReplyingTo(null)
    setSending(false)
    inputRef.current?.focus()
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const supabase = createClient()
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return
    const reactions: Record<string, string[]> = { ...(msg.reactions || {}) }
    const users = new Set(reactions[emoji] || [])
    if (users.has(userId)) {
      users.delete(userId)
    } else {
      users.add(userId)
    }
    if (users.size === 0) {
      delete reactions[emoji]
    } else {
      reactions[emoji] = Array.from(users)
    }
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m))
    setReactionPickerFor(null)
    await supabase.from('messages').update({ reactions }).eq('id', messageId)
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  }

  function getRepliedMessage(replyToId: string | null) {
    if (!replyToId) return null
    return messages.find(m => m.id === replyToId) || null
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
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

      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#ccc', fontSize: '12px', marginTop: 40 }}>
            no messages yet. start the shit chat 💬
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.user_id === userId
          const prevMsg = messages[i - 1]
          const showName = !prevMsg || prevMsg.user_id !== msg.user_id
          const repliedMsg = getRepliedMessage(msg.reply_to)
          const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0

          return (
            <div key={msg.id}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                marginTop: showName && i > 0 ? 10 : 2,
                position: 'relative' as const,
              }}
            >
              {showName && (
                <span style={{ fontSize: '10px', color: '#aaa', marginBottom: 2, marginLeft: isMe ? 0 : 2, marginRight: isMe ? 2 : 0 }}>
                  {isMe ? 'you' : msg.display_name}
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                {isMe && (
                  <MsgActions onReply={() => { setReplyingTo(msg); inputRef.current?.focus() }}
                    onReact={() => setReactionPickerFor(p => p === msg.id ? null : msg.id)}
                    pickerOpen={reactionPickerFor === msg.id} onPick={(emoji) => toggleReaction(msg.id, emoji)} />
                )}

                <div>
                  {repliedMsg && (
                    <div style={{
                      fontSize: '11px', color: '#888', background: isMe ? 'rgba(255,255,255,0.15)' : '#e8e8e8',
                      padding: '4px 8px', borderRadius: '8px 8px 0 0', marginBottom: -2,
                      maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      borderLeft: '2px solid #C8102E',
                    }}>
                      <b>{repliedMsg.user_id === userId ? 'you' : repliedMsg.display_name}:</b> {repliedMsg.content}
                    </div>
                  )}
                  <div style={{
                    maxWidth: 260, padding: '7px 11px',
                    background: isMe ? '#C8102E' : '#f0f0f0',
                    color: isMe ? 'white' : '#111',
                    borderRadius: repliedMsg
                      ? (isMe ? '0 2px 2px 12px' : '0 12px 12px 2px')
                      : (isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'),
                    fontSize: '13px', lineHeight: 1.4,
                    wordBreak: 'break-word' as const,
                  }}>
                    {msg.content}
                  </div>
                </div>

                {!isMe && (
                  <MsgActions onReply={() => { setReplyingTo(msg); inputRef.current?.focus() }}
                    onReact={() => setReactionPickerFor(p => p === msg.id ? null : msg.id)}
                    pickerOpen={reactionPickerFor === msg.id} onPick={(emoji) => toggleReaction(msg.id, emoji)} />
                )}
              </div>

              {hasReactions && (
                <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' as const, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  {Object.entries(msg.reactions!).map(([emoji, userIds]) => (
                    <button key={emoji} type="button" onClick={() => toggleReaction(msg.id, emoji)}
                      style={{
                        fontSize: '11px', padding: '1px 6px', borderRadius: 10,
                        border: userIds.includes(userId) ? '1px solid #C8102E' : '1px solid #ddd',
                        background: userIds.includes(userId) ? '#fdeaec' : 'white',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                      <span>{emoji}</span>
                      <span style={{ color: '#888' }}>{userIds.length}</span>
                    </button>
                  ))}
                </div>
              )}

              <span style={{ fontSize: '9px', color: '#ccc', marginTop: 2, marginRight: isMe ? 2 : 0, marginLeft: isMe ? 0 : 2 }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {replyingTo && (
        <div style={{ padding: '8px 16px', background: '#f7f7f7', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            replying to <b>{replyingTo.user_id === userId ? 'you' : replyingTo.display_name}</b>: {replyingTo.content}
          </div>
          <button type="button" onClick={() => setReplyingTo(null)}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px', flexShrink: 0, marginLeft: 8 }}>
            ✕
          </button>
        </div>
      )}

      <div style={{ padding: '12px', borderTop: '1px solid #eee', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
          placeholder="say something..."
          style={{
            flex: '1 1 auto', minWidth: 0, padding: '8px 10px', border: '1px solid #ddd',
            fontSize: '13px', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button type="button" onClick={sendMessage} disabled={!input.trim() || sending}
          style={{
            flexShrink: 0,
            padding: '8px 12px',
            background: input.trim() ? '#C8102E' : '#ddd',
            color: 'white', border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            fontSize: '13px', fontFamily: 'inherit', fontWeight: 600,
            whiteSpace: 'nowrap' as const,
          }}>
          {sending ? '...' : 'send'}
        </button>
      </div>
    </div>
  )
}

function MsgActions({ onReply, onReact, pickerOpen, onPick }: {
  onReply: () => void
  onReact: () => void
  pickerOpen: boolean
  onPick: (emoji: string) => void
}) {
  return (
    <div style={{ position: 'relative' as const, display: 'flex', gap: 2, opacity: 0.5 }}>
      <button type="button" onClick={onReact} title="react"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 2 }}>
        😊
      </button>
      <button type="button" onClick={onReply} title="reply"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 2 }}>
        ↩
      </button>
      {pickerOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          background: 'white', border: '1px solid #ddd', borderRadius: 8,
          padding: '4px 6px', display: 'flex', gap: 4, zIndex: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          {REACTION_EMOJIS.map(emoji => (
            <button key={emoji} type="button" onClick={() => onPick(emoji)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: 2 }}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
