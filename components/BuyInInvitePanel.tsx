'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Invite { id: string; token: string; used_by: string | null; used_at: string | null; created_at: string | null }

export default function BuyInInvitePanel({ poolId }: { poolId: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('pool_invites').select('id, token, used_by, used_at, created_at').eq('pool_id', poolId).order('created_at', { ascending: false })
    setInvites(data || [])
    const usedByIds = [...new Set((data || []).filter(i => i.used_by).map(i => i.used_by as string))]
    if (usedByIds.length > 0) {
      const { data: members } = await supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId).in('user_id', usedByIds)
      const map: Record<string, string> = {}
      ;(members || []).forEach((m: any) => { map[m.user_id] = m.display_name })
      setNames(map)
    }
  }

  useEffect(() => { load() }, [poolId])

  async function generateInvite() {
    setGenerating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(false); return }
    const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
    await supabase.from('pool_invites').insert({ pool_id: poolId, token, created_by: user.id })
    await load()
    setGenerating(false)
  }

  async function copyLink(token: string, id: string) {
    const url = `${origin}/pool/join/${token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const pending = invites.filter(i => !i.used_by)
  const used = invites.filter(i => i.used_by)

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: 10 }}>
        buy-in pools need every invite to come from you — generate a one-time link per person. each link only works once.
      </div>
      <button onClick={generateInvite} disabled={generating}
        style={{ width: '100%', padding: '9px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
        {generating ? 'generating...' : '+ generate invite link'}
      </button>

      {pending.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, marginBottom: 6 }}>pending ({pending.length})</div>
          {pending.map(inv => (
            <div key={inv.id} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input readOnly value={`${origin}/pool/join/${inv.token}`} onClick={e => (e.target as HTMLInputElement).select()}
                style={{ fontSize: '10px', border: '1px solid #ddd', padding: '5px 6px', flex: 1, minWidth: 0, color: '#888', background: '#fafafa', fontFamily: 'inherit' }} />
              <button onClick={() => copyLink(inv.token, inv.id)}
                style={{ fontSize: '10px', padding: '5px 10px', background: 'white', color: '#111', border: '1px solid #ddd', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
                {copiedId === inv.id ? '✓ copied' : 'copy'}
              </button>
            </div>
          ))}
        </div>
      )}

      {used.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, marginBottom: 6 }}>used ({used.length})</div>
          {used.map(inv => (
            <div key={inv.id} style={{ fontSize: '11px', color: '#555', marginBottom: 4 }}>
              ✓ {names[inv.used_by!] || 'joined'} · {inv.used_at ? new Date(inv.used_at).toLocaleDateString() : ''}
            </div>
          ))}
        </div>
      )}

      {invites.length === 0 && (
        <div style={{ fontSize: '10px', color: '#aaa' }}>no invite links generated yet</div>
      )}
    </div>
  )
}
