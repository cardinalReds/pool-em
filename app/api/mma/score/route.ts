import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BDL_KEY = process.env.BALLDONTLIE_API_KEY!

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
}

async function fetchFightResult(fightId: number): Promise<any> {
  const res = await fetch(`https://api.balldontlie.io/mma/v1/fights/${fightId}`, {
    headers: { Authorization: BDL_KEY }
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.data ?? null
}

function scoreMMAFight(categoryId: string, pred: any, result: any, rule: PoolRule): number {
  const winner = result.winner // { id, name } or null
  const method = result.result_method // 'KO/TKO', 'Submission', 'Decision', 'DQ', null
  const round = result.result_round // number or null

  switch (categoryId) {
    case 'mma_result': {
      if (!winner || !pred.value_wld) return 0
      const predWinner = pred.value_wld === 'home'
        ? result.fighter1?.name
        : result.fighter2?.name
      return winner.name === predWinner ? rule.points : 0
    }
    case 'mma_method': {
      if (!method || !pred.value_text) return 0
      // Normalize method names
      const normalize = (m: string) => m.toLowerCase().replace(/[\s\/]/g, '')
      return normalize(method) === normalize(pred.value_text) ? rule.points : 0
    }
    case 'mma_round_finish': {
      if (!round) return 0
      // Round stored as value_number, Decision stored as value_text
      if (method === 'Decision') {
        return pred.value_text === 'Decision' ? rule.points : 0
      }
      return pred.value_number === round ? rule.points : 0
    }
    default:
      return 0
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find MMA fixtures that are finished but not scored
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, api_fixture_id, home_team, away_team, tournament_id, home_score, away_score')
      .eq('status', 'FT')
      .eq('scored', false)
      .in('tournament_id', 
        (await supabase.from('tournaments').select('id').eq('sport', 'mma').eq('status', 'active')).data?.map(t => t.id) || []
      )

    if (!fixtures?.length) {
      return NextResponse.json({ ok: true, scored: 0, skipped: true })
    }

    let scored = 0

    for (const fixture of fixtures) {
      // Fetch result from BallDontLie
      const result = await fetchFightResult(fixture.api_fixture_id)
      if (!result || result.status !== 'completed') continue

      // Get all pools for this tournament
      const { data: pools } = await supabase
        .from('pools')
        .select('id')
        .eq('tournament_id', fixture.tournament_id)

      for (const pool of pools || []) {
        // Get pool rules
        const { data: rulesData } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points')
          .eq('pool_id', pool.id)

        const ruleMap: Record<string, PoolRule> = {}
        for (const r of rulesData || []) ruleMap[r.category_id] = r

        // Get all predictions for this fixture
        const { data: preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', pool.id)
          .eq('fixture_id', fixture.id)

        // Group preds by user for perfect fight bonus
        const predsByUser: Record<string, any[]> = {}
        for (const pred of preds || []) {
          const rule = ruleMap[pred.category_id]
          if (!rule) continue
          const points = scoreMMAFight(pred.category_id, pred, result, rule)
          await supabase.from('predictions_v2')
            .update({ points_earned: points, is_correct: points > 0 })
            .eq('id', pred.id)
          if (!predsByUser[pred.user_id]) predsByUser[pred.user_id] = []
          predsByUser[pred.user_id].push({ ...pred, points_earned: points })
        }

        // Perfect fight bonus — 4pts if all scored categories are correct
        const BONUS_POINTS = 4
        const scoredCategories = ['mma_result', 'mma_method', 'mma_round_finish'].filter(c => ruleMap[c])
        if (scoredCategories.length > 0) {
          for (const [userId, userPreds] of Object.entries(predsByUser)) {
            const allCorrect = scoredCategories.every(cat => 
              userPreds.some(p => p.category_id === cat && p.points_earned > 0)
            )
            if (allCorrect) {
              // Add bonus to the result prediction
              const resultPred = userPreds.find(p => p.category_id === 'mma_result')
              if (resultPred) {
                await supabase.from('predictions_v2')
                  .update({ points_earned: (resultPred.points_earned || 0) + BONUS_POINTS })
                  .eq('id', resultPred.id)
              }
            }
          }
        }
      }

      // Update fixture with result details
      const winner = result.winner
      await supabase.from('fixtures').update({
        scored: true,
        home_score: winner?.id === result.fighter1?.id ? 1 : 0,
        away_score: winner?.id === result.fighter2?.id ? 1 : 0,
        result_method: result.result_method || null,
        result_round: result.result_method === 'Decision' ? null : (result.result_round || null),
      }).eq('id', fixture.id)

      scored++
    }

    return NextResponse.json({ ok: true, scored })
  } catch (err) {
    console.error('MMA scoring error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
