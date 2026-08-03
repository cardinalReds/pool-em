import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Sends a 6-digit code, not a clickable link. Tested the link-based flow (generateLink's
// action_link, round-tripping through Supabase's /auth/v1/verify) and it reliably failed
// with otp_expired even on links clicked within a minute of sending — the classic symptom
// of an email security scanner (Gmail, a corporate gateway) auto-fetching links in emails
// to check them, which silently consumes a single-use verification GET before the user
// ever clicks it themselves. A typed-in code can't be "clicked" by a scanner, so it isn't
// vulnerable to that. Delivery still goes through Resend like every other email here —
// generateLink() is only used to mint the code, nothing about it gets emailed directly.
export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email })

    // Never reveal whether the email has an account — same response either way.
    if (error || !data?.properties?.email_otp) {
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
          subject: `${data.properties.email_otp} is your pool'em reset code`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <div style="font-weight: 700; font-size: 16px; margin-bottom: 16px;">pool'em</div>
              <p style="color: #555; font-size: 13px; margin-bottom: 20px;">
                someone asked to reset the password for this account. if that was you, enter this code on the reset page — it expires soon:
              </p>
              <div style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; background: #f5f5f3; padding: 16px 20px; text-align: center;">
                ${data.properties.email_otp}
              </div>
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
