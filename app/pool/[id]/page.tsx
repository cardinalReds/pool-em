'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RULE_PACKAGES } from '@/types'
import InviteLink from '@/components/InviteLink'
import FixturesList from '@/components/FixturesList'

function getSessionFromCookie() {
  try {
    const cookieName = 'sb-bsrvqpggsxyrxatdtnqf-auth-token'
    const match = document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))
    if (!match) return null
    const value = decodeURIComponent(match.split('=').slice(1).join('='))
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function PoolPage({ params }: { params: { id: string } }) {
  const [pool, setPool] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      
      // Try getUser first, fall back to cookie
      let currentUser = null
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (authUser) {
        currentUser = authUser
      } else {
        // Try to restore session from cookie
        const session = getSessionFromCookie()
        if (session?.access_token) {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          })
          const { data: { user: restored } } = await supabase.auth.getUser()
          currentUser = restored
        }
      }

      if (!currentUser) {
        window.location.href = '/auth/login'
        return
      }
      setUser(currentUser)

      const { data: pool } = await supabase
        .from('pools')
        .select('*')
        .eq('id', params.id)
        .single()

      if (!pool) { setNotFound(true); setLoading(false); return }
      setPool(pool)

      const { data: membership } = await supabase
        .from('pool_members')
        .select('id')
        .eq('pool_id', pool.id)
        .eq('user_id', currentUser.id)
        .single()

      if (!membership) {
        window.location.href = `/pool/join/${pool.invite_code}`
        return
      }

      const { data: members } = await supabase
        .from('pool_members')
        .select('*')
        .eq('pool_id', pool.id)

      const { data: scores } = await supabase
        .from('predictions')
        .select('user_id, points_earned')
        .eq('pool_id', pool.id)

      const pointsMap: Record<string, number> = {}
      scores?.forEach(s => {
        if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned
      })

      const lb = (members || [])
        .map(m => ({ ...m, points: pointsMap[m.user_id] || 0 }))
        .sort((a, b) => b.points - a.points)

      setLeaderboard(lb)
      setLoading(false)
    }
    load()
  }, [params.id])

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <span className="font-display text-turf-400 tracking-widest animate-pulse">LOADING...</span>
    </div>
  )

  if (notFound) return (
    <div className="text-center py-24">
      <h2 className="font-display text-3xl text-chalk">POOL NOT FOUND</h2>
    </div>
  )

  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  const isAdmin = pool.admin_id === user?.id
  const inviteUrl = `${window.location.origin}/pool/join/${pool.invite_code}`

  return (
    <div>
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="badge text-turf-400 text-xs">{pool.tournament_scope?.replace('_', ' ').toUpperCase()}</span>
          <span className="badge text-xs" style={{color: 'var(--chalk-dim)'}}>{pkg?.name}</span>
          {isAdmin && <span className="badge text-amber-400 text-xs">ADMIN</span>}
        </div>
        <h1 className="font-display text-5xl md:text-6xl text-chalk tracking-wider">{pool.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-display text-2xl text-chalk tracking-wider mb-4">LEADERBOARD</h2>
            <div className="flex flex-col gap-1">
              {leaderboard.map((member, i) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 px-3"
                  style={{
                    background: member.user_id === user?.id ? 'rgba(34,197,94,0.08)' : 'transparent',
                    borderLeft: member.user_id === user?.id ? '2px solid var(--turf)' : '2px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg w-6 text-center" style={{color: i === 0 ? 'var(--amber)' : 'var(--chalk-dim)'}}>
                      {i + 1}
                    </span>
                    <span className="text-sm">{member.display_name}</span>
                  </div>
                  <span className="font-display text-xl text-turf-400">{member.points}</span>
                </div>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="card mt-4">
              <h3 className="font-display text-lg text-chalk tracking-wider mb-3">INVITE LINK</h3>
              <InviteLink url={inviteUrl} />
              <p className="text-xs mt-2" style={{color: 'var(--chalk-dim)'}}>Share this with anyone you want to invite.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {user && (
            <FixturesList
              poolId={pool.id}
              userId={user.id}
              packageId={pool.package_id}
              deadlineType={pool.deadline_type}
              scope={pool.tournament_scope}
            />
          )}
        </div>
      </div>
    </div>
  )
}
