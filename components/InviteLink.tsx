'use client'

import { useState } from 'react'

export default function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{display: 'flex', gap: '0.4rem'}}>
      <input className="input" value={url} readOnly onClick={e => (e.target as HTMLInputElement).select()}
        style={{fontSize: '0.7rem', flex: 1}} />
      <button className="btn-primary" onClick={handleCopy} style={{whiteSpace: 'nowrap', padding: '0.4rem 0.75rem', fontSize: '0.75rem'}}>
        {copied ? 'copied!' : 'copy'}
      </button>
    </div>
  )
}
