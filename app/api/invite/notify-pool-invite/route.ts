import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp } from '@/lib/rateLimit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  // No session on this one (bulk-email calls it server-to-server) — content is always
  // pulled from a real, pre-existing invitation row, never attacker-supplied, so the
  // risk is spam volume rather than arbitrary content. IP-limited for that reason.
  const ok = await checkRateLimit(supabase, `notify-pool-invite:ip:${clientIp(req)}`, { max: 30, windowSeconds: 60 * 60 })
  if (!ok) return NextResponse.json({ ok: true, skipped: true, reason: 'rate limited' })

  const { invitationId } = await req.json()
  if (!invitationId) return NextResponse.json({ error: 'Missing invitationId' }, { status: 400 })

  const { data: inv } = await supabase
    .from('pool_invitations')
    .select('id, pool_id, invited_user_id, status, pools(name, tournament_id)')
    .eq('id', invitationId)
    .eq('status', 'pending')
    .single()

  if (!inv) return NextResponse.json({ ok: true, skipped: true, reason: 'not found or not pending' })

  const tournamentId = (inv.pools as any)?.tournament_id
  let competitionName: string | null = null
  if (tournamentId) {
    const { data: tournament } = await supabase.from('tournaments').select('name').eq('id', tournamentId).maybeSingle()
    competitionName = tournament?.name ?? null
  }

  const { data: inviterRows } = await supabase
    .from('pool_invitation_inviters')
    .select('inviter_user_id')
    .eq('invitation_id', inv.id)
  const inviterIds = (inviterRows || []).map((r: any) => r.inviter_user_id)
  let inviterNames: string[] = []
  if (inviterIds.length) {
    const { data: inviterMembers } = await supabase
      .from('pool_members')
      .select('user_id, display_name')
      .eq('pool_id', inv.pool_id)
      .in('user_id', inviterIds)
    inviterNames = (inviterMembers || []).map((m: any) => m.display_name)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('notify_pool_invites')
    .eq('id', inv.invited_user_id)
    .single()

  if (!profile?.notify_pool_invites) return NextResponse.json({ ok: true, skipped: true, reason: 'opted out' })

  const { data: { user: invitee } } = await supabase.auth.admin.getUserById(inv.invited_user_id)
  if (!invitee?.email) return NextResponse.json({ ok: true, skipped: true, reason: 'no email' })

  const { data: ruleRows } = await supabase
    .from('pool_rules')
    .select('category_id, points, ruleset_categories(name)')
    .eq('pool_id', inv.pool_id)
    .limit(5)

  const poolName = (inv.pools as any)?.name || 'a pool'
  const rulesList = (ruleRows || [])
    .map((r: any) => `<li style="margin-bottom: 4px;">${r.ruleset_categories?.name || r.category_id} — ${r.points} pt${r.points === 1 ? '' : 's'}</li>`)
    .join('')
  const rulesSection = rulesList ? `
    <div style="background: #f9f9f7; border: 1px solid #eee; padding: 14px; margin-bottom: 16px;">
      <p style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px;">what this pool scores</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #333;">${rulesList}</ul>
    </div>
  ` : ''

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const inviterLabel = inviterNames.length ? inviterNames.join(', ') : null
  const subject = inviterLabel ? `${inviterLabel} invited you to join ${poolName}` : `You've been invited to join ${poolName}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "pool'em <invites@pool-em.com>",
      to: invitee.email,
      subject,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">pool'em</div>
          <div style="background: #111; color: white; padding: 16px; margin-bottom: 16px;">
            <p style="font-size: 11px; color: #888; margin: 0 0 6px;">
              ${inviterLabel ? `${inviterLabel} invited you` : "you've been invited"}${competitionName ? ` · ${competitionName}` : ''}
            </p>
            <h2 style="font-size: 18px; font-weight: 700; margin: 0;">${poolName}</h2>
          </div>
          ${rulesSection}
          <a href="${appUrl}/dashboard" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
            view invite →
          </a>
          <p style="color: #aaa; font-size: 11px; margin-top: 20px;">accept or decline from your pool'em dashboard.</p>
        </div>
      `,
      headers: {
        'List-Unsubscribe': '<mailto:support@pool-em.com?subject=unsubscribe>',
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('notify-pool-invite: Resend error', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
