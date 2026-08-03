import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Password reset goes through Resend like every other transactional email in this app,
// instead of Supabase Auth's own built-in mailer — generateLink() creates the token and
// verification URL without sending anything, we own the delivery. The resulting
// action_link still round-trips through Supabase's /auth/v1/verify, which lands the user
// back on /auth/reset-password with a session, so nothing on that page needs to change.
export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl}/auth/reset-password` },
    })

    // Never reveal whether the email has an account — same response either way.
    if (error || !data?.properties?.action_link) {
      console.error('forgot-password: generateLink error', error)
      return NextResponse.json({ ok: true })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: "pool'em <accounts@pool-em.com>",
          to: email,
          subject: "reset your pool'em password",
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <div style="font-weight: 700; font-size: 16px; margin-bottom: 16px;">pool'em</div>
              <p style="color: #555; font-size: 13px; margin-bottom: 20px;">
                someone asked to reset the password for this account. if that was you, set a new one below — this link expires soon.
              </p>
              <a href="${data.properties.action_link}" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
                reset password →
              </a>
              <p style="color: #aaa; font-size: 10px; margin-top: 32px;">
                didn't request this? you can safely ignore this email — your password won't change.
              </p>
            </div>
          `,
        }),
      }).catch(err => console.error('forgot-password: Resend error', err))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('forgot-password error:', err)
    return NextResponse.json({ ok: true })
  }
}
