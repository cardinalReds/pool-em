import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BDL_KEY = process.env.BALLDONTLIE_API_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

async function fetchMMAFightsByEvent(eventId: number): Promise<any[]> {
  const res = await fetch(
    `https://api.balldontlie.io/mma/v1/fights?event_ids[]=${eventId}&per_page=100`,
    { headers: { Authorization: BDL_KEY } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

async function fetchLiveMMAFights(eventIds: number[]): Promise<any[]> {
  const results: any[] = []
  for (const eventId of eventIds) {
    const fights = await fetchMMAFightsByEvent(eventId)
    results.push(...fights.filter((f: any) => ['in_progress', 'completed'].includes(f.status)))
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

    // Get BallDontLie event IDs from tournaments table
    const eventIds: number[] = []
    for (const t of activeTournaments) {
      const { data: tData } = await supabase.from('tournaments').select('api_league_id').eq('id', t.id).single()
      if (tData?.api_league_id) eventIds.push(tData.api_league_id)
    }
    if (!eventIds.length) return NextResponse.json({ ok: true, skipped: true, reason: 'no event IDs configured' })

    const liveFights = await fetchLiveMMAFights(eventIds)
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
