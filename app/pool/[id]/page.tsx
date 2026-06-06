'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RULE_PACKAGES } from '@/types'
import FixturesList from '@/components/FixturesList'
import ReminderButton from '@/components/ReminderButton'

function getSessionFromCookie() {
  try {
    const cookieName = 'sb-bsrvqpggsxyrxatdtnqf-auth-token'
    const match = document.cookie.split('; ').find(row => row.startsWith(cookieName + '='))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch { return null }
}


function DeletePool({ poolId }: { poolId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('predictions').delete().eq('pool_id', poolId)
    await supabase.from('pool_members').delete().eq('pool_id', poolId)
    await supabase.from('reminders').delete().eq('pool_id', poolId)
    await supabase.from('pools').delete().eq('id', poolId)
    window.location.href = '/dashboard'
  }

  return (
    <div>
      <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '8px'}}>danger zone</div>
      {!confirming ? (
        <button onClick={() => setConfirming(true)}
          style={{fontSize: '11px', padding: '5px 10px', width: '100%', background: 'white', color: '#C8102E', border: '1px solid #C8102E', cursor: 'pointer', fontFamily: 'inherit'}}>
          delete pool
        </button>
      ) : (
        <div>
          <p style={{fontSize: '11px', color: '#555', marginBottom: '8px'}}>this will delete all picks and members. are you sure?</p>
          <div style={{display: 'flex', gap: '6px'}}>
            <button onClick={() => setConfirming(false)}
              style={{flex: 1, fontSize: '11px', padding: '5px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit'}}>
              cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{flex: 1, fontSize: '11px', padding: '5px', background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit'}}>
              {deleting ? 'deleting...' : 'yes, delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PoolPage({ params }: { params: { id: string } }) {
  const [pool, setPool] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      let currentUser = null
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        currentUser = authUser
      } else {
        const session = getSessionFromCookie()
        if (session?.access_token) {
          await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
          const { data: { user: restored } } = await supabase.auth.getUser()
          currentUser = restored
        }
      }
      if (!currentUser) { window.location.href = '/auth/login'; return }
      setUser(currentUser)

      const { data: pool } = await supabase.from('pools').select('*').eq('id', params.id).single()
      if (!pool) { setNotFound(true); setLoading(false); return }
      setPool(pool)
      setInviteUrl(`${window.location.origin}/pool/join/${pool.invite_code}`)

      const { data: membership } = await supabase.from('pool_members').select('id').eq('pool_id', pool.id).eq('user_id', currentUser.id).single()
      if (!membership) { window.location.href = `/pool/join/${pool.invite_code}`; return }

      const { data: members } = await supabase.from('pool_members').select('*').eq('pool_id', pool.id)
      const { data: scores } = await supabase.from('predictions').select('user_id, points_earned').eq('pool_id', pool.id)

      const pointsMap: Record<string, number> = {}
      scores?.forEach(s => { if (s.points_earned) pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + s.points_earned })
      setLeaderboard((members || []).map(m => ({ ...m, points: pointsMap[m.user_id] || 0 })).sort((a, b) => b.points - a.points))
      setLoading(false)
    }
    load()
  }, [params.id])

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#888'}}>
      loading...
    </div>
  )

  if (notFound) return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px'}}>
      pool not found.
    </div>
  )

  const pkg = RULE_PACKAGES[pool.package_id as keyof typeof RULE_PACKAGES]
  const isAdmin = pool.admin_id === user?.id

  return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px'}}>

      {/* Nav */}
      <div style={{background: '#111', color: 'white', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50}}>
        <a href="/dashboard" style={{fontWeight: 700, fontSize: '13px', color: 'white', textDecoration: 'none'}}>pool'em</a>
        <span style={{fontSize: '11px', color: '#888'}}>
          {user?.user_metadata?.display_name || user?.email?.split('@')[0]} ·{' '}
          <button onClick={async () => { const s = createClient(); await s.auth.signOut(); window.location.href = '/' }}
            style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit'}}>
            log out
          </button>
        </span>
      </div>

      {/* Two column layout */}
      <div style={{display: 'grid', gridTemplateColumns: '45% 55%', minHeight: 'calc(100vh - 41px)'}}>

        {/* LEFT — centered content */}
        <div style={{background: 'white', borderRight: '1px solid #e0e0db', display: 'flex', justifyContent: 'center', padding: '40px 24px'}}>
          <div style={{width: 280}}>

            <div style={{fontWeight: 700, fontSize: '15px', marginBottom: '2px'}}>{pool.name}</div>
            <div style={{fontSize: '11px', color: '#888', marginBottom: '20px'}}>
              {pool.tournament_scope?.replace('_', ' ')} · {pkg?.name}
              {isAdmin && <span style={{color: '#C8102E', marginLeft: '6px', fontWeight: 600}}>admin</span>}
            </div>

            {/* Leaderboard */}
            <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '8px'}}>leaderboard</div>
            <div style={{marginBottom: '20px'}}>
              {leaderboard.map((member, i) => (
                <div key={member.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', marginBottom: '1px',
                  background: member.user_id === user?.id ? '#fff5f5' : 'transparent',
                  borderLeft: `3px solid ${member.user_id === user?.id ? '#C8102E' : 'transparent'}`,
                }}>
                  <span style={{fontSize: '12px', fontWeight: member.user_id === user?.id ? 600 : 400, color: member.user_id === user?.id ? '#111' : '#555'}}>
                    {i + 1}. {member.display_name}
                  </span>
                  <span style={{fontSize: '12px', fontWeight: member.user_id === user?.id ? 700 : 400, color: member.user_id === user?.id ? '#C8102E' : '#888'}}>
                    {member.points}
                  </span>
                </div>
              ))}
            </div>

            {/* Scoring */}
            <div style={{borderTop: '1px solid #eee', paddingTop: '14px', marginBottom: '14px'}}>
              <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '6px'}}>scoring</div>
              <div style={{fontSize: '11px', color: '#555', lineHeight: 1.8}}>
                {pkg?.scoring.correct_result ? `correct result: ${pkg.scoring.correct_result} pt` : ''}
                {pkg?.scoring.correct_first_scorer ? <><br />first scorer: {pkg.scoring.correct_first_scorer} pts</> : ''}
                {pkg?.scoring.correct_exact_score ? <><br />exact score: {pkg.scoring.correct_exact_score} pts</> : ''}
                <br />deadline: {pool.deadline_type === 'before_each_game' ? 'before kickoff' : 'before tournament'}
              </div>
            </div>

            {/* Invite */}
            {isAdmin && (
              <div style={{borderTop: '1px solid #eee', paddingTop: '14px', marginBottom: '14px'}}>
                <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '6px'}}>invite</div>
                <div style={{display: 'flex', gap: '4px'}}>
                  <input readOnly value={inviteUrl} onClick={e => (e.target as HTMLInputElement).select()}
                    style={{fontSize: '10px', border: '1px solid #ddd', padding: '3px 6px', flex: 1, minWidth: 0, color: '#888', background: '#fafafa', fontFamily: 'inherit'}} />
                  <button onClick={handleCopy}
                    style={{fontSize: '10px', padding: '3px 8px', background: '#111', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit'}}>
                    {copied ? 'copied!' : 'copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Reminder */}
            <div style={{borderTop: '1px solid #eee', paddingTop: '14px', marginBottom: '14px'}}>
              <ReminderButton poolId={pool.id} userId={user.id} userEmail={user.email || ''} />
            </div>

            {/* Delete pool — admin only */}
            {isAdmin && (
              <div style={{borderTop: '1px solid #eee', paddingTop: '14px'}}>
                <DeletePool poolId={pool.id} />
              </div>
            )}

          </div>
        </div>

        {/* RIGHT — centered content */}
        <div style={{display: 'flex', justifyContent: 'center', padding: '40px 24px'}}>
          <div>
            {user && (
              <FixturesList
                poolId={pool.id}
                userId={user.id}
                packageId={pool.package_id}
                deadlineType={pool.deadline_type}
                scope={pool.tournament_scope}
                tournamentId={pool.tournament_id}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
