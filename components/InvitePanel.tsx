'use client'

import { useState } from 'react'

export default function InvitePanel({ poolId, poolName, inviteUrl, buyInAmount, payoutStructure }: {
  poolId: string
  poolName: string
  inviteUrl: string
  buyInAmount?: number | null
  payoutStructure?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [smsSent, setSmsSent] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'link' | 'sms' | 'email'>('link')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for mobile browsers that block clipboard
      const el = document.createElement('textarea')
      el.value = inviteUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleNativeShare() {
    if (navigator.share) {
      navigator.share({
        title: `Join ${poolName} on pool'em`,
        text: `You've been invited to join ${poolName}!`,
        url: inviteUrl,
      })
    } else {
      handleCopy()
    }
  }

  async function handleSMS() {
    if (!phone.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/invite/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), poolName, inviteUrl }),
      })
      if (!res.ok) throw new Error('Failed to send')
      setSmsSent(true)
      setPhone('')
      setTimeout(() => setSmsSent(false), 3000)
    } catch {
      setError('Failed to send SMS. Check the number and try again.')
    }
    setSending(false)
  }

  async function handleEmail() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/invite/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), poolName, inviteUrl, buyInAmount, payoutStructure }),
      })
      if (!res.ok) throw new Error('Failed to send')
      setEmailSent(true)
      setEmail('')
      setTimeout(() => setEmailSent(false), 3000)
    } catch {
      setError('Failed to send email. Try again.')
    }
    setSending(false)
  }

  const tabStyle = (t: typeof tab): React.CSSProperties => ({
    flex: 1, padding: '5px 0', fontSize: '11px', cursor: 'pointer',
    border: 'none', borderBottom: tab === t ? '2px solid #111' : '2px solid transparent',
    background: 'none', fontFamily: 'inherit',
    color: tab === t ? '#111' : '#aaa', fontWeight: tab === t ? 600 : 400,
  })

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '12px' }}>
        <button style={tabStyle('link')} onClick={() => setTab('link')}>link</button>
        <button style={tabStyle('sms')} onClick={() => setTab('sms')}>sms</button>
        <button style={tabStyle('email')} onClick={() => setTab('email')}>email</button>
      </div>

      {/* Link tab */}
      {tab === 'link' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              readOnly
              value={inviteUrl}
              onClick={e => (e.target as HTMLInputElement).select()}
              style={{ fontSize: '10px', border: '1px solid #ddd', padding: '5px 6px', flex: 1, minWidth: 0, color: '#888', background: '#fafafa', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleCopy}
              style={{ fontSize: '10px', padding: '5px 10px', background: '#111', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
              {copied ? '✓ copied' : 'copy'}
            </button>
          </div>
          {'share' in navigator && (
            <button
              onClick={handleNativeShare}
              style={{ width: '100%', padding: '7px', fontSize: '11px', fontWeight: 600, background: 'white', color: '#111', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit' }}>
              share via...
            </button>
          )}
        </div>
      )}

      {/* SMS tab */}
      {tab === 'sms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            style={{ border: '1px solid #ddd', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }}
          />
          <button
            onClick={handleSMS}
            disabled={sending || !phone.trim()}
            style={{ width: '100%', padding: '7px', fontSize: '11px', fontWeight: 600, background: phone.trim() ? '#111' : '#ddd', color: 'white', border: 'none', cursor: phone.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {sending ? 'sending...' : smsSent ? '✓ sent!' : 'send invite via sms'}
          </button>
          {error && <div style={{ fontSize: '10px', color: '#C8102E' }}>{error}</div>}
        </div>
      )}

      {/* Email tab */}
      {tab === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="friend@email.com"
            style={{ border: '1px solid #ddd', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }}
          />
          <button
            onClick={handleEmail}
            disabled={sending || !email.trim()}
            style={{ width: '100%', padding: '7px', fontSize: '11px', fontWeight: 600, background: email.trim() ? '#111' : '#ddd', color: 'white', border: 'none', cursor: email.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {sending ? 'sending...' : emailSent ? '✓ sent!' : 'send invite via email'}
          </button>
          {error && <div style={{ fontSize: '10px', color: '#C8102E' }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
