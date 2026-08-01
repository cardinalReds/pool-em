'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadRecap, type RecapData } from '@/lib/recap'
import RecapPoster from '@/components/RecapPoster'

export default function RecapPreviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const round = searchParams.get('round') || undefined

  const [data, setData] = useState<RecapData | null>(null)
  const [roundsAvailable, setRoundsAvailable] = useState<string[]>([])
  const [error, setError] = useState<'unauthorized' | 'not_found' | 'forbidden' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const result = await loadRecap(supabase, params.id, { round, baseUrl: window.location.origin })
      if (cancelled) return
      if ('error' in result) {
        if (result.error === 'unauthorized') { window.location.href = '/auth/login'; return }
        setError(result.error)
      } else {
        setData(result.data)
        setRoundsAvailable(result.roundsAvailable)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [params.id, round])

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>loading...</div>
  }

  if (error === 'forbidden') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>only the pool admin can share a recap.</div>
  }
  if (error === 'not_found') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>pool not found.</div>
  }
  if (!data) return null

  const imageUrl = `/pool/${params.id}/recap/image${round ? `?round=${encodeURIComponent(round)}` : ''}`

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>

      <div className="no-print" style={{ width: 560, maxWidth: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <a href={`/pool/${params.id}`} style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>← back to pool</a>
        {roundsAvailable.length > 1 && (
          <select
            value={round || roundsAvailable[0]}
            onChange={e => router.replace(`/pool/${params.id}/recap?round=${encodeURIComponent(e.target.value)}`)}
            style={{ fontSize: 12, border: '1px solid #ddd', padding: '4px 8px', fontFamily: 'inherit', color: '#333', background: 'white' }}>
            {roundsAvailable.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      <div style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #eee' }}>
        <RecapPoster data={data} />
      </div>

      <div className="no-print" style={{ width: 560, maxWidth: '100%', display: 'flex', gap: 8, marginTop: 16 }}>
        <a href={imageUrl} download={`${data.poolName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-recap.png`} style={{ flex: 1, textDecoration: 'none' }}>
          <button style={{ width: '100%', padding: '11px', fontSize: '13px', fontWeight: 600, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            download as image
          </button>
        </a>
        <button onClick={() => window.print()} style={{ padding: '11px 16px', fontSize: '13px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit' }}>
          save as pdf
        </button>
      </div>
    </div>
  )
}
