import { NextRequest, NextResponse } from 'next/server'
import { syncOddsApiFootball } from '@/lib/oddsApiSync'

// Same as app/api/oddsapi/nfl/route.ts — see that file for why. api-sports.io's
// american-football odds product (app/api/ncaaf/odds/route.ts) is left running as a fallback.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncOddsApiFootball('americanfootball_ncaaf', 'ncaaf_2026')
    return NextResponse.json(result)
  } catch (err) {
    console.error('NCAAF oddsapi sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
