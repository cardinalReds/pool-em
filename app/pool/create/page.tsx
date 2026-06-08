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

  // Bracket settings (only when deadline = before_tournament)
  const [pickMode, setPickMode] = useState<'simple' | 'full'>('simple')
  const [bracketScoring, setBracketScoring] = useState({
    r32_points: 1, r16_points: 2, qf_points: 4,
    sf_points: 8, final_points: 16, winner_points: 32,
  })

  // Step 4 — buy-in
  const [buyIn, setBuyIn] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [payoutTemplate, setPayoutTemplate] = useState<string>('winner')
  const [customPayout, setCustomPayout] = useState('')

  const PAYOUT_TEMPLATES = [
    { id: 'winner', label: 'Winner takes all', description: '1st place gets the full pot' },
    { id: 'top2', label: 'Top 2 split', description: '1st: 70% · 2nd: 30%' },
    { id: 'top3', label: 'Top 3 split', description: '1st: 60% · 2nd: 25% · 3rd: 15%' },
    { id: 'top3_equal', label: 'Top 3 equal', description: '1st, 2nd, 3rd split evenly' },
    { id: 'custom', label: 'Custom', description: 'Write your own payout rules' },
  ]

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
      payout_structure: buyIn && parseFloat(buyIn) > 0
        ? (payoutTemplate === 'custom' ? customPayout.trim() : PAYOUT_TEMPLATES.find(t => t.id === payoutTemplate)?.description || null)
        : null,
      pick_mode: deadlineType === 'before_tournament' ? pickMode : null,
    }).select().single()

    if (poolError) { setError(poolError.message); setLoading(false); return }

    // Save rules
    if (selectedRules.length > 0) {
      await supabase.from('pool_rules').insert(
        selectedRules.map(r => ({
          pool_id: pool.id,
          category_id: r.category_id,
          points: r.points,
          bonus_points: r.bonus_points || 0,
        }))
      )
    }

    // Save bracket scoring rules if before_tournament pool
    if (deadlineType === 'before_tournament') {
      await supabase.from('bracket_scoring_rules').insert({
        pool_id: pool.id,
        ...bracketScoring,
      })
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

      <div style={{maxWidth: step === 3 ? 1100 : 520, margin: '0 auto', padding: '24px 16px'}}>
        <div style={{marginBottom: '16px'}}>
          <h1 style={{fontWeight: 700, fontSize: '15px', marginBottom: '2px'}}>new pool</h1>
        </div>

        {/* Step indicator */}
        <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' as const}}>
          {[1,2,3,4].map((s, i) => (
            <div key={s} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 600, flexShrink: 0,
                background: s === step ? '#111' : s < step ? '#C8102E' : 'transparent',
                color: s <= step ? 'white' : '#bbb',
                border: `1px solid ${s <= step ? 'transparent' : '#ddd'}`,
              }}>{s < step ? '✓' : s}</div>
              <span style={{fontSize: '11px', color: s === step ? '#111' : '#bbb', whiteSpace: 'nowrap' as const}}>{stepLabels[i]}</span>
              {i < 3 && <span style={{color: '#ddd', margin: '0 2px'}}>→</span>}
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>what's this pool called?</label>
            <input className="input" placeholder="e.g. The Office World Cup" value={name}
              onChange={e => setName(e.target.value)} maxLength={50} autoFocus
              style={{fontSize: '16px', padding: '10px 12px'}} />
            <p style={{fontSize: '11px', color: '#aaa', marginTop: '6px'}}>your friends will see this when they join</p>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '16px'}}>
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!name.trim()}
                style={{padding: '10px 24px', fontSize: '14px', minHeight: 44}}>next →</button>
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
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
              {([
                {id: 'before_each_game', label: 'before each game', desc: 'picks lock at kickoff'},
                {id: 'before_tournament', label: 'before tournament', desc: 'all picks upfront'},
              ] as const).map(opt => (
                <button key={opt.id} onClick={() => setDeadlineType(opt.id)}
                  style={{
                    padding: '12px', border: '1px solid', textAlign: 'left', cursor: 'pointer', minHeight: 60,
                    borderColor: deadlineType === opt.id ? '#C8102E' : '#e0e0db',
                    background: deadlineType === opt.id ? '#fff5f5' : 'white',
                  }}>
                  <div style={{fontWeight: 600, fontSize: '13px', color: deadlineType === opt.id ? '#C8102E' : '#111'}}>{opt.label}</div>
                  <div style={{fontSize: '11px', color: '#aaa', marginTop: '3px'}}>{opt.desc}</div>
                </button>
              ))}
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <button className="btn-secondary" onClick={() => setStep(1)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
              <button className="btn-primary" onClick={() => setStep(3)} style={{padding: '10px 20px', minHeight: 44}}>next →</button>
            </div>

            {/* Bracket settings — only for before_tournament pools */}
            {deadlineType === 'before_tournament' && (
              <div style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '16px'}}>
                <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>group stage pick style</label>
                <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
                  {([
                    { id: 'simple', label: 'rank teams per group', desc: 'pick 1st–4th in each group' },
                    { id: 'full', label: 'predict every game', desc: 'app calculates who advances' },
                  ] as const).map(opt => (
                    <button key={opt.id} onClick={() => setPickMode(opt.id)}
                      style={{
                        padding: '12px', border: '1px solid', textAlign: 'left', cursor: 'pointer', minHeight: 56,
                        borderColor: pickMode === opt.id ? '#C8102E' : '#e0e0db',
                        background: pickMode === opt.id ? '#fff5f5' : 'white',
                      }}>
                      <div style={{fontWeight: 600, fontSize: '13px', color: pickMode === opt.id ? '#C8102E' : '#111'}}>{opt.label}</div>
                      <div style={{fontSize: '11px', color: '#aaa', marginTop: '3px'}}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>bracket scoring (pts per correct pick)</label>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px'}}>
                  {([
                    { key: 'r32_points', label: 'Round of 32' },
                    { key: 'r16_points', label: 'Round of 16' },
                    { key: 'qf_points', label: 'Quarter Finals' },
                    { key: 'sf_points', label: 'Semi Finals' },
                    { key: 'final_points', label: 'Final' },
                    { key: 'winner_points', label: 'Champion bonus' },
                  ] as const).map(({ key, label }) => (
                    <div key={key}>
                      <div style={{fontSize: '11px', color: '#888', marginBottom: '4px'}}>{label}</div>
                      <input type="number" min="0" max="100" value={bracketScoring[key]}
                        onChange={e => setBracketScoring(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                        style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit', textAlign: 'center', minHeight: 44}} />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <>
                <div style={{marginBottom: '16px'}}>
                  <label style={{display: 'block', fontWeight: 600, marginBottom: '6px'}}>your venmo handle</label>
                  <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    <span style={{color: '#555', fontSize: '14px'}}>@</span>
                    <input type="text" placeholder="yourhandle" value={venmoHandle}
                      onChange={e => setVenmoHandle(e.target.value.replace('@', ''))}
                      style={{border: '1px solid #ddd', padding: '6px 10px', fontSize: '13px', flex: 1, fontFamily: 'inherit'}} />
                  </div>
                </div>

                <div style={{marginBottom: '16px'}}>
                  <label style={{display: 'block', fontWeight: 600, marginBottom: '6px'}}>how does the pot get paid out?</label>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px'}}>
                    {PAYOUT_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => setPayoutTemplate(t.id)}
                        style={{
                          textAlign: 'left', padding: '12px', border: '1px solid', cursor: 'pointer', minHeight: 48,
                          borderColor: payoutTemplate === t.id ? '#C8102E' : '#e0e0db',
                          background: payoutTemplate === t.id ? '#fff5f5' : 'white',
                        }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <span style={{fontWeight: 600, fontSize: '12px', color: payoutTemplate === t.id ? '#C8102E' : '#111'}}>{t.label}</span>
                          {t.id !== 'custom' && (
                            <span style={{fontSize: '11px', color: '#888'}}>{t.description}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {payoutTemplate === 'custom' && (
                    <div>
                      <label style={{display: 'block', fontSize: '11px', color: '#555', marginBottom: '4px'}}>
                        describe your payout rules
                      </label>
                      <textarea
                        placeholder="e.g. Top 3 places: 1st gets 50%, 2nd gets 30%, 3rd gets 20%. Ties split the prize money evenly."
                        value={customPayout}
                        onChange={e => setCustomPayout(e.target.value)}
                        rows={3}
                        style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'}}
                      />
                    </div>
                  )}
                  {/* Preview */}
                  {payoutTemplate !== 'custom' && buyIn && parseFloat(buyIn) > 0 && (
                    <div style={{fontSize: '11px', color: '#555', padding: '8px', background: '#f9f9f9', border: '1px solid #eee', marginTop: '6px'}}>
                      members will see: <em>"{PAYOUT_TEMPLATES.find(t => t.id === payoutTemplate)?.description}"</em>
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{marginBottom: '12px', padding: '10px', background: '#f9f9f9', border: '1px solid #eee', fontSize: '11px', color: '#555'}}>
              <strong>{selectedRules.length} predictions</strong> selected · {name} · {TOURNAMENTS.find(t => t.id === tournamentId)?.name}
            </div>

            {error && <p style={{fontSize: '11px', color: '#C8102E', background: '#fff5f5', padding: '8px', marginBottom: '12px'}}>{error}</p>}

            <div style={{display: 'flex', justifyContent: 'space-between', gap: 8}}>
              <button className="btn-secondary" onClick={() => setStep(3)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading} style={{padding: '10px 24px', minHeight: 44, fontSize: '14px'}}>
                {loading ? 'creating...' : 'create pool →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
