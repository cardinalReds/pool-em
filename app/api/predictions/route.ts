import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { pool_id, fixture_id, predicted_result, predicted_home_score, predicted_away_score, predicted_first_scorer_name } = body

  // Check pool exists and user is a member
  const { data: member } = await supabase
    .from('pool_members')
    .select('id')
    .eq('pool_id', pool_id)
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })

  // Upsert prediction
  const { data, error } = await supabase
    .from('predictions')
    .upsert({
      pool_id,
      user_id: user.id,
      fixture_id,
      predicted_result,
      predicted_home_score,
      predicted_away_score,
      predicted_first_scorer_name,
      submitted_at: new Date().toISOString(),
    }, {
      onConflict: 'pool_id,user_id,fixture_id',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prediction: data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const pool_id = searchParams.get('pool_id')

  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('pool_id', pool_id!)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ predictions: data })
}
