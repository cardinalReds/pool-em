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
    <div className="flex gap-2">
      <input
        className="input-chalk text-xs flex-1"
        value={url}
        readOnly
        onClick={e => (e.target as HTMLInputElement).select()}
      />
      <button
        onClick={handleCopy}
        className="btn-turf text-xs py-2 px-3 whitespace-nowrap"
        style={{fontSize: '0.75rem'}}
      >
        {copied ? 'COPIED!' : 'COPY'}
      </button>
    </div>
  )
}
