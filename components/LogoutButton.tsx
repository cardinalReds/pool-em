'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs font-display tracking-widest transition-colors"
      style={{color: 'var(--chalk-dim)'}}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--chalk)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--chalk-dim)')}
    >
      LOG OUT
    </button>
  )
}
