'use client'

import { useState } from 'react'

export default function InvitePanel({ poolName, inviteUrl, buyInAmount, inviterName }: {
  poolName: string
  inviteUrl: string
  buyInAmount?: number | null
  inviterName?: string | null
}) {
  const [copied, setCopied] = useState(false)

  const shareText = [
    `Hey! Join my "${poolName}" pool on pool'em!`,
    buyInAmount ? `$${buyInAmount} buy-in.` : '',
    `Make your picks here:`,
  ].filter(Boolean).join(' ')

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${poolName} on pool'em`,
          text: shareText,
          url: inviteUrl,
        })
      } catch {}
    } else {
      handleCopy()
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = inviteUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={handleShare}
        style={{ width: '100%', padding: '9px', fontSize: '12px', fontWeight: 600, background: '#111', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        📤 share invite
      </button>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          readOnly
          value={inviteUrl}
          onClick={e => (e.target as HTMLInputElement).select()}
          style={{ fontSize: '10px', border: '1px solid #ddd', padding: '5px 6px', flex: 1, minWidth: 0, color: '#888', background: '#fafafa', fontFamily: 'inherit' }}
        />
        <button
          onClick={handleCopy}
          style={{ fontSize: '10px', padding: '5px 10px', background: 'white', color: '#111', border: '1px solid #ddd', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
          {copied ? '✓ copied' : 'copy link'}
        </button>
      </div>
    </div>
  )
}
