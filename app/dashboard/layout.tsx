'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player')
      }
    }
    load()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 border-b" style={{background: 'var(--pitch)', borderBottomColor: 'rgba(245,240,232,0.1)'}}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="font-display text-2xl text-turf-400 tracking-widest">
            POOL'EM
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-sm" style={{color: 'var(--chalk-dim)'}}>{displayName}</span>
            <button
              onClick={handleLogout}
              className="text-xs font-display tracking-widest"
              style={{color: 'var(--chalk-dim)'}}
            >
              LOG OUT
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  )
}
