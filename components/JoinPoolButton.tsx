'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { syncMemberToPublicPools } from '@/lib/publicPoolSync'

export default function JoinPoolButton({
  poolId,
  userId,
  displayName,
}: {
  poolId: string
  userId: string
  displayName: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('pool_members').insert({
      pool_id: poolId,
      user_id: userId,
      display_name: displayName,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      await syncMemberToPublicPools(supabase, poolId, userId, displayName)
      router.push(`/pool/${poolId}`)
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      <button className="btn-turf w-full text-lg" onClick={handleJoin} disabled={loading}>
        {loading ? 'JOINING...' : "LET'S GO →"}
      </button>
    </div>
  )
}
