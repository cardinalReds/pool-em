'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ReminderButton({ poolId, userId, userEmail }: {
  poolId: string
  userId: string
  userEmail: string
}) {
  const [hours, setHours] = useState(2)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [existing, setExisting] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('reminders')
        .select('hours_before')
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .maybeSingle()
      if (data) {
        setHours(data.hours_before)
        setExisting(data.hours_before)
      }
    }
    load()
  }, [poolId, userId])

  async function handleSave() {
    setStatus('saving')
    const supabase = createClient()
    const { error } = await supabase
      .from('reminders')
      .upsert({
        pool_id: poolId,
        user_id: userId,
        email: userEmail,
        hours_before: hours,
      }, { onConflict: 'user_id,pool_id' })

    if (error) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      setExisting(hours)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  async function handleRemove() {
    const supabase = createClient()
    await supabase.from('reminders').delete().eq('pool_id', poolId).eq('user_id', userId)
    setExisting(null)
    setStatus('idle')
  }

  return (
    <div>
      <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', marginBottom: '6px'}}>remind me</div>
      
      {existing !== null && status === 'idle' ? (
        <div>
          <div style={{fontSize: '11px', color: '#2d7a2d', marginBottom: '6px'}}>
            ✓ reminder set — {existing}h before kickoff
          </div>
          <div style={{fontSize: '11px', color: '#888', marginBottom: '8px', wordBreak: 'break-all'}}>{userEmail}</div>
          <div style={{display: 'flex', gap: '4px'}}>
            <button onClick={() => setExisting(null)}
              style={{flex: 1, fontSize: '11px', padding: '4px 8px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit'}}>
              change
            </button>
            <button onClick={handleRemove}
              style={{fontSize: '11px', padding: '4px 8px', background: 'white', color: '#C8102E', border: '1px solid #C8102E', cursor: 'pointer', fontFamily: 'inherit'}}>
              remove
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{fontSize: '11px', color: '#555', marginBottom: '8px'}}>
            email me {hours}h before kickoff
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
            <input type="range" min="1" max="24" value={hours}
              onChange={e => setHours(Number(e.target.value))}
              style={{flex: 1}} />
            <span style={{fontSize: '12px', fontWeight: 600, minWidth: '28px', color: '#111'}}>{hours}h</span>
          </div>
          <div style={{fontSize: '10px', color: '#aaa', marginBottom: '8px', wordBreak: 'break-all'}}>{userEmail}</div>
          <button onClick={handleSave} disabled={status === 'saving'}
            style={{
              fontSize: '11px', padding: '5px 10px', width: '100%', border: 'none',
              cursor: status === 'saving' ? 'default' : 'pointer', fontFamily: 'inherit',
              background: status === 'saved' ? '#2d7a2d' : status === 'error' ? '#C8102E' : '#111',
              color: 'white', transition: 'background 0.2s',
            }}>
            {status === 'saving' ? 'saving...' : status === 'saved' ? 'reminder set ✓' : status === 'error' ? 'error — try again' : 'set reminder'}
          </button>
        </div>
      )}
    </div>
  )
}
