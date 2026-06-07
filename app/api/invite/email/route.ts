import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, poolName, inviteUrl } = await req.json()
  if (!email || !inviteUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'pool\'em <invites@poolem.app>',
      to: email,
      subject: `You've been invited to join ${poolName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">you've been invited</h2>
          <p style="color: #555; margin-bottom: 20px;">Join <strong>${poolName}</strong> on pool'em and make your picks.</p>
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
