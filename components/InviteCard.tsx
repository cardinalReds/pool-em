'use client'

import { useState } from 'react'

export interface InviteRule {
  category_id: string
  name: string
  description: string
  points: number
}

export default function InviteCard({
  poolName, sport, inviterNames, mutualContactNames, rules, onAccept, onDecline,
}: {
  poolName: string
  sport: string
  inviterNames: string[]
  mutualContactNames: string[]
  rules: InviteRule[]
  onAccept: () => void
  onDecline: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handle(action: () => void) {
    setBusy(true)
    await action()
  }

  const shownRules = expanded ? rules : rules.slice(0, 3)

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{poolName}</div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', textTransform: 'uppercase' as const }}>{sport?.replace('_', ' ')}</span>
      </div>

      {inviterNames.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>
          invited by <strong>{inviterNames.join(', ')}</strong>
        </div>
      )}

      {mutualContactNames.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 10 }}>
          {mutualContactNames.length} of your contacts already in this pool: {mutualContactNames.join(', ')}
        </div>
      )}

      {rules.length > 0 && (
        <div style={{ border: '1px solid var(--border-light)', padding: '8px 10px', marginBottom: 12, fontSize: '0.75rem' }}>
          <div style={{ color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase' as const, fontSize: '0.65rem', fontWeight: 600 }}>what this pool scores</div>
          {shownRules.map(r => (
            <div key={r.category_id} title={r.description} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-dim)' }}>{r.name}</span>
              <span style={{ color: 'var(--text-faint)' }}>{r.points} pt{r.points === 1 ? '' : 's'}</span>
            </div>
          ))}
          {rules.length > 3 && (
            <button onClick={() => setExpanded(e => !e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'inherit' }}>
              {expanded ? 'show less' : `+${rules.length - 3} more`}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={busy}
          onClick={() => handle(onAccept)}
          style={{ flex: 1, padding: '9px', fontSize: '0.8rem', fontWeight: 600, background: '#2d7a2d', color: 'white', border: 'none', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          accept
        </button>
        <button
          disabled={busy}
          onClick={() => handle(onDecline)}
          style={{ flex: 1, padding: '9px', fontSize: '0.8rem', fontWeight: 600, background: 'white', color: 'var(--red)', border: '1px solid var(--red)', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          decline
        </button>
      </div>
    </div>
  )
}
