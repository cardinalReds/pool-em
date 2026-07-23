'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SimpleFixture {
  id: number
  home_team: string
  away_team: string
  date: string
}

export default function Best5Selector({ poolId, round, selectedIds, allFixtures, locked, lockTime, onSwap }: {
  poolId: string
  round: string
  selectedIds: number[]
  allFixtures: SimpleFixture[]
  locked: boolean
  lockTime: Date | null
  onSwap: (oldFixtureId: number, newFixtureId: number) => void
}) {
  const [swapping, setSwapping] = useState<number | null>(null)
  const [openFor, setOpenFor] = useState<number | null>(null)

  const selected = selectedIds.map(id => allFixtures.find(f => f.id === id)).filter(Boolean) as SimpleFixture[]
  const bench = allFixtures.filter(f => !selectedIds.includes(f.id))

  async function swap(oldFixtureId: number, newFixtureId: number) {
    setSwapping(oldFixtureId)
    const supabase = createClient()
    await supabase.from('pool_matchweek_selections').delete().eq('pool_id', poolId).eq('round', round).eq('fixture_id', oldFixtureId)
    await supabase.from('pool_matchweek_selections').insert({ pool_id: poolId, round, fixture_id: newFixtureId, source: 'admin' })
    onSwap(oldFixtureId, newFixtureId)
    setSwapping(null)
    setOpenFor(null)
  }

  if (locked) return null

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #e0e0db', padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>admin: edit this matchweek's 5 games</span>
        {lockTime && <span style={{ textTransform: 'none' as const, fontWeight: 400 }}>locks {lockTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
      {selected.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: '12px', borderTop: '1px solid #eee' }}>
          <span>{f.away_team} @ {f.home_team}</span>
          {openFor === f.id ? (
            <select
              autoFocus
              disabled={swapping === f.id}
              onChange={e => { if (e.target.value) swap(f.id, parseInt(e.target.value)) }}
              onBlur={() => setOpenFor(null)}
              style={{ fontSize: '12px', fontFamily: 'inherit', padding: '4px 6px' }}
            >
              <option value="">swap for…</option>
              {bench.map(b => (
                <option key={b.id} value={b.id}>{b.away_team} @ {b.home_team}</option>
              ))}
            </select>
          ) : (
            <button type="button" onClick={() => setOpenFor(f.id)} disabled={swapping === f.id || bench.length === 0}
              style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid #ddd', background: 'white', cursor: bench.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', color: bench.length === 0 ? '#ccc' : '#555' }}>
              {swapping === f.id ? 'swapping…' : 'swap'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
