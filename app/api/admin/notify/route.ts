import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Site owner's inbox for these digests — deliberately not the same as their login email,
// so keep it a separate env var rather than deriving it from ADMIN_USER_ID's account.
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL!
// Only pools this user administers are included in the chat digest (not every pool on
// the site) — this is "tell me what's happening in my pools", not a global chat firehose.
const ADMIN_USER_ID = process.env.ADMIN_USER_ID!

async function getCheckpoint(key: string): Promise<{ lastSeenAt: string }> {
  const { data } = await supabase
    .from('admin_notify_checkpoints')
    .select('last_seen_at')
    .eq('key', key)
    .maybeSingle()

  if (data) return { lastSeenAt: data.last_seen_at }

  // First run for this feed ever — baseline to 24h ago rather than "now" (which would
  // silently swallow anything that happened between whenever this was deployed and
  // whenever the cron actually first fires) or the dawn of time (which would dump every
  // historical signup in one email). Runs through the normal send path below, not a
  // special skip case — a real first-run event should still notify.
  const lastSeenAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('admin_notify_checkpoints').upsert({ key, last_seen_at: lastSeenAt })
  return { lastSeenAt }
}

async function setCheckpoint(key: string, lastSeenAt: string) {
  await supabase.from('admin_notify_checkpoints').upsert({ key, last_seen_at: lastSeenAt })
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ADMIN_NOTIFY_EMAIL || !ADMIN_USER_ID) {
    return NextResponse.json({ error: 'ADMIN_NOTIFY_EMAIL / ADMIN_USER_ID not configured' }, { status: 500 })
  }

  const sections: string[] = []
  const subjectParts: string[] = []

  // ── New accounts, site-wide ──
  const accountsCheckpoint = await getCheckpoint('new_accounts')
  {
    const { data: newProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, created_at')
      .gt('created_at', accountsCheckpoint.lastSeenAt)
      .order('created_at', { ascending: true })

    if (newProfiles && newProfiles.length > 0) {
      const rows = await Promise.all(newProfiles.map(async (p) => {
        const { data } = await supabase.auth.admin.getUserById(p.id)
        return { ...p, email: data?.user?.email || '(no email)' }
      }))

      subjectParts.push(`${rows.length} new signup${rows.length !== 1 ? 's' : ''}`)
      sections.push(`
        <div style="margin-bottom: 24px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px;">🆕 New accounts</div>
          ${rows.map(r => `
            <div style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">
              <strong>${escapeHtml(r.display_name)}</strong> — ${escapeHtml(r.email)}
            </div>
          `).join('')}
        </div>
      `)

      await setCheckpoint('new_accounts', newProfiles[newProfiles.length - 1].created_at!)
    }
  }

  // ── New chat messages, scoped to pools this admin runs ──
  const messagesCheckpoint = await getCheckpoint('pool_messages')
  {
    const { data: myPools } = await supabase
      .from('pools')
      .select('id, name')
      .eq('admin_id', ADMIN_USER_ID)

    const poolIds = (myPools || []).map(p => p.id)
    const poolNameById: Record<string, string> = {}
    for (const p of myPools || []) poolNameById[p.id] = p.name

    if (poolIds.length > 0) {
      const { data: newMessages } = await supabase
        .from('messages')
        .select('id, pool_id, display_name, content, created_at')
        .in('pool_id', poolIds)
        .gt('created_at', messagesCheckpoint.lastSeenAt)
        .order('created_at', { ascending: true })
        .limit(200)

      if (newMessages && newMessages.length > 0) {
        subjectParts.push(`${newMessages.length} new message${newMessages.length !== 1 ? 's' : ''}`)
        sections.push(`
          <div style="margin-bottom: 24px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px;">💬 New chat activity</div>
            ${newMessages.map(m => `
              <div style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                <div style="color: #888; font-size: 11px; margin-bottom: 2px;">${escapeHtml(poolNameById[m.pool_id] || 'unknown pool')}</div>
                <strong>${escapeHtml(m.display_name)}:</strong> ${escapeHtml(m.content)}
              </div>
            `).join('')}
          </div>
        `)

        await setCheckpoint('pool_messages', newMessages[newMessages.length - 1].created_at!)
      }
    }
  }

  if (sections.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'nothing new' })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "pool'em <reminders@pool-em.com>",
      to: ADMIN_NOTIFY_EMAIL,
      subject: `pool'em activity: ${subjectParts.join(', ')}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 24px;">pool'em admin digest</div>
          ${sections.join('')}
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error for admin digest', err)
    return NextResponse.json({ ok: false, error: err }, { status: 502 })
  }

  return NextResponse.json({ ok: true, sent: true })
}

// Vercel Cron sends GET, not POST — every other cron route here handles both for the
// same reason (see /api/odds, /api/reminders, /api/pl/score). Without this, the 149
// scheduled runs before this fix all 405'd instantly, never executing any of the above.
export async function GET(request: NextRequest) {
  return POST(request)
}
