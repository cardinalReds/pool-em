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
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (inviteCode) {
        window.location.href = `/pool/join/${inviteCode}`
      } else {
        window.location.href = '/dashboard'
      }
    }
  }

  return (
    <div className="card">
      <h2 className="font-display text-3xl text-chalk mb-1 tracking-wider">WELCOME BACK</h2>
      <p className="text-sm mb-8" style={{color: 'var(--chalk-dim)'}}>
        {inviteCode ? "Log in to join the pool" : "Log in to your Pool'em account"}
      </p>
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-display tracking-widest mb-2" style={{color: 'var(--chalk-dim)'}}>EMAIL</label>
          <input className="input-chalk" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-display tracking-widest mb-2" style={{color: 'var(--chalk-dim)'}}>PASSWORD</label>
          <input className="input-chalk" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2">{error}</p>}
        <button className="btn-turf w-full mt-2" type="submit" disabled={loading}>
          {loading ? 'LOGGING IN...' : 'LOG IN'}
        </button>
      </form>
      <p className="text-center text-sm mt-6" style={{color: 'var(--chalk-dim)'}}>
        No account?{' '}
        <Link href={inviteCode ? `/auth/signup?invite=${inviteCode}` : '/auth/signup'} className="text-turf-400 hover:text-turf-500">
          Sign up free
        </Link>
      </p>
    </div>
  )
}
