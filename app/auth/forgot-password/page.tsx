'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'code' | 'done'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    // Show the same next step whether or not the email exists — don't let this form be
    // used to check which emails have accounts.
    setStep('code')
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError("passwords don't match"); return }

    setLoading(true)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
    if (verifyError) {
      setLoading(false)
      setError('that code is invalid or expired — request a new one')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) { setError(updateError.message); return }
    setStep('done')
    setTimeout(() => { window.location.href = '/dashboard' }, 1500)
  }

  if (step === 'done') {
    return (
      <div className="card">
        <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>password updated ✓</h2>
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem'}}>taking you to your dashboard...</p>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div className="card">
        <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>enter your code</h2>
        <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
          if there's an account for {email}, a 6-digit code is on its way — enter it below along with your new password.
        </p>

        <form onSubmit={handleReset} style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          <div>
            <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>code</label>
            <input className="input" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code}
              onChange={e => setCode(e.target.value)} required
              style={{fontSize: '16px', padding: '0.65rem 0.75rem', letterSpacing: '0.2em'}} />
          </div>
          <div>
            <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>new password</label>
            <input className="input" name="new-password" type="password" autoComplete="new-password" placeholder="min 6 characters" value={password}
              onChange={e => setPassword(e.target.value)} required
              style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
          </div>
          <div>
            <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>confirm password</label>
            <input className="input" name="confirm-password" type="password" autoComplete="new-password" placeholder="min 6 characters" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} required
              style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
          </div>

          {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem 0.75rem'}}>{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}
            style={{width: '100%', marginTop: '0.25rem', padding: '0.85rem', fontSize: '1rem', minHeight: 48}}>
            {loading ? 'updating...' : 'update password'}
          </button>
        </form>

        <p style={{textAlign: 'center', fontSize: '0.85rem', marginTop: '1.25rem', color: 'var(--text-dim)'}}>
          <button type="button" onClick={() => setStep('request')} style={{background: 'none', border: 'none', color: 'var(--red)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit'}}>
            wrong email? start over
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>reset your password</h2>
      <p style={{color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1.5rem'}}>
        enter your email and we'll send you a reset code.
      </p>

      <form onSubmit={handleRequest} style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
        <div>
          <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem', color: 'var(--text-dim)'}}>email</label>
          <input className="input" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={{fontSize: '16px', padding: '0.65rem 0.75rem'}} />
        </div>

        {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem 0.75rem'}}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{width: '100%', marginTop: '0.25rem', padding: '0.85rem', fontSize: '1rem', minHeight: 48}}>
          {loading ? 'sending...' : 'send reset code'}
        </button>
      </form>

      <p style={{textAlign: 'center', fontSize: '0.85rem', marginTop: '1.25rem', color: 'var(--text-dim)'}}>
        <Link href="/auth/login" style={{color: 'var(--red)', fontWeight: 600}}>back to log in</Link>
      </p>
    </div>
  )
}
