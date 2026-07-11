import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BDL_KEY = process.env.BALLDONTLIE_API_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

async function fetchLiveMMAFights(): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const results: any[] = []
  for (const date of [today, tomorrow]) {
    const res = await fetch(
      `https://api.balldontlie.io/mma/v1/fights?date=${date}&per_page=100`,
      { headers: { Authorization: BDL_KEY } }
    )
    if (!res.ok) continue
    const data = await res.json()
    const fights = (data.data ?? []).filter((f: any) => ['in_progress', 'completed'].includes(f.status))
    results.push(...fights)
  }
  return results
}

async function triggerScoring() {
  await fetch(`${APP_URL}/api/mma/score`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {})
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check if any MMA tournament is active
    const { data: activeTournaments } = await supabase
      .from('tournaments')
      .select('id')
      .eq('sport', 'mma')
      .eq('status', 'active')

    if (!activeTournaments?.length) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no active mma tournaments' })
    }

    const liveFights = await fetchLiveMMAFights()
    if (!liveFights.length) {
      return NextResponse.json({ ok: true, live: 0, updated: 0 })
    }

    let updated = 0
    let anyJustFinished = false
    let anyLive = false

    for (const fight of liveFights) {
      const apiId = fight.id
      const isFinished = fight.status === 'completed'
      const isLive = fight.status === 'in_progress'

      const { data: ourFixture } = await supabase
        .from('fixtures')
        .select('id, status, fight_order, tournament_id, card_segment')
        .eq('api_fixture_id', apiId)
        .maybeSingle()

      if (!ourFixture) continue

      const newStatus = isFinished ? 'FT' : isLive ? 'live' : 'NS'

      if (ourFixture.status !== newStatus) {
        await supabase.from('fixtures').update({ status: newStatus }).eq('id', ourFixture.id)
        updated++

        if (isFinished && ourFixture.status !== 'FT') {
          anyJustFinished = true
          // When a fight finishes, unlock the next fight in the same segment
          // by pushing its date to now + 10 min (so it becomes lockable)
          if (ourFixture.fight_order && ourFixture.fight_order > 1) {
            const nextLockTime = new Date(Date.now() + 10 * 60 * 1000).toISOString()
            await supabase
              .from('fixtures')
              .update({ date: nextLockTime })
              .eq('tournament_id', ourFixture.tournament_id)
              .eq('card_segment', ourFixture.card_segment)
              .eq('fight_order', ourFixture.fight_order - 1) // fight_order 1 = top, so next fight is order - 1
              .eq('status', 'NS')
          }
        }
      }

      if (isLive) anyLive = true
    }

    if (anyJustFinished || anyLive) await triggerScoring()

    return NextResponse.json({ ok: true, live: liveFights.length, updated, anyJustFinished, anyLive })
  } catch (err) {
    console.error('MMA live route error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
