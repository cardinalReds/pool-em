'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Member { user_id: string; display_name: string }
interface Credit { user_id: string; credits_purchased: number; prepaid_all: boolean }

function parseMatchday(round: string): number | null {
  const m = round.match(/Matchday (\d+)/)
  return m ? parseInt(m[1]) : null
}

export default function WeeklyPot({ poolId, userId, isAdmin, weeklyBuyIn, tournamentId }: {
  poolId: string; userId: string; isAdmin: boolean; weeklyBuyIn: number; tournamentId: string
}) {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [credits, setCredits] = useState<Record<string, Credit>>({})
  const [entriesByUser, setEntriesByUser] = useState<Record<string, Set<number>>>({})
  const [upcomingMatchday, setUpcomingMatchday] = useState<number | null>(null)
  const [matchdaysRemaining, setMatchdaysRemaining] = useState(0)
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [standingsMatchday, setStandingsMatchday] = useState<number | null>(null)
  const [standings, setStandings] = useState<{ user_id: string; display_name: string; points: number }[]>([])

  async function load() {
    const supabase = createClient()
    const [membersRes, creditsRes, entriesRes, fixturesRes] = await Promise.all([
      supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
      supabase.from('member_credits').select('user_id, credits_purchased, prepaid_all').eq('pool_id', poolId),
      supabase.from('matchday_entries').select('user_id, matchday').eq('pool_id', poolId),
      supabase.from('fixtures').select('id, round, date').eq('tournament_id', tournamentId),
    ])

    const memberList: Member[] = membersRes.data || []
    setMembers(memberList)
    const nameByUser: Record<string, string> = {}
    memberList.forEach(m => { nameByUser[m.user_id] = m.display_name })

    const creditMap: Record<string, Credit> = {}
    ;(creditsRes.data || []).forEach((c: any) => { creditMap[c.user_id] = c })
    setCredits(creditMap)

    const byUser: Record<string, Set<number>> = {}
    const byMatchday: Record<number, string[]> = {}
    ;(entriesRes.data || []).forEach((e: any) => {
      if (!byUser[e.user_id]) byUser[e.user_id] = new Set()
      byUser[e.user_id].add(e.matchday)
      if (!byMatchday[e.matchday]) byMatchday[e.matchday] = []
      byMatchday[e.matchday].push(e.user_id)
    })
    setEntriesByUser(byUser)

    // Determine matchdays: the earliest not-yet-locked matchday is "upcoming"; count all
    // matchdays whose lock time is still in the future for the prepay-cost estimate.
    const matchdayLockTimes: Record<number, number> = {}
    const fixtureIdsByMatchday: Record<number, number[]> = {}
    ;(fixturesRes.data || []).forEach((f: any) => {
      const md = parseMatchday(f.round)
      if (md === null) return
      const t = new Date(f.date).getTime()
      if (!(md in matchdayLockTimes) || t < matchdayLockTimes[md]) matchdayLockTimes[md] = t
      if (!fixtureIdsByMatchday[md]) fixtureIdsByMatchday[md] = []
      fixtureIdsByMatchday[md].push(f.id)
    })
    const now = Date.now()
    const future = Object.entries(matchdayLockTimes).filter(([, t]) => t > now).map(([md]) => parseInt(md)).sort((a, b) => a - b)
    setUpcomingMatchday(future[0] ?? null)
    setMatchdaysRemaining(future.length)

    // "This week's pot" standings — the most recent locked matchday that had entrants
    const lockedWithEntrants = Object.entries(matchdayLockTimes)
      .filter(([md, t]) => t <= now && (byMatchday[parseInt(md)] || []).length > 0)
      .map(([md]) => parseInt(md))
      .sort((a, b) => b - a)
    const targetMatchday = lockedWithEntrants[0] ?? null
    setStandingsMatchday(targetMatchday)
    if (targetMatchday !== null) {
      const entrantIds = byMatchday[targetMatchday]
      const fixtureIds = fixtureIdsByMatchday[targetMatchday] || []
      const { data: preds } = await supabase.from('predictions_v2').select('user_id, points_earned')
        .eq('pool_id', poolId).in('fixture_id', fixtureIds).in('user_id', entrantIds)
      const pointsByUser: Record<string, number> = {}
      entrantIds.forEach(id => { pointsByUser[id] = 0 })
      ;(preds || []).forEach((p: any) => { pointsByUser[p.user_id] = (pointsByUser[p.user_id] || 0) + (p.points_earned || 0) })
      setStandings(Object.entries(pointsByUser)
        .map(([user_id, points]) => ({ user_id, display_name: nameByUser[user_id] || 'unknown', points }))
        .sort((a, b) => b.points - a.points))
    } else {
      setStandings([])
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [poolId, userId, tournamentId])

  async function recordPayment(memberId: string) {
    const amount = parseFloat(paymentInputs[memberId] || '0')
    if (!amount || amount <= 0 || !weeklyBuyIn) return
    const addedCredits = Math.floor(amount / weeklyBuyIn)
    if (addedCredits <= 0) return
    setBusy(memberId)
    const supabase = createClient()
    const existing = credits[memberId]
    if (existing) {
      await supabase.from('member_credits').update({ credits_purchased: existing.credits_purchased + addedCredits }).eq('pool_id', poolId).eq('user_id', memberId)
    } else {
      await supabase.from('member_credits').insert({ pool_id: poolId, user_id: memberId, credits_purchased: addedCredits })
    }
    setPaymentInputs(prev => ({ ...prev, [memberId]: '' }))
    await load()
    setBusy(null)
  }

  async function togglePrepaid(memberId: string) {
    setBusy(memberId)
    const supabase = createClient()
    const existing = credits[memberId]
    const newValue = !existing?.prepaid_all
    if (existing) {
      await supabase.from('member_credits').update({ prepaid_all: newValue }).eq('pool_id', poolId).eq('user_id', memberId)
    } else {
      await supabase.from('member_credits').insert({ pool_id: poolId, user_id: memberId, prepaid_all: newValue })
    }
    await load()
    setBusy(null)
  }

  async function enterMatchday() {
    if (upcomingMatchday === null) return
    setBusy('self')
    const supabase = createClient()
    await supabase.from('matchday_entries').insert({ pool_id: poolId, user_id: userId, matchday: upcomingMatchday })
    const myCredits = credits[userId]
    if (myCredits && !myCredits.prepaid_all) {
      await supabase.from('member_credits').update({ credits_purchased: Math.max(0, myCredits.credits_purchased - 1) }).eq('pool_id', poolId).eq('user_id', userId)
    }
    await load()
    setBusy(null)
  }

  if (loading || !weeklyBuyIn) return null

  const myCredit = credits[userId]
  const myEntries = entriesByUser[userId] || new Set()
  const alreadyEntered = upcomingMatchday !== null && myEntries.has(upcomingMatchday)
  const canEnter = upcomingMatchday !== null && !alreadyEntered && (myCredit?.prepaid_all || (myCredit?.credits_purchased || 0) > 0)
  const prepayCost = weeklyBuyIn * matchdaysRemaining

  return (
    <div style={{ border: '1px solid #eee', marginBottom: 16, background: '#fdfdfc' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '8px 12px', borderBottom: '1px solid #eee' }}>weekly pot</div>

      {/* Your status */}
      <div style={{ padding: '10px 12px', borderBottom: isAdmin ? '1px solid #eee' : 'none' }}>
        <div style={{ fontSize: '12px', color: '#555', marginBottom: 4 }}>
          {myCredit?.prepaid_all ? '✓ paid in full for the season' : `you have ${myCredit?.credits_purchased || 0} entr${(myCredit?.credits_purchased || 0) === 1 ? 'y' : 'ies'}`}
        </div>
        {!myCredit?.prepaid_all && matchdaysRemaining > 0 && (
          <div style={{ fontSize: '10px', color: '#aaa', marginBottom: 8 }}>paying for the rest of the season upfront would cost ${prepayCost} ({matchdaysRemaining} matchdays × ${weeklyBuyIn})</div>
        )}
        {upcomingMatchday !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '11px', color: '#555' }}>matchday {upcomingMatchday}:</span>
            {alreadyEntered || myCredit?.prepaid_all ? (
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#2d7a2d' }}>✓ entered</span>
            ) : (
              <button onClick={enterMatchday} disabled={!canEnter || busy === 'self'}
                style={{ fontSize: '10px', fontWeight: 600, padding: '4px 10px', borderRadius: 10, border: 'none', background: canEnter ? '#111' : '#eee', color: canEnter ? 'white' : '#aaa', cursor: canEnter ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy === 'self' ? 'entering...' : 'enter (1 credit)'}
              </button>
            )}
            {!canEnter && !alreadyEntered && !myCredit?.prepaid_all && <span style={{ fontSize: '10px', color: '#C8102E' }}>no credits — ask the admin</span>}
          </div>
        )}
      </div>

      {/* This week's pot — just a leaderboard scoped to matchday entrants */}
      {standingsMatchday !== null && standings.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', marginBottom: 8 }}>matchday {standingsMatchday} pot · {standings.length} entr{standings.length === 1 ? 'y' : 'ies'} · ${weeklyBuyIn * standings.length} pot</div>
          {standings.map((s, i) => (
            <div key={s.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '11px' }}>
              <span style={{ color: s.user_id === userId ? '#C8102E' : '#333', fontWeight: s.user_id === userId ? 600 : 400 }}>{i + 1}. {s.display_name}</span>
              <span style={{ color: '#888' }}>{s.points} pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Admin ledger */}
      {isAdmin && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', marginBottom: 8 }}>member credits</div>
          {members.map(m => {
            const c = credits[m.user_id]
            return (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontSize: '11px', color: '#333', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.display_name}</span>
                <span style={{ fontSize: '10px', color: c?.prepaid_all ? '#2d7a2d' : '#888', flexShrink: 0 }}>
                  {c?.prepaid_all ? 'prepaid' : `${c?.credits_purchased || 0} credits`}
                </span>
                <button onClick={() => togglePrepaid(m.user_id)} disabled={busy === m.user_id}
                  style={{ fontSize: '9px', padding: '3px 6px', border: '1px solid #ddd', background: 'white', color: '#888', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {c?.prepaid_all ? 'unmark' : 'mark prepaid'}
                </button>
                {!c?.prepaid_all && (
                  <>
                    <input type="number" min="0" placeholder="$ paid" value={paymentInputs[m.user_id] || ''}
                      onChange={e => setPaymentInputs(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                      style={{ width: 56, fontSize: '10px', padding: '3px 5px', border: '1px solid #ddd', fontFamily: 'inherit', flexShrink: 0 }} />
                    <button onClick={() => recordPayment(m.user_id)} disabled={busy === m.user_id}
                      style={{ fontSize: '9px', padding: '3px 6px', border: 'none', background: '#111', color: 'white', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      add
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
