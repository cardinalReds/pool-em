import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const round = searchParams.get('round')
  const tournament_id = searchParams.get('tournament_id') || 'wc_2026'

  try {
    let query = supabase
      .from('fixtures')
      .select('*')
      .eq('tournament_id', tournament_id)
      .order('date', { ascending: true })

    if (round) query = query.eq('round', round)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ fixtures: data, mock: false })
  } catch (err) {
    console.error('Fixtures error:', err)
    return NextResponse.json({ fixtures: [], mock: false, error: String(err) })
  }
}
