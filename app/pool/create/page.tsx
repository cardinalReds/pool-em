'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RulesetBuilder from '@/components/RulesetBuilder'

interface SelectedRule {
  category_id: string
  points: number
  enabled: boolean
}

export default function CreatePoolPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1
  const [name, setName] = useState('')
  
  // Step 2 — tournament selection
  const [sport, setSport] = useState('soccer')
  const [tournamentId, setTournamentId] = useState('wc_2026')
  const [deadlineType, setDeadlineType] = useState<'before_each_game' | 'before_tournament'>('before_each_game')

  // Step 3 — ruleset
  const [selectedRules, setSelectedRules] = useState<SelectedRule[]>([])

  // Step 4 — buy-in
  const [buyIn, setBuyIn] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')

  const TOURNAMENTS = [
    { id: 'wc_2026', name: 'FIFA World Cup 2026', sport: 'soccer', description: 'Group stage · Jun 12 – Jul 2' },
  ]

  async function handleCreate() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: pool, error: poolError } = await supabase.from('pools').insert({
      name,
      sport,
      tournament_id: tournamentId,
      package_id: 'CUSTOM',
      tournament_scope: 'full',
      deadline_type: deadlineType,
      invite_code: inviteCode,
      admin_id: user.id,
      is_active: true,
      buy_in_amount: buyIn ? parseFloat(buyIn) : null,
      venmo_handle: venmoHandle.replace('@', '').trim() || null,
    }).select().single()

    if (poolError) { setError(poolError.message); setLoading(false); return }

    // Save rules
    if (selectedRules.length > 0) {
      await supabase.from('pool_rules').insert(
        selectedRules.map(r => ({
          pool_id: pool.id,
          category_id: r.category_id,
          points: r.points,
        }))
      )
    }

    // Add admin as member
    await supabase.from('pool_members').insert({
      pool_id: pool.id,
      user_id: user.id,
      display_name: user.user_metadata?.display_name || 'Admin',
    })

    window.location.href = `/pool/${pool.id}`
  }

  const stepLabels = ['name', 'tournament', 'predictions', 'buy-in']

  return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px'}}>
      <div style={{background: '#111', color: 'white', padding: '10px 20px'}}>
        <a href="/dashboard" style={{fontWeight: 700, fontSize: '13px', color: 'white', textDecoration: 'none'}}>pool'em</a>
      </div>

      <div style={{maxWidth: step === 3 ? 1100 : 520, margin: '0 auto', padding: '40px 24px'}}>
        <div style={{marginBottom: '20px'}}>
          <h1 style={{fontWeight: 700, fontSize: '15px', marginBottom: '2px'}}>new pool</h1>
        </div>

        {/* Step indicator */}
        <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '24px'}}>
          {[1,2,3,4].map((s, i) => (
            <div key={s} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 600,
                background: s === step ? '#111' : s < step ? '#C8102E' : 'transparent',
                color: s <= step ? 'white' : '#bbb',
                border: `1px solid ${s <= step ? 'transparent' : '#ddd'}`,
              }}>{s < step ? '✓' : s}</div>
              <span style={{fontSize: '11px', color: s === step ? '#111' : '#bbb'}}>{stepLabels[i]}</span>
              {i < 3 && <span style={{color: '#ddd', margin: '0 2px'}}>→</span>}
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>what's this pool called?</label>
            <input className="input" placeholder="e.g. The Office World Cup" value={name}
              onChange={e => setName(e.target.value)} maxLength={50} autoFocus />
            <p style={{fontSize: '11px', color: '#aaa', marginTop: '4px'}}>your friends will see this when they join</p>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '16px'}}>
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!name.trim()}>next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Tournament */}
        {step === 2 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '12px'}}>pick a tournament</label>
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
              {TOURNAMENTS.map(t => (
                <button key={t.id} onClick={() => { setTournamentId(t.id); setSport(t.sport) }}
                  style={{
                    textAlign: 'left', padding: '10px 12px', border: '1px solid',
                    borderColor: tournamentId === t.id ? '#C8102E' : '#e0e0db',
                    background: tournamentId === t.id ? '#fff5f5' : 'white', cursor: 'pointer',
                  }}>
                  <div style={{fontWeight: 600, color: tournamentId === t.id ? '#C8102E' : '#111'}}>{t.name}</div>
                  <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>{t.description}</div>
                </button>
              ))}
            </div>

            <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>prediction deadline</label>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px'}}>
              {([
                {id: 'before_each_game', label: 'before each game', desc: 'picks lock at kickoff'},
                {id: 'before_tournament', label: 'before tournament', desc: 'all picks upfront'},
              ] as const).map(opt => (
                <button key={opt.id} onClick={() => setDeadlineType(opt.id)}
                  style={{
                    padding: '8px', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                    borderColor: deadlineType === opt.id ? '#C8102E' : '#e0e0db',
                    background: deadlineType === opt.id ? '#fff5f5' : 'white',
                  }}>
                  <div style={{fontWeight: 600, fontSize: '11px', color: deadlineType === opt.id ? '#C8102E' : '#111'}}>{opt.label}</div>
                  <div style={{fontSize: '10px', color: '#aaa', marginTop: '2px'}}>{opt.desc}</div>
                </button>
              ))}
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <button className="btn-secondary" onClick={() => setStep(1)}>← back</button>
              <button className="btn-primary" onClick={() => setStep(3)}>next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Ruleset builder */}
        {step === 3 && (
          <div>
            <RulesetBuilder
              sport={sport}
              onComplete={(rules) => { setSelectedRules(rules); setStep(4) }}
            />
            <div style={{marginTop: '16px'}}>
              <button className="btn-secondary" onClick={() => setStep(2)}>← back</button>
            </div>
          </div>
        )}

        {/* Step 4: Buy-in */}
        {step === 4 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '4px'}}>
              buy-in amount <span style={{fontWeight: 400, color: '#aaa'}}>(optional)</span>
            </label>
            <p style={{fontSize: '11px', color: '#888', marginBottom: '12px'}}>
              players will be prompted to pay you via venmo when they join. you handle the money — pool'em never touches it.
            </p>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}}>
              <span style={{fontSize: '16px', color: '#555'}}>$</span>
              <input type="number" min="0" step="1" placeholder="0" value={buyIn}
                onChange={e => setBuyIn(e.target.value)}
                style={{border: '1px solid #ddd', padding: '6px 10px', fontSize: '16px', width: 100, fontFamily: 'inherit'}} />
              <span style={{fontSize: '13px', color: '#888'}}>per person</span>
            </div>
            {buyIn && parseFloat(buyIn) > 0 && (
              <div style={{marginBottom: '12px'}}>
                <label style={{display: 'block', fontWeight: 600, marginBottom: '6px'}}>your venmo handle</label>
                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <span style={{color: '#555', fontSize: '14px'}}>@</span>
                  <input type="text" placeholder="yourhandle" value={venmoHandle}
                    onChange={e => setVenmoHandle(e.target.value.replace('@', ''))}
                    style={{border: '1px solid #ddd', padding: '6px 10px', fontSize: '13px', flex: 1, fontFamily: 'inherit'}} />
                </div>
              </div>
            )}

            <div style={{marginBottom: '12px', padding: '10px', background: '#f9f9f9', border: '1px solid #eee', fontSize: '11px', color: '#555'}}>
              <strong>{selectedRules.length} predictions</strong> selected · {name} · {TOURNAMENTS.find(t => t.id === tournamentId)?.name}
            </div>

            {error && <p style={{fontSize: '11px', color: '#C8102E', background: '#fff5f5', padding: '8px', marginBottom: '12px'}}>{error}</p>}

            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <button className="btn-secondary" onClick={() => setStep(3)}>← back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}>
                {loading ? 'creating...' : 'create pool →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
