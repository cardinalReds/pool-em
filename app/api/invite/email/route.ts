import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, poolName, inviteUrl, buyInAmount, payoutStructure, inviterName, competitionName } = await req.json()
  if (!email || !inviteUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const buyInSection = buyInAmount ? `
    <div style="background: #fffbf0; border: 1px solid #f0e0a0; padding: 14px; margin-bottom: 16px;">
      <p style="font-weight: 600; margin: 0 0 6px;">💰 $${buyInAmount} buy-in</p>
      ${payoutStructure ? `<p style="font-size: 12px; color: #666; margin: 0;">payout: ${payoutStructure}</p>` : ''}
    </div>
  ` : ''

  const subject = inviterName ? `${inviterName} invited you to join ${poolName}` : `You've been invited to join ${poolName}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "pool'em <invites@pool-em.com>",
      to: email,
      subject,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">pool'em</div>
          <div style="background: #111; color: white; padding: 16px; margin-bottom: 16px;">
            <p style="font-size: 11px; color: #888; margin: 0 0 6px;">
              ${inviterName ? `${inviterName} invited you` : "you've been invited"}${competitionName ? ` · ${competitionName}` : ''}
            </p>
            <h2 style="font-size: 18px; font-weight: 700; margin: 0;">${poolName}</h2>
          </div>
          ${buyInSection}
          <p style="color: #555; margin-bottom: 20px; font-size: 13px;">Make your picks, track the leaderboard, and compete with your group through the whole tournament.</p>
          <a href="${inviteUrl}" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
            join pool →
          </a>
          <p style="color: #aaa; font-size: 11px; margin-top: 20px;">or copy this link: ${inviteUrl}</p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
