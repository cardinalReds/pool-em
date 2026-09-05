'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface VoteCandidate {
  id: number
  home_team: string
  away_team: string
  date: string
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles'

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// "Democratize" NCAAF mode — every real pool member (not ghosts; a ghost has no actual
// preference to vote with) picks up to 10 games they want to predict this week. Votes close
// 5 days before the round's earliest kickoff (enforced server-side too, in
// app/api/ncaaf/best10-select/route.ts, which owns the actual tally once closed) — this
// component just collects one member's ballot.
export default function NCAAFVoteBox({ poolId, round, userId, candidates, deadline }: {
  poolId: string
  round: string
  userId: string
  candidates: VoteCandidate[]
  deadline: string
}) {
  const [myVotes, setMyVotes] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase.from('pool_game_votes')
        .select('fixture_id')
        .eq('pool_id', poolId).eq('round', round).eq('user_id', userId)
      if (cancelled) return
      setMyVotes(new Set((data || []).map(v => v.fixture_id)))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [poolId, round, userId])

  async function toggle(fixtureId: number) {
    const alreadyVoted = myVotes.has(fixtureId)
    if (!alreadyVoted && myVotes.size >= 10) return
    setPending(prev => new Set(prev).add(fixtureId))
    const supabase = createClient()
    if (alreadyVoted) {
      await supabase.from('pool_game_votes').delete()
        .eq('pool_id', poolId).eq('round', round).eq('user_id', userId).eq('fixture_id', fixtureId)
      setMyVotes(prev => { const next = new Set(prev); next.delete(fixtureId); return next })
    } else {
      await supabase.from('pool_game_votes').insert({ pool_id: poolId, round, user_id: userId, fixture_id: fixtureId })
      setMyVotes(prev => new Set(prev).add(fixtureId))
    }
    setPending(prev => { const next = new Set(prev); next.delete(fixtureId); return next })
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: 13, padding: 16 }}>loading your ballot...</div>

  const sorted = [...candidates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const atMax = myVotes.size >= 10

  return (
    <div>
      <div style={{ background: '#fff9ec', border: '1px solid #f0e0b8', padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#9a6b00' }}>vote for this week's games</div>
        <div style={{ fontSize: 12, color: '#9a6b00', marginTop: 3 }}>
          pick up to 10 games you want the pool to predict — {myVotes.size}/10 selected. voting closes {fmt(deadline)}, then the most-voted games become this week's slate.
        </div>
      </div>
      <div>
        {sorted.map(g => {
          const voted = myVotes.has(g.id)
          const isPending = pending.has(g.id)
          const disabled = isPending || (!voted && atMax)
          return (
            <button key={g.id} type="button" onClick={() => !disabled && toggle(g.id)} disabled={disabled}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: '10px 12px', marginBottom: 6, border: '1px solid', textAlign: 'left', fontFamily: 'inherit',
                cursor: disabled ? 'default' : 'pointer',
                borderColor: voted ? '#C8102E' : '#e0e0db',
                background: voted ? '#fff5f5' : disabled ? '#fafafa' : 'white',
                opacity: disabled && !voted ? 0.5 : 1,
              }}>
              <span style={{ fontSize: 13, fontWeight: voted ? 600 : 400, color: voted ? '#C8102E' : '#333' }}>
                {g.away_team} @ {g.home_team}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#aaa' }}>{fmt(g.date)}</span>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
                  borderRadius: '50%', border: `1px solid ${voted ? '#C8102E' : '#ddd'}`,
                  background: voted ? '#C8102E' : 'white', color: 'white', fontSize: 11, flexShrink: 0,
                }}>
                  {voted ? '✓' : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
