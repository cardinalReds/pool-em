import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeWeeklyPayouts } from '@/lib/weeklyPayouts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Backup for the client-side trigger in WeeklyPot (which only fires when the admin
// views their pool) — runs on a schedule so payouts get computed even if the admin
// doesn't happen to check in right after a matchday finishes. No external API calls
// here (pure DB read/compute/write), so a frequent schedule costs nothing extra.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: pools } = await supabase
      .from('pools')
      .select('id, tournament_id, weekly_buy_in, weekly_payout_structure, admin_fee_percent')
      .gt('weekly_buy_in', 0)
      .not('tournament_id', 'is', null)

    let poolsChecked = 0
    let matchdaysComputed = 0
    for (const pool of pools || []) {
      poolsChecked++
      const results = await computeWeeklyPayouts(
        supabase, pool.id, pool.tournament_id, pool.weekly_buy_in, pool.weekly_payout_structure, pool.admin_fee_percent
      )
      matchdaysComputed += results.length
    }

    return NextResponse.json({ ok: true, poolsChecked, matchdaysComputed })
  } catch (err) {
    console.error('Weekly payouts cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
