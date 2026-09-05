'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadRecap, estimateHeight, type RecapData } from '@/lib/recap'
import RecapPoster from '@/components/RecapPoster'

const POSTER_WIDTH = 560

// Controls drive `loadRecap` straight from React state, not from re-parsing the URL each
// render — a query-param round-trip through router.replace() + useSearchParams() was the
// original design here and it silently stopped picking up round changes. State is what's
// authoritative for triggering a reload; the URL is kept in sync alongside it purely so the
// page/link stays shareable, not as the source of truth.
export default function RecapPreviewPage({ params }: { params: { id: string } }) {
  const [round, setRound] = useState<string | undefined>(undefined)
  const [ghostsOnly, setGhostsOnly] = useState(false)
  const [rankBasis, setRankBasis] = useState<'overall' | 'ghosts'>('overall')
  const [scope, setScope] = useState<'total' | 'round'>('total')
  const [showCount, setShowCount] = useState<string>('5') // '3' | '5' | '10' | 'all'

  const [data, setData] = useState<RecapData | null>(null)
  const [roundsAvailable, setRoundsAvailable] = useState<string[]>([])
  const [error, setError] = useState<'unauthorized' | 'not_found' | 'forbidden' | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')

  // RecapPoster renders at a fixed 560px wide — it has to, since the same component also
  // renders through Satori for the PNG export, which can't do responsive units at all. On a
  // phone-width viewport that fixed width was overflowing the page. Scale it down visually
  // to fit whatever width is actually available, rather than letting it force horizontal
  // scroll — the download/PDF paths are untouched, they still use the real 560px version.
  const posterWrapRef = useRef<HTMLDivElement>(null)
  const [posterScale, setPosterScale] = useState(1)
  useEffect(() => {
    function measure() {
      const w = posterWrapRef.current?.clientWidth
      if (w) setPosterScale(Math.min(1, w / POSTER_WIDTH))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Seed initial state from the URL exactly once, so a shared/reloaded link still opens to
  // the same view — after this, state (not the URL) drives everything.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('round')) setRound(p.get('round')!)
    if (p.get('ghostsOnly') === '1') setGhostsOnly(true)
    if (p.get('rankBasis') === 'ghosts') setRankBasis('ghosts')
    if (p.get('scope') === 'round') setScope('round')
    if (p.get('show')) setShowCount(p.get('show')!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const result = await loadRecap(supabase, params.id, {
        round, baseUrl: window.location.origin, ghostsOnly, rankBasis,
        scope, showCount: showCount === 'all' ? 'all' : parseInt(showCount, 10),
      })
      if (cancelled) return
      if ('error' in result) {
        if (result.error === 'unauthorized') { window.location.href = '/auth/login'; return }
        setError(result.error)
      } else {
        setData(result.data)
        setRoundsAvailable(result.roundsAvailable)
        // Keep the address bar in sync for shareability — best-effort, never what drives a reload.
        const p = new URLSearchParams()
        const resolvedRound = round || result.roundsAvailable[0]
        if (resolvedRound) p.set('round', resolvedRound)
        if (ghostsOnly) { p.set('ghostsOnly', '1'); p.set('rankBasis', rankBasis) }
        if (scope !== 'total') p.set('scope', scope)
        if (showCount !== '5') p.set('show', showCount)
        window.history.replaceState(null, '', `/pool/${params.id}/recap?${p.toString()}`)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [params.id, round, ghostsOnly, rankBasis, scope, showCount])

  if (loading && !data) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>loading...</div>
  }

  if (error === 'forbidden') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>only pool members can share a recap.</div>
  }
  if (error === 'not_found') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>pool not found.</div>
  }
  if (!data) return null

  const imageParams = new URLSearchParams()
  const resolvedRound = round || roundsAvailable[0]
  if (resolvedRound) imageParams.set('round', resolvedRound)
  if (ghostsOnly) { imageParams.set('ghostsOnly', '1'); imageParams.set('rankBasis', rankBasis) }
  if (scope !== 'total') imageParams.set('scope', scope)
  if (showCount !== '5') imageParams.set('show', showCount)
  const imageUrl = `/pool/${params.id}/recap/image?${imageParams.toString()}`
  const filename = `${data.poolName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-recap.png`

  // Prefers the OS share sheet with the actual image attached (what most people mean by
  // "share" on a phone) — falls back to sharing just the link if the browser can't share
  // files, then to copying the link if navigator.share isn't available at all (desktop).
  async function handleShare() {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data: any) => boolean; share?: (data: any) => Promise<void> }
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: data!.poolName })
        return
      }
      if (nav.share) {
        await nav.share({ title: data!.poolName, url: window.location.href })
        return
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return // user dismissed the share sheet
    }
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch {}
  }

  const selectStyle: React.CSSProperties = { fontSize: 12, border: '1px solid #ddd', padding: '4px 8px', fontFamily: 'inherit', color: '#333', background: 'white', borderRadius: 4 }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@media print {
        .no-print { display: none !important; }
        body { background: white !important; }
        .recap-poster-scale-wrap { width: ${POSTER_WIDTH}px !important; height: auto !important; }
        .recap-poster-scale { transform: none !important; }
      }`}</style>

      <div className="no-print" style={{ width: 560, maxWidth: '100%', marginBottom: 18 }}>
        <a href={`/pool/${params.id}`} style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>← back to pool</a>

        <div style={{ marginTop: 14, padding: '12px 14px', background: 'white', border: '1px solid #e5e5e0', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            {roundsAvailable.length > 1 && (
              <label style={labelStyle}>
                round
                <select value={resolvedRound} onChange={e => setRound(e.target.value)} style={selectStyle}>
                  {roundsAvailable.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <label style={labelStyle}>
              rank by
              <select value={scope} onChange={e => setScope(e.target.value === 'round' ? 'round' : 'total')} style={selectStyle}>
                <option value="total">season total</option>
                <option value="round">this round only</option>
              </select>
            </label>
            <label style={labelStyle}>
              show
              <select value={showCount} onChange={e => setShowCount(e.target.value)} style={selectStyle}>
                <option value="3">top 3</option>
                <option value="5">top 5</option>
                <option value="10">top 10</option>
                <option value="all">everyone</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderTop: '1px solid #f0f0ed', paddingTop: 10 }}>
            <label style={labelStyle}>
              showing
              <select
                value={ghostsOnly ? '1' : '0'}
                onChange={e => setGhostsOnly(e.target.value === '1')}
                style={selectStyle}>
                <option value="0">everyone</option>
                <option value="1">ghost entries only</option>
              </select>
            </label>
            {ghostsOnly && (
              <label style={labelStyle}>
                ranked by
                <select value={rankBasis} onChange={e => setRankBasis(e.target.value === 'ghosts' ? 'ghosts' : 'overall')} style={selectStyle}>
                  <option value="overall">overall leaderboard</option>
                  <option value="ghosts">ghosts only</option>
                </select>
              </label>
            )}
          </div>
        </div>
      </div>

      <div ref={posterWrapRef} style={{ width: '100%', maxWidth: POSTER_WIDTH }}>
        <div className="recap-poster-scale-wrap" style={{
          width: POSTER_WIDTH * posterScale, height: estimateHeight(data) * posterScale, margin: '0 auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden',
          opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
        }}>
          <div className="recap-poster-scale" style={{ width: POSTER_WIDTH, transform: `scale(${posterScale})`, transformOrigin: 'top left' }}>
            <RecapPoster data={data} interactive />
          </div>
        </div>
      </div>

      <style>{`
        .recap-actions { width: 560px; max-width: 100%; display: flex; gap: 8px; margin-top: 16px; }
        .recap-actions > * { min-width: 0; }
        @media (max-width: 460px) {
          .recap-actions { flex-direction: column; }
        }
      `}</style>
      <div className="no-print recap-actions">
        <button onClick={handleShare} style={{ flex: 1, padding: '11px', fontSize: '13px', fontWeight: 600, background: 'white', color: '#C8102E', border: '1px solid #C8102E', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}>
          {shareState === 'copied' ? 'link copied ✓' : 'share'}
        </button>
        <a href={imageUrl} download={filename} style={{ flex: 1, textDecoration: 'none' }}>
          <button style={{ width: '100%', padding: '11px', fontSize: '13px', fontWeight: 600, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}>
            download as image
          </button>
        </a>
        <button onClick={() => window.print()} style={{ flex: 1, padding: '11px', fontSize: '13px', background: 'white', color: '#555', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6 }}>
          save as pdf
        </button>
      </div>
    </div>
  )
}
