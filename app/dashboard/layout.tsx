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
      if (user) setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || '')
    }
    load()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50}}>
        <Link href="/dashboard" style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)'}}>pool'em</Link>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
          <Link href="/dashboard/pools" style={{fontSize: '0.8rem', color: 'var(--text-dim)', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>browse pools</Link>
          <Link href="/dashboard/profile" style={{fontSize: '0.8rem', color: 'var(--text-dim)', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>your record</Link>
          <Link href="/dashboard/settings" style={{fontSize: '0.8rem', color: 'var(--text-dim)', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center'}}>settings</Link>
          <span style={{fontSize: '0.8rem', color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{displayName}</span>
          <button onClick={handleLogout} style={{fontSize: '0.8rem', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', minHeight: 44}}>log out</button>
        </div>
      </div>
      <main style={{maxWidth: 900, margin: '0 auto', padding: '1.25rem 1rem'}}>
        {children}
      </main>
    </div>
  )
}
