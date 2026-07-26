import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function sendNotification(email: string, tournamentName: string) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "pool'em <notifications@pool-em.com>",
      to: email,
      subject: `${tournamentName} is now live on pool'em`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">pool'em</div>
          <div style="background: #111; color: white; padding: 16px; margin-bottom: 16px;">
            <p style="font-size: 11px; color: #888; margin: 0 0 6px;">new competition</p>
            <h2 style="font-size: 18px; font-weight: 700; margin: 0;">${tournamentName}</h2>
          </div>
          <p style="color: #555; margin-bottom: 20px; font-size: 13px;">It's live — create a pool and invite your friends.</p>
          <a href="${appUrl}/pool/create" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
            create a pool →
          </a>
        </div>
      `,
    }),
  }).catch(err => console.error('tournaments/notify: Resend error', err))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('status', 'active')
      .is('notified_at', null)

    if (!tournaments?.length) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    const { data: optedIn } = await supabase
      .from('profiles')
      .select('id')
      .eq('notify_new_competitions', true)

    const optedInIds = new Set((optedIn || []).map((p: any) => p.id))

    // Current userbase is well under 100, so one paginated listUsers() call and a
    // client-side filter is simpler and cheap — revisit with a smarter lookup if the
    // userbase grows enough for this to matter.
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const recipients = users.filter(u => optedInIds.has(u.id) && u.email)

    let sent = 0
    for (const tournament of tournaments) {
      for (const recipient of recipients) {
        await sendNotification(recipient.email!, tournament.name)
        sent++
      }
      await supabase.from('tournaments').update({ notified_at: new Date().toISOString() }).eq('id', tournament.id)
    }

    return NextResponse.json({ ok: true, tournaments: tournaments.length, recipients: recipients.length, sent })
  } catch (err) {
    console.error('tournaments/notify error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
