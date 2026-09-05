import { NextRequest, NextResponse } from 'next/server'
import { fetchApRankings } from '@/lib/cfbRankings'

const SEASON = 2026

// Thin client-facing proxy — fetchApRankings needs CFBD_API_KEY, a server-only secret, so
// components/NFLGamesList.tsx (a client component) can't call it directly. Returns an empty
// object (never an error) if the key isn't set or the week's poll hasn't been released yet —
// the UI treats "no ranking" as "just don't show a rank badge," not a failure state.
export async function GET(request: NextRequest) {
  const week = parseInt(request.nextUrl.searchParams.get('week') || '', 10)
  if (isNaN(week)) return NextResponse.json({ error: 'week is required' }, { status: 400 })
  const rankings = await fetchApRankings(SEASON, week)
  return NextResponse.json({ rankings: Object.fromEntries(rankings) })
}
