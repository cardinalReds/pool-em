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

      // Save invite code to localStorage so we can redirect after login
      localStorage.setItem('pending_invite', params.code)

      const { data: pool } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', params.code)
        .single()

      if (!pool) { setNotFound(true); setLoading(false); return }
      setPool(pool)

      if (session?.user) {
        setUser(session.user)
        // Check if already a member
        const { data: existing } = await supabase
          .from('pool_members')
          .select('id')
          .eq('pool_id', pool.id)
          .eq('user_id', session.user.id)
          .single()

        if (existing) {
          localStorage.removeItem('pending_invite')
          window.location.href = `/pool/${pool.id}`
          return
        }
      }

      setLoading(false)
    }
    load()
  }, [params.code])

  async function handleJoin() {
    if (!user) {
      window.location.href = `/auth/signup?invite=${params.code}`
      return
    }

    setJoining(true)
    const supabase = createClient()
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player'

    await supabase.from('pool_members').insert({
      pool_id: pool.id,
      user_id: user.id,
      display_name: displayName,
    })

    localStorage.removeItem('pending_invite')
    window.location.href = `/pool/${pool.id}`
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="font-display text-turf-400 tracking-widest animate-pulse">LOADING...</span>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card text-center max-w-md">
        <div className="font-display text-5xl mb-4">🚫</div>
        <h2 className="font-display text-3xl text-chalk tracking-wider mb-2">INVALID LINK</h2>
        <p style={{color: 'var(--chalk-dim)'}}>This invite link doesn't exist or has expired.</p>
      </div>
    </div>
  )

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0]

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center">
        <div className="badge text-turf-400 text-xs inline-block mb-4">YOU'VE BEEN INVITED</div>
        <h2 className="font-display text-4xl text-chalk tracking-wider mb-2">{pool.name}</h2>
        <p className="mb-8" style={{color: 'var(--chalk-dim)'}}>
          {user
            ? <>You're joining as <strong className="text-chalk">{displayName}</strong></>
            : <>Create an account or log in to join this pool.</>
          }
        </p>
        {user ? (
          <button className="btn-turf w-full text-lg" onClick={handleJoin} disabled={joining}>
            {joining ? 'JOINING...' : "LET'S GO →"}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <a href={`/auth/signup?invite=${params.code}`}>
              <button className="btn-turf w-full text-lg">CREATE ACCOUNT</button>
            </a>
            <a href={`/auth/login?invite=${params.code}`}>
              <button className="btn-ghost w-full text-lg">LOG IN</button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
