import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + 31 * 60 * 1000) // 31 min lookahead (cron runs every 30)

    // Get all upcoming fixtures in the next 24 hours
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, date, home_team, away_team, round')
      .eq('status', 'NS') // not started
      .gte('date', now.toISOString())
      .lte('date', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    let sent = 0

    for (const fixture of fixtures) {
      const kickoff = new Date(fixture.date)
      const hoursUntilKickoff = (kickoff.getTime() - now.getTime()) / (1000 * 60 * 60)

      // Get all reminders where hours_before matches the window
      // Window: kickoff is between (hours_before - 0.5) and (hours_before + 0.5) hours away
      const { data: allReminders } = await supabase
        .from('reminders')
        .select('id, user_id, email, hours_before, pool_id, sent_fixture_ids')

      const matchingReminders = (allReminders || []).filter(r => {
        const target = r.hours_before * 60 // minutes
        const actual = (kickoff.getTime() - now.getTime()) / (1000 * 60) // minutes until kickoff
        // Match if we're within 30 min of the target window
        return actual >= target - 15 && actual <= target + 15
      })

      for (const reminder of matchingReminders) {
        // Skip if already sent for this fixture
        if ((reminder.sent_fixture_ids || []).includes(fixture.id)) continue
        // Check this fixture is in the user's pool tournament
        const { data: pool } = await supabase
          .from('pools')
          .select('id, name, tournament_id')
          .eq('id', reminder.pool_id)
          .single()

        if (!pool) continue

        // Check user is a member of this pool
        const { data: membership } = await supabase
          .from('pool_members')
          .select('id')
          .eq('pool_id', pool.id)
          .eq('user_id', reminder.user_id)
          .maybeSingle()

        if (!membership) continue

        // Check they haven't already submitted picks for this fixture
        const { data: existingPick } = await supabase
          .from('predictions_v2')
          .select('id')
          .eq('pool_id', pool.id)
          .eq('user_id', reminder.user_id)
          .eq('fixture_id', fixture.id)
          .limit(1)
          .maybeSingle()

        const hasPicks = !!existingPick
        const poolUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pool/${pool.id}`
        const hoursLabel = Math.round(hoursUntilKickoff)

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: "pool'em <reminders@pool-em.com>",
            to: reminder.email,
            subject: `⏱ ${fixture.home_team} vs ${fixture.away_team} kicks off in ${hoursLabel}h`,
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">pool'em</div>
                <div style="color: #888; font-size: 12px; margin-bottom: 24px;">${pool.name}</div>

                <div style="background: #111; color: white; padding: 16px; margin-bottom: 16px;">
                  <div style="font-size: 11px; color: #888; margin-bottom: 8px;">${fixture.round}</div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; font-size: 15px;">${fixture.home_team}</span>
                    <span style="color: #555; font-size: 12px;">vs</span>
                    <span style="font-weight: 700; font-size: 15px;">${fixture.away_team}</span>
                  </div>
                  <div style="font-size: 11px; color: #888; margin-top: 8px;">kicks off in ${hoursLabel} hour${hoursLabel !== 1 ? 's' : ''}</div>
                </div>

                ${hasPicks
                  ? `<p style="font-size: 13px; color: #2d7a2d; margin-bottom: 16px;">✓ you've already submitted your picks for this game.</p>`
                  : `<p style="font-size: 13px; color: #C8102E; font-weight: 600; margin-bottom: 16px;">⚠️ you haven't submitted your picks yet!</p>`
                }

                <a href="${poolUrl}" style="display: inline-block; background: #111; color: white; padding: 10px 24px; text-decoration: none; font-weight: 600; font-size: 13px;">
                  ${hasPicks ? 'view pool →' : 'submit picks →'}
                </a>

                <p style="color: #aaa; font-size: 10px; margin-top: 32px;">
                  you're receiving this because you set a ${hoursLabel}h reminder in ${pool.name}.<br/>
                  <a href="${poolUrl}" style="color: #aaa;">manage reminders</a>
                </p>
              </div>
            `,
          }),
        })

        if (res.ok) {
          sent++
          // Mark this fixture as sent so we don't send again
          await supabase
            .from('reminders')
            .update({ sent_fixture_ids: [...(reminder.sent_fixture_ids || []), fixture.id] })
            .eq('id', reminder.id)
        }
        else {
          const err = await res.json()
          console.error('Resend error for', reminder.email, err)
        }
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error('Reminder cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
