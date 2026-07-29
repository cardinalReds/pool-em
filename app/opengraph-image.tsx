import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f7f5',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 140, fontWeight: 700, color: '#111' }}>
          pool<span style={{ color: '#C8102E' }}>&apos;em</span>
        </div>
        <div style={{ display: 'flex', marginTop: 24, fontSize: 34, color: '#666' }}>
          your group chat&apos;s prediction pool
        </div>
      </div>
    ),
    { ...size }
  )
}
