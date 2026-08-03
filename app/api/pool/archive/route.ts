import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Was trusting a client-supplied userId with no session check at all — anyone could
    // archive/unarchive any pool by passing its real admin_id (readable via the open
    // pools SELECT policy) as userId. Verify the actual caller instead, same pattern as
    // account/delete: this app's browser client keeps its session in localStorage, not
    // cookies, so the caller sends their own access token to verify against Supabase auth.
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { poolId, archived } = await request.json()
    if (!poolId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const { data: pool } = await supabase
      .from('pools')
      .select('admin_id, tournament_id')
      .eq('id', poolId)
      .single()

    if (!pool || pool.admin_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Only allow archiving if past the tournament end_date
    // Skip this check when unarchiving
    if (archived !== false && pool.tournament_id) {
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('end_date')
        .eq('id', pool.tournament_id)
        .maybeSingle()

      if (tournament?.end_date && new Date(tournament.end_date) > new Date()) {
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
