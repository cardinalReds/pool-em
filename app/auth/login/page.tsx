'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite') || localStorage.getItem('pending_invite')
    if (invite) setInviteCode(invite)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
      window.location.href = inviteCode ? `/pool/join/${inviteCode}` : '/dashboard'
    }
  }

  return (
    <div className="card">
      <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>
        {inviteCode ? 'log in to join the pool' : 'log in'}
      </h2>
      <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
        {inviteCode ? "you've been invited" : 'welcome back'}
      </p>

      <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>email</label>
          <input className="input" type="email" placeholder="you@example.com" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>password</label>
          <input className="input" type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>
        {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem 0.75rem'}}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{width: '100%', marginTop: '0.25rem', padding: '0.85rem', fontSize: '1rem', minHeight: 48}}>
          {loading ? 'logging in...' : 'log in'}
        </button>
      </form>

      <p style={{textAlign: 'center', fontSize: '0.85rem', marginTop: '1.25rem', color: 'var(--text-dim)'}}>
        no account?{' '}
        <Link href={inviteCode ? `/auth/signup?invite=${inviteCode}` : '/auth/signup'} style={{color: 'var(--red)', fontWeight: 600}}>sign up free</Link>
      </p>
    </div>
  )
}
