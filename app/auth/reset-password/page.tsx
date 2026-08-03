'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    // Clicking the emailed link lands here with a recovery token in the URL — the SDK
    // picks it up automatically and fires PASSWORD_RECOVERY once the session is set.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // Belt-and-suspenders: if the event already fired before this listener attached,
    // a session will already be present.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (ready) return
    const timeout = setTimeout(() => setExpired(true), 5000)
    return () => clearTimeout(timeout)
  }, [ready])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError("passwords don't match"); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1500)
  }

  if (expired && !ready) {
    return (
      <div className="card">
        <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>link expired</h2>
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
          this reset link is invalid or has expired — request a new one.
        </p>
        <Link href="/auth/forgot-password" style={{color: 'var(--red)', fontWeight: 600, fontSize: '0.85rem'}}>request a new link</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="card">
        <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>password updated ✓</h2>
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem'}}>taking you to your dashboard...</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="card">
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem'}}>verifying link...</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>set a new password</h2>
      <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>choose something you'll remember this time.</p>

      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>new password</label>
          <input className="input" type="password" placeholder="min 6 characters" value={password}
            onChange={e => setPassword(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>confirm password</label>
          <input className="input" type="password" placeholder="min 6 characters" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>

        {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem 0.75rem'}}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{width: '100%', marginTop: '0.25rem', padding: '0.85rem', fontSize: '1rem', minHeight: 48}}>
          {loading ? 'updating...' : 'update password'}
        </button>
      </form>
    </div>
  )
}
