import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  const sessionClient = await createServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { poolId, emails } = await request.json()
  if (!poolId || !Array.isArray(emails)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: pool } = await supabase
    .from('pools')
    .select('id, name, admin_id, allow_member_invites, buy_in_amount, payout_structure')
    .eq('id', poolId)
    .single()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const isAdmin = pool.admin_id === user.id
  let isEligibleMember = false
  if (!isAdmin && pool.allow_member_invites) {
    const { data: membership } = await supabase
      .from('pool_members')
      .select('id')
      .eq('pool_id', poolId)
      .eq('user_id', user.id)
      .maybeSingle()
    isEligibleMember = !!membership
  }
  if (!isAdmin && !isEligibleMember) return NextResponse.json({ error: 'Not allowed to invite for this pool' }, { status: 403 })

  // Never trust client-side email parsing for anything with data implications.
  const cleaned = [...new Set(
    emails
      .map((e: any) => String(e || '').trim().toLowerCase())
      .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  )]

  const matched: string[] = []
  const unmatched: string[] = []
  const skipped: { email: string; reason: string }[] = []

  if (!cleaned.length) {
    return NextResponse.json({ matched, unmatched, skipped })
  }

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const byEmail = new Map<string, string>()
  for (const u of users) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
  }

  const callerEmail = user.email?.toLowerCase()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

  for (const email of cleaned) {
    if (email === callerEmail) {
      skipped.push({ email, reason: "that's you" })
      continue
    }

    const invitedUserId = byEmail.get(email)

    if (invitedUserId) {
      // Same idempotency as the contact picker: if there's a terminal invitation
      // already, leave it alone; otherwise get-or-create the pending row and add
      // this caller as a co-inviter.
      const { data: existing } = await supabase
        .from('pool_invitations')
        .select('id, status')
        .eq('pool_id', poolId)
        .eq('invited_user_id', invitedUserId)
        .maybeSingle()

      if (existing?.status === 'accepted' || existing?.status === 'declined') {
        skipped.push({ email, reason: `already ${existing.status}` })
        continue
      }

      let invitationId = existing?.id
      if (!invitationId) {
        const { data: created, error } = await supabase
          .from('pool_invitations')
          .insert({ pool_id: poolId, invited_user_id: invitedUserId })
          .select('id')
          .single()
        if (error || !created) {
          skipped.push({ email, reason: 'failed to create invitation' })
          continue
        }
        invitationId = created.id
        fetch(`${appUrl}/api/invite/notify-pool-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId }),
        }).catch(() => {})
      }

      await supabase
        .from('pool_invitation_inviters')
        .insert({ invitation_id: invitationId, pool_id: poolId, inviter_user_id: user.id })
      // 23505 (already a co-inviter) is fine -- treat as success either way.
      matched.push(email)
    } else {
      const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
      const { error: tokenError } = await supabase
        .from('pool_invites')
        .insert({ pool_id: poolId, token, created_by: user.id })
      if (tokenError) {
        skipped.push({ email, reason: 'failed to create invite link' })
        continue
      }

      await fetch(`${appUrl}/api/invite/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          poolName: pool.name,
          inviteUrl: `${appUrl}/pool/join/${token}`,
          buyInAmount: pool.buy_in_amount,
          payoutStructure: pool.payout_structure,
        }),
      }).catch(() => {})
      unmatched.push(email)
    }
  }

  return NextResponse.json({ matched, unmatched, skipped })
}
