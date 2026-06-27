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
      .select('admin_id')
      .eq('id', poolId)
      .single()

    if (!pool || pool.admin_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
