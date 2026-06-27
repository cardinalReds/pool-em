import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { poolId, userId, archived } = await request.json()
    if (!poolId || !userId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const { data: pool } = await supabase
      .from('pools')
      .select('admin_id, tournament_id')
      .eq('id', poolId)
      .single()

    if (!pool || pool.admin_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Only allow archiving if the competition is over (no live or upcoming fixtures)
    // Skip this check when unarchiving
    if (archived !== false && pool.tournament_id) {
      const { data: activeFixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', pool.tournament_id)
        .in('status', ['NS', 'live', '1H', '2H', 'HT', 'ET', 'P'])
        .limit(1)

      if (activeFixtures && activeFixtures.length > 0) {
        return NextResponse.json({ error: 'Competition is not over yet' }, { status: 400 })
      }
    }

    await supabase
      .from('pools')
      .update({ archived: archived ?? true })
      .eq('id', poolId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
