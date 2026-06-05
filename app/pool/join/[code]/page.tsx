'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function JoinPoolPage({ params }: { params: { code: string } }) {
  const [pool, setPool] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      localStorage.setItem('pending_invite', params.code)

      const { data: pool } = await supabase.from('pools').select('*').eq('invite_code', params.code).single()
      if (!pool) { setNotFound(true); setLoading(false); return }
      setPool(pool)

      if (session?.user) {
        setUser(session.user)
        const { data: existing } = await supabase.from('pool_members').select('id').eq('pool_id', pool.id).eq('user_id', session.user.id).single()
        if (existing) { localStorage.removeItem('pending_invite'); window.location.href = `/pool/${pool.id}`; return }
      }
      setLoading(false)
    }
    load()
  }, [params.code])

  async function handleJoin() {
    if (!user) { window.location.href = `/auth/signup?invite=${params.code}`; return }
    setJoining(true)
    const supabase = createClient()
    await supabase.from('pool_members').insert({
      pool_id: pool.id, user_id: user.id,
      display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player',
    })
    localStorage.removeItem('pending_invite')
    window.location.href = `/pool/${pool.id}`
  }

  if (loading) return <div style={{minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', color: 'var(--text-dim)'}}>loading...</div>

  if (notFound) return (
    <div style={{minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div className="card" style={{maxWidth: 360, textAlign: 'center'}}>
        <p style={{fontWeight: 600, marginBottom: '0.5rem'}}>invalid invite link</p>
        <p style={{color: 'var(--text-dim)', fontSize: '0.875rem'}}>this link doesn't exist or has expired.</p>
      </div>
    </div>
  )

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0]

  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 2rem'}}>
        <span style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)'}}>pool'em</span>
      </div>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem'}}>
        <div className="card" style={{maxWidth: 380, width: '100%'}}>
          <p style={{fontSize: '0.7rem', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', marginBottom: '0.5rem'}}>you've been invited</p>
          <h2 style={{fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.4rem'}}>{pool.name}</h2>
          <p style={{color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '1.5rem'}}>
            {user ? <>joining as <strong style={{color: 'var(--text)'}}>{displayName}</strong></> : <>create an account or log in to join.</>}
          </p>
          {user ? (
            <button className="btn-primary" onClick={handleJoin} disabled={joining} style={{width: '100%', padding: '0.6rem'}}>
              {joining ? 'joining...' : "let's go →"}
            </button>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
              <a href={`/auth/signup?invite=${params.code}`}><button className="btn-primary" style={{width: '100%', padding: '0.6rem'}}>create account</button></a>
              <a href={`/auth/login?invite=${params.code}`}><button className="btn-secondary" style={{width: '100%', padding: '0.6rem'}}>log in</button></a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
