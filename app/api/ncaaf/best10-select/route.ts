import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { selectBest10 } from '@/lib/best10Selection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  const { poolId, round } = await request.json()
  if (!poolId || !round) {
    return NextResponse.json({ error: 'poolId and round are required' }, { status: 400 })
  }

  const { data: pool } = await supabase.from('pools').select('id, tournament_id, cfb_game_mode').eq('id', poolId).maybeSingle()
  if (!pool || pool.cfb_game_mode !== 'best10') {
    return NextResponse.json({ error: 'Pool is not in best10 mode' }, { status: 400 })
  }

  // Stable once computed — never re-picked out from under members who've already
  // predicted on it. Only an explicit admin override (a separate write, source: 'admin')
  // changes a selection after this point.
  const { data: existing } = await supabase
    .from('pool_matchweek_selections')
    .select('fixture_id')
    .eq('pool_id', poolId)
    .eq('round', round)
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, fixtureIds: existing.map(r => r.fixture_id) })
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_team, away_team, date')
    .eq('tournament_id', pool.tournament_id)
    .eq('round', round)

  if (!fixtures || fixtures.length === 0) {
    return NextResponse.json({ ok: true, fixtureIds: [] })
  }

  const fixtureIds = selectBest10(fixtures)

  const { error } = await supabase.from('pool_matchweek_selections').upsert(
    fixtureIds.map(fixture_id => ({ pool_id: poolId, round, fixture_id, source: 'auto' })),
    { onConflict: 'pool_id,round,fixture_id' }
  )
  if (error) {
    console.error('best10-select upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fixtureIds })
}
