import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import JoinPoolButton from '@/components/JoinPoolButton'

export default async function JoinPoolPage({ params }: { params: { code: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/signup?redirect=/pool/join/${params.code}`)
  }

  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('invite_code', params.code)
    .single()

  if (!pool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center max-w-md">
          <div className="font-display text-5xl mb-4">🚫</div>
          <h2 className="font-display text-3xl text-chalk tracking-wider mb-2">INVALID LINK</h2>
          <p style={{color: 'var(--chalk-dim)'}}>This invite link doesn't exist or has expired.</p>
        </div>
      </div>
    )
  }

  // Already a member?
  const { data: existing } = await supabase
    .from('pool_members')
    .select('id')
    .eq('pool_id', pool.id)
    .eq('user_id', user.id)
    .single()

  if (existing) redirect(`/pool/${pool.id}`)

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center">
        <div className="badge text-turf-400 text-xs inline-block mb-4">YOU'VE BEEN INVITED</div>
        <h2 className="font-display text-4xl text-chalk tracking-wider mb-2">{pool.name}</h2>
        <p className="mb-8" style={{color: 'var(--chalk-dim)'}}>
          You're joining as <strong className="text-chalk">{displayName}</strong>
        </p>
        <JoinPoolButton poolId={pool.id} userId={user.id} displayName={displayName} />
      </div>
    </div>
  )
}
