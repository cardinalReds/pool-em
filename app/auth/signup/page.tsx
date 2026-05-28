'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="card">
      <h2 className="font-display text-3xl text-chalk mb-1 tracking-wider">CREATE ACCOUNT</h2>
      <p className="text-sm mb-8" style={{color: 'var(--chalk-dim)'}}>Join Pool'em — it's free</p>

      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-display tracking-widest mb-2" style={{color: 'var(--chalk-dim)'}}>YOUR NAME</label>
          <input
            className="input-chalk"
            type="text"
            placeholder="What your friends call you"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-display tracking-widest mb-2" style={{color: 'var(--chalk-dim)'}}>EMAIL</label>
          <input
            className="input-chalk"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-display tracking-widest mb-2" style={{color: 'var(--chalk-dim)'}}>PASSWORD</label>
          <input
            className="input-chalk"
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2">{error}</p>
        )}

        <button className="btn-turf w-full mt-2" type="submit" disabled={loading}>
          {loading ? 'CREATING...' : 'CREATE ACCOUNT'}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{color: 'var(--chalk-dim)'}}>
        Already have an account?{' '}
        <Link href="/auth/login" className="text-turf-400 hover:text-turf-500">
          Log in
        </Link>
      </p>
    </div>
  )
}
