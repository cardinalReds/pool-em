'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeWeeklyPayouts } from '@/lib/weeklyPayouts'

interface Member { user_id: string; display_name: string }
interface Credit { user_id: string; credits_purchased: number; prepaid_all: boolean }

function parseMatchday(round: string): number | null {
  const m = round.match(/Matchday (\d+)/)
  return m ? parseInt(m[1]) : null
}

export default function WeeklyPot({ poolId, userId, isAdmin, weeklyBuyIn, tournamentId, poolName, venmoHandle, zelleHandle, weeklyPayoutStructure, adminFeePercent }: {
  poolId: string; userId: string; isAdmin: boolean; weeklyBuyIn: number; tournamentId: string
  poolName: string; venmoHandle?: string | null; zelleHandle?: string | null
  weeklyPayoutStructure?: string | null; adminFeePercent?: number | null
}) {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [credits, setCredits] = useState<Record<string, Credit>>({})
  const [entriesByUser, setEntriesByUser] = useState<Record<string, Set<number>>>({})
  const [upcomingMatchday, setUpcomingMatchday] = useState<number | null>(null)
  const [matchdaysRemaining, setMatchdaysRemaining] = useState(0)
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [payouts, setPayouts] = useState<{ matchday: number; winner_user_id: string; payout_rank: number; amount: number }[]>([])

  async function load() {
    const supabase = createClient()

    // Admin viewing the pool is the trigger for computing any newly-completed matchday's
    // payout — no separate button, no cron dependency for the common case of "admin
    // checks their pool after the week's games finish."
    if (isAdmin) {
      await computeWeeklyPayouts(supabase, poolId, tournamentId, weeklyBuyIn, weeklyPayoutStructure, adminFeePercent)
    }

    const [membersRes, creditsRes, entriesRes, fixturesRes, payoutsRes] = await Promise.all([
      supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
      supabase.from('member_credits').select('user_id, credits_purchased, prepaid_all').eq('pool_id', poolId),
      supabase.from('matchday_entries').select('user_id, matchday').eq('pool_id', poolId),
      supabase.from('fixtures').select('round, date').eq('tournament_id', tournamentId),
      supabase.from('weekly_payouts').select('matchday, winner_user_id, payout_rank, amount').eq('pool_id', poolId).order('matchday', { ascending: false }),
    ])
    setPayouts(payoutsRes.data || [])

    setMembers(membersRes.data || [])

    const creditMap: Record<string, Credit> = {}
    ;(creditsRes.data || []).forEach((c: any) => { creditMap[c.user_id] = c })

    // Admin doesn't pay themselves — auto-exempt on first load if they have no record yet
    if (isAdmin && !creditMap[userId]) {
      await supabase.from('member_credits').insert({ pool_id: poolId, user_id: userId, prepaid_all: true })
      creditMap[userId] = { user_id: userId, credits_purchased: 0, prepaid_all: true }
    }
    setCredits(creditMap)

    const byUser: Record<string, Set<number>> = {}
    ;(entriesRes.data || []).forEach((e: any) => {
      if (!byUser[e.user_id]) byUser[e.user_id] = new Set()
      byUser[e.user_id].add(e.matchday)
    })
    setEntriesByUser(byUser)

    // Determine matchdays: the earliest not-yet-locked matchday is "upcoming"; count all
    // matchdays whose lock time is still in the future for the prepay-cost estimate.
    const matchdayLockTimes: Record<number, number> = {}
    ;(fixturesRes.data || []).forEach((f: any) => {
      const md = parseMatchday(f.round)
      if (md === null) return
      const t = new Date(f.date).getTime()
      if (!(md in matchdayLockTimes) || t < matchdayLockTimes[md]) matchdayLockTimes[md] = t
    })
    const now = Date.now()
    const future = Object.entries(matchdayLockTimes).filter(([, t]) => t > now).map(([md]) => parseInt(md)).sort((a, b) => a - b)
    setUpcomingMatchday(future[0] ?? null)
    setMatchdaysRemaining(future.length)

    setLoading(false)
  }

  useEffect(() => { load() }, [poolId, userId, tournamentId, weeklyBuyIn, weeklyPayoutStructure, adminFeePercent])

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
  const hasPaymentInfo = !!(venmoHandle || zelleHandle)

  return (
    <div style={{ border: '1px solid #eee', marginBottom: 16, background: '#fdfdfc' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', padding: '8px 12px', borderBottom: '1px solid #eee' }}>weekly pot</div>

      {/* Payout results — grouped by matchday, most recent first */}
      {payouts.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', marginBottom: 6 }}>results</div>
          {Object.entries(
            payouts.reduce((acc: Record<number, typeof payouts>, p) => {
              (acc[p.matchday] = acc[p.matchday] || []).push(p)
              return acc
            }, {})
          ).map(([md, rows]) => (
            <div key={md} style={{ fontSize: '11px', color: '#555', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>matchday {md}:</span>{' '}
              {rows
                .slice().sort((a, b) => a.payout_rank - b.payout_rank)
                .map(r => `${members.find(m => m.user_id === r.winner_user_id)?.display_name || (r.winner_user_id === userId ? 'you' : 'unknown')} won $${r.amount.toFixed(2)}`)
                .join(' · ')}
            </div>
          ))}
        </div>
      )}

      {/* Your status */}
      <div style={{ padding: '10px 12px', borderBottom: isAdmin ? '1px solid #eee' : 'none' }}>
        <div style={{ fontSize: '12px', color: '#555', marginBottom: 4 }}>
          {myCredit?.prepaid_all ? '✓ paid in full for the season' : `you have ${myCredit?.credits_purchased || 0} entr${(myCredit?.credits_purchased || 0) === 1 ? 'y' : 'ies'}`}
        </div>

        {upcomingMatchday !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: '11px', color: '#555' }}>matchday {upcomingMatchday}:</span>
            {alreadyEntered || myCredit?.prepaid_all ? (
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#2d7a2d' }}>✓ entered</span>
            ) : (
              <button onClick={enterMatchday} disabled={!canEnter || busy === 'self'}
                style={{ fontSize: '10px', fontWeight: 600, padding: '4px 10px', borderRadius: 10, border: 'none', background: canEnter ? '#111' : '#eee', color: canEnter ? 'white' : '#aaa', cursor: canEnter ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy === 'self' ? 'entering...' : 'enter (1 credit)'}
              </button>
            )}
            {!canEnter && !alreadyEntered && !myCredit?.prepaid_all && <span style={{ fontSize: '10px', color: '#C8102E' }}>no credits yet</span>}
          </div>
        )}

        {/* Payment instructions — not shown to the admin, who doesn't pay themselves */}
        {!isAdmin && !myCredit?.prepaid_all && (
          <div style={{ background: '#fffbf0', border: '1px solid #f0e0a0', padding: '10px', marginTop: 4 }}>
            <div style={{ fontSize: '11px', color: '#555', marginBottom: 6 }}>
              buy entries by sending the admin ${weeklyBuyIn} (or a multiple of it) via venmo or zelle.
            </div>
            {matchdaysRemaining > 0 && (
              <div style={{ fontSize: '11px', color: '#555', marginBottom: 8 }}>
                to prepay for the rest of the season ({matchdaysRemaining} matchdays), send <strong>${prepayCost}</strong>.
              </div>
            )}
            {hasPaymentInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                {venmoHandle && (
                  <a href={`https://venmo.com/${venmoHandle}?txn=pay&amount=${weeklyBuyIn}&note=${encodeURIComponent(poolName + ' weekly pot')}`} target="_blank" rel="noopener noreferrer">
                    <button type="button" style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      pay @{venmoHandle} via venmo →
                    </button>
                  </a>
                )}
                {zelleHandle && (
                  <div style={{ padding: '8px', background: '#111', color: 'white', fontSize: '11px', fontWeight: 600, textAlign: 'center' as const }}>
                    zelle: {zelleHandle}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '10px', color: '#aaa' }}>the admin hasn't added a venmo or zelle handle yet — ask them directly.</div>
            )}
          </div>
        )}

        <div style={{ fontSize: '10px', color: '#aaa', marginTop: 8 }}>payouts are issued at the conclusion of each match week.</div>
      </div>

      {/* Admin ledger */}
      {isAdmin && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', marginBottom: 8 }}>member credits</div>
          {members.filter(m => m.user_id !== userId).map(m => {
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
          {members.length <= 1 && <div style={{ fontSize: '10px', color: '#aaa' }}>no other members yet</div>}
        </div>
      )}
    </div>
  )
}
