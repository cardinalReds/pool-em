import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Used to be a fetch to /api/invite/email, a separate route with no auth of its own
// (reachable directly, arbitrary destination + content — an open relay). Inlined here
// since this is its only real caller, so there's no public endpoint left to abuse.
async function sendInviteEmail(opts: {
  email: string; poolName: string; inviteUrl: string
  buyInAmount: number | null; payoutStructure: string | null
  inviterName: string; competitionName: string | null
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const buyInSection = opts.buyInAmount ? `
    <div style="background: #fffbf0; border: 1px solid #f0e0a0; padding: 14px; margin-bottom: 16px;">
      <p style="font-weight: 600; margin: 0 0 6px;">💰 $${opts.buyInAmount} buy-in</p>
      ${opts.payoutStructure ? `<p style="font-size: 12px; color: #666; margin: 0;">payout: ${opts.payoutStructure}</p>` : ''}
    </div>
  ` : ''

  const subject = opts.inviterName ? `${opts.inviterName} invited you to join ${opts.poolName}` : `You've been invited to join ${opts.poolName}`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "pool'em <invites@pool-em.com>",
      to: opts.email,
      subject,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">pool'em</div>
          <div style="background: #111; color: white; padding: 16px; margin-bottom: 16px;">
            <p style="font-size: 11px; color: #888; margin: 0 0 6px;">
              ${opts.inviterName ? `${opts.inviterName} invited you` : "you've been invited"}${opts.competitionName ? ` · ${opts.competitionName}` : ''}
            </p>
            <h2 style="font-size: 18px; font-weight: 700; margin: 0;">${opts.poolName}</h2>
          </div>
          ${buyInSection}
          <p style="color: #555; margin-bottom: 20px; font-size: 13px;">Make your picks, track the leaderboard, and compete with your group through the whole tournament.</p>
          <a href="${opts.inviteUrl}" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
            join pool →
          </a>
          <p style="color: #aaa; font-size: 11px; margin-top: 20px;">or copy this link: ${opts.inviteUrl}</p>
        </div>
      `,
      headers: {
        'List-Unsubscribe': '<mailto:support@pool-em.com?subject=unsubscribe>',
      },
    }),
  }).catch(err => console.error('bulk-email: Resend error', err))
}

export async function POST(request: NextRequest) {
  // This app's browser client keeps its session in localStorage, not cookies, so
  // there's no cookie-session server client to read here -- the caller sends their
  // own access token instead, verified directly against Supabase auth.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await checkRateLimit(supabase, `bulk-email:user:${user.id}`, { max: 20, windowSeconds: 60 * 60 })
  if (!ok) return NextResponse.json({ error: 'Too many invite requests — try again later' }, { status: 429 })

  const { poolId, emails } = await request.json()
  if (!poolId || !Array.isArray(emails)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (emails.length > 100) return NextResponse.json({ error: 'Too many emails at once (max 100)' }, { status: 400 })

  const { data: pool } = await supabase
    .from('pools')
    .select('id, name, admin_id, allow_member_invites, buy_in_amount, payout_structure, tournament_id')
    .eq('id', poolId)
    .single()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const inviterName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'someone'
  let competitionName: string | null = null
  if (pool.tournament_id) {
    const { data: tournament } = await supabase.from('tournaments').select('name').eq('id', pool.tournament_id).maybeSingle()
    competitionName = tournament?.name ?? null
  }

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

      sendInviteEmail({
        email,
        poolName: pool.name,
        inviteUrl: `${appUrl}/pool/join/${token}`,
        buyInAmount: pool.buy_in_amount,
        payoutStructure: pool.payout_structure,
        inviterName,
        competitionName,
      }).catch(() => {})
      unmatched.push(email)
    }
  }

  return NextResponse.json({ matched, unmatched, skipped })
}
