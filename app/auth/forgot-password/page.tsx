'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Goes through our own API route (Resend), not supabase.auth.resetPasswordForEmail —
    // keeps password reset consistent with how every other email in this app is sent.
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    // Show the same success state whether or not the email exists — don't let this
    // form be used to check which emails have accounts.
    if (res.ok) { setSent(true) } else { setError('something went wrong — try again') }
  }

  if (sent) {
    return (
      <div className="card">
        <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>check your email</h2>
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
          if there's an account for {email}, a reset link is on its way. it'll expire after a while, so use it soon.
        </p>
        <Link href="/auth/login" style={{color: 'var(--red)', fontWeight: 600, fontSize: '0.85rem'}}>back to log in</Link>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>reset your password</h2>
      <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
        enter your email and we'll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>email</label>
          <input className="input" type="email" placeholder="you@example.com" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>

        {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem 0.75rem'}}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{width: '100%', marginTop: '0.25rem', padding: '0.85rem', fontSize: '1rem', minHeight: 48}}>
          {loading ? 'sending...' : 'send reset link'}
        </button>
      </form>

      <p style={{textAlign: 'center', fontSize: '0.85rem', marginTop: '1.25rem', color: 'var(--text-dim)'}}>
        <Link href="/auth/login" style={{color: 'var(--red)', fontWeight: 600}}>back to log in</Link>
      </p>
    </div>
  )
}
