import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadRecap, estimateHeight } from '@/lib/recap'
import RecapPoster from '@/components/RecapPoster'

// Gated identically to the preview page — both call loadRecap, which resolves the
// requesting user from the session cookie and requires pool.admin_id === user.id.
// Anyone hitting this URL directly without that gets a plain 401/403/404, no image.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const round = request.nextUrl.searchParams.get('round') || undefined
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pool-em.com'

  const supabase = await createClient()
  const result = await loadRecap(supabase, params.id, { round, baseUrl })

  if ('error' in result) {
    const status = result.error === 'unauthorized' ? 401 : result.error === 'forbidden' ? 403 : 404
    return new Response(result.error, { status })
  }

  const { data } = result
  const scale = 2
  const width = 560 * scale
  const height = estimateHeight(data) * scale

  return new ImageResponse(<RecapPoster data={data} scale={scale} />, { width, height })
}
