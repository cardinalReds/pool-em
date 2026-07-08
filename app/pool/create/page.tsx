'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RulesetBuilder from '@/components/RulesetBuilder'

interface SelectedRule {
  category_id: string
  points: number
  bonus_points: number
  enabled: boolean
}

export default function CreatePoolPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — name
  const [name, setName] = useState('')

  // Step 2 — tournament + deadline
  const [sport, setSport] = useState('soccer')
  const [tournamentId, setTournamentId] = useState('')
  const [deadlineType, setDeadlineType] = useState<'before_each_game' | 'before_tournament' | 'before_weekend' | 'before_session'>('before_each_game')

  // Step 3a — per-game ruleset (before_each_game only)
  const [selectedRules, setSelectedRules] = useState<SelectedRule[]>([])

  // Step 3b — bracket settings (before_tournament only)
  const [groupFormat, setGroupFormat] = useState<'standings' | 'wld' | 'exact'>('standings')
  const [bracketScoring, setBracketScoring] = useState({
    // standings format
    standings_first: 3, standings_second: 2, standings_third: 1,
    // wld format
    wld_pts: 1,
    // exact format (fixed: 3+2+2+3=10 max, not configurable)
    // knockout (same for all formats)
    r32_pts: 1, r16_pts: 2, qf_pts: 4, sf_pts: 6, final_pts: 12,
  })

  // Step 4 — buy-in
  const [buyIn, setBuyIn] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [zelleHandle, setZelleHandle] = useState('')
  const [payoutTemplate, setPayoutTemplate] = useState<string>('winner')
  const [customPayout, setCustomPayout] = useState('')

  const PAYOUT_TEMPLATES = [
    { id: 'winner', label: 'Winner takes all', description: '1st place gets the full pot' },
    { id: 'top2', label: 'Top 2 split', description: '1st: 70% · 2nd: 30%' },
    { id: 'top3', label: 'Top 3 split', description: '1st: 60% · 2nd: 25% · 3rd: 15%' },
    { id: 'top3_equal', label: 'Top 3 equal', description: '1st, 2nd, 3rd split evenly' },
    { id: 'custom', label: 'Custom', description: 'Write your own payout rules' },
  ]

  const [TOURNAMENTS, setTOURNAMENTS] = useState<{id: string, name: string, sport: string, description: string}[]>([])

  useEffect(() => {
    async function loadTournaments() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, sport')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      // Map to display format
      const map: Record<string, string> = {
        'wc_2026': 'Group stage · Jun 12 – Jul 2',
        'f1_2026': '23 races · Mar–Nov 2026',
        'ufc_329': 'McGregor vs Holloway · Jul 11, T-Mobile Arena',
      }
      setTOURNAMENTS((data || []).map(t => ({
        id: t.id,
        name: t.name,
        sport: t.sport,
        description: map[t.id] || '',
      })))
    }
    loadTournaments()
  }, [])

  // Step 2 → step 3: bracket pools skip ruleset builder
  function goToStep3() {
    setStep(3)
  }

  async function handleCreate() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: pool, error: poolError } = await supabase.from('pools').insert({
      name, sport,
      tournament_id: tournamentId,
      package_id: 'CUSTOM',
      tournament_scope: 'full',
      deadline_type: deadlineType,
      invite_code: inviteCode,
      admin_id: user.id,
      is_active: true,
      buy_in_amount: buyIn ? parseFloat(buyIn) : null,
      venmo_handle: venmoHandle.replace('@', '').trim() || null,
      zelle_handle: zelleHandle.trim() || null,
      payout_structure: buyIn && parseFloat(buyIn) > 0
        ? (payoutTemplate === 'custom' ? customPayout.trim() : PAYOUT_TEMPLATES.find(t => t.id === payoutTemplate)?.description || null)
        : null,
      pick_mode: deadlineType === 'before_tournament' ? groupFormat : null,
    }).select().single()

    if (poolError) { setError(poolError.message); setLoading(false); return }

    // Save per-game rules (before_each_game, before_weekend, before_session pools)
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

    // Save bracket scoring rules (before_tournament soccer/f1 pools only, not MMA)
    if (deadlineType === 'before_tournament' && sport !== 'mma') {
      await supabase.from('bracket_scoring_rules').upsert({
        pool_id: pool.id,
        group_format: groupFormat,
        standings_first: bracketScoring.standings_first,
        standings_second: bracketScoring.standings_second,
        standings_third: bracketScoring.standings_third,
        wld_pts: bracketScoring.wld_pts,
        r32_pts: bracketScoring.r32_pts,
        r16_pts: bracketScoring.r16_pts,
        qf_pts: bracketScoring.qf_pts,
        sf_pts: bracketScoring.sf_pts,
        final_pts: bracketScoring.final_pts,
      }, { onConflict: 'pool_id' })
    }

    // Add admin as member
    await supabase.from('pool_members').insert({
      pool_id: pool.id,
      user_id: user.id,
      display_name: user.user_metadata?.display_name || 'Admin',
    })

    window.location.href = `/pool/${pool.id}`
  }

  // Step labels differ by deadline type
  const isBracket = deadlineType === 'before_tournament'
  const stepLabels = isBracket
    ? ['name', 'tournament', 'scoring', 'buy-in']
    : ['name', 'tournament', 'predictions', 'buy-in']

  function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div>
        <div style={{fontSize: '11px', color: '#888', marginBottom: '4px'}}>{label}</div>
        <input type="number" min="0" max="100" value={value}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit', textAlign: 'center', minHeight: 44}} />
      </div>
    )
  }

  return (
    <div style={{minHeight: '100vh', background: '#f7f7f5', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '13px'}}>
      <div style={{background: '#111', color: 'white', padding: '10px 16px'}}>
        <a href="/dashboard" style={{fontWeight: 700, fontSize: '13px', color: 'white', textDecoration: 'none'}}>pool'em</a>
      </div>

      <div style={{maxWidth: step === 3 && (!isBracket || sport === 'mma' || sport === 'f1') ? 1100 : 520, margin: '0 auto', padding: '24px 16px'}}>
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

        {/* ── Step 1: Name ─────────────────────────────────────────────── */}
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

        {/* ── Step 2: Tournament + deadline ────────────────────────────── */}
        {step === 2 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '12px'}}>pick a tournament</label>
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
              {TOURNAMENTS.map(t => (
                <button key={t.id} onClick={() => { 
                  setTournamentId(t.id)
                  setSport(t.sport)
                  // Reset deadline type to sensible default for each sport
                  if (t.sport === 'f1') setDeadlineType('before_weekend' as any)
                  else if (t.sport === 'mma') setDeadlineType('before_tournament')
                  else setDeadlineType('before_each_game')
                }}
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
              {(sport === 'f1' ? [
                {id: 'before_weekend', label: 'before each race weekend', desc: 'picks lock before the qualifying session starts — one ticket per GP weekend'},
                {id: 'before_session', label: 'before each session', desc: 'separate tickets for qualifying and race — picks lock before each session'},
              ] : sport === 'mma' ? [
                {id: 'before_each_game', label: 'before each fight', desc: 'picks lock at fight time — predict fight by fight', hidden: true},
                {id: 'before_tournament', label: 'before the card', desc: 'predict all fights before the card starts — picks lock at first fight'},
              ] : [
                {id: 'before_each_game', label: 'before each game', desc: 'picks lock at kickoff — predict game by game'},
                {id: 'before_tournament', label: 'before the tournament', desc: 'predict the whole tournament upfront — group stage + full bracket'},
              ]).filter(opt => !opt.hidden).map(opt => (
                <button key={opt.id} onClick={() => setDeadlineType(opt.id as any)}
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
              <button className="btn-primary" onClick={goToStep3} style={{padding: '10px 20px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3a: Bracket scoring (before_tournament, soccer only) ─── */}
        {step === 3 && isBracket && sport !== 'mma' && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <h2 style={{fontWeight: 700, fontSize: '14px', marginBottom: '4px'}}>group stage format</h2>
            <p style={{fontSize: '11px', color: '#aaa', marginBottom: '16px'}}>how do participants predict the group stage?</p>

            <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px'}}>
              {([
                { id: 'standings', label: 'pick group standings', desc: 'predict 1st, 2nd, and the best 8 third-place finishers' },
                { id: 'wld', label: 'predict every game — win / draw / loss', desc: 'pick the result of each group stage game' },
                { id: 'exact', label: 'predict every game — exact score', desc: 'predict the scoreline (max 10pts per game: 3pts result · 2pts per team score · 3pt bonus)' },
              ] as const).map(opt => (
                <button key={opt.id} onClick={() => setGroupFormat(opt.id)}
                  style={{
                    padding: '12px', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                    borderColor: groupFormat === opt.id ? '#C8102E' : '#e0e0db',
                    background: groupFormat === opt.id ? '#fff5f5' : 'white',
                  }}>
                  <div style={{fontWeight: 600, fontSize: '13px', color: groupFormat === opt.id ? '#C8102E' : '#111', marginBottom: '3px'}}>{opt.label}</div>
                  <div style={{fontSize: '11px', color: '#888'}}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* Scoring inputs — depend on selected format */}
            {groupFormat === 'standings' && (
              <div style={{marginBottom: '20px', padding: '12px', background: '#f9f9f9', border: '1px solid #eee'}}>
                <div style={{fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '10px'}}>points for correct standings</div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'}}>
                  <NumberInput label="1st place" value={bracketScoring.standings_first} onChange={v => setBracketScoring(p => ({...p, standings_first: v}))} />
                  <NumberInput label="2nd place" value={bracketScoring.standings_second} onChange={v => setBracketScoring(p => ({...p, standings_second: v}))} />
                  <NumberInput label="3rd place qualifier" value={bracketScoring.standings_third} onChange={v => setBracketScoring(p => ({...p, standings_third: v}))} />
                </div>
              </div>
            )}

            {groupFormat === 'wld' && (
              <div style={{marginBottom: '20px', padding: '12px', background: '#f9f9f9', border: '1px solid #eee'}}>
                <div style={{fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '10px'}}>points per correct result</div>
                <div style={{maxWidth: 120}}>
                  <NumberInput label="pts per correct result" value={bracketScoring.wld_pts} onChange={v => setBracketScoring(p => ({...p, wld_pts: v}))} />
                </div>
              </div>
            )}

            {groupFormat === 'exact' && (
              <div style={{marginBottom: '20px', padding: '12px', background: '#f9f9f9', border: '1px solid #eee', fontSize: '11px', color: '#555', lineHeight: 1.8}}>
                <div style={{fontWeight: 600, marginBottom: '4px'}}>fixed scoring (not configurable)</div>
                correct result: 3pts · correct team score: 2pts each · exact score bonus: 3pts<br/>
                <span style={{color: '#aaa'}}>max 10pts per game</span>
              </div>
            )}

            {/* Knockout scoring */}
            <div style={{marginBottom: '20px'}}>
              <div style={{fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '10px'}}>knockout round points</div>
              <p style={{fontSize: '11px', color: '#aaa', marginBottom: '10px'}}>points earned for each correct team advancing to that round</p>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px'}}>
                <NumberInput label="Round of 32" value={bracketScoring.r32_pts} onChange={v => setBracketScoring(p => ({...p, r32_pts: v}))} />
                <NumberInput label="Round of 16" value={bracketScoring.r16_pts} onChange={v => setBracketScoring(p => ({...p, r16_pts: v}))} />
                <NumberInput label="Quarter Finals" value={bracketScoring.qf_pts} onChange={v => setBracketScoring(p => ({...p, qf_pts: v}))} />
                <NumberInput label="Semi Finals" value={bracketScoring.sf_pts} onChange={v => setBracketScoring(p => ({...p, sf_pts: v}))} />
                <NumberInput label="Final (per finalist)" value={bracketScoring.final_pts} onChange={v => setBracketScoring(p => ({...p, final_pts: v}))} />
              </div>
            </div>

            {/* Final — fixed */}
            <div style={{padding: '10px 12px', background: '#f9f9f9', border: '1px solid #eee', fontSize: '11px', color: '#555', lineHeight: 1.8, marginBottom: '20px'}}>
              <div style={{fontWeight: 600, marginBottom: '4px'}}>final (always exact score)</div>
              predict both finalists + exact score (90 min)<br/>
              {bracketScoring.final_pts}pts per correct finalist · 2pts per correct team goal · +3pt bonus if exact · +10pts correct winner
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <button className="btn-secondary" onClick={() => setStep(2)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
              <button className="btn-primary" onClick={() => setStep(4)} style={{padding: '10px 20px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3b: Ruleset builder (before_each_game or UFC before_card) */}
        {step === 3 && (!isBracket || sport === 'mma') && (
          <div>
            <RulesetBuilder
              sport={sport}
              onComplete={(rules) => { setSelectedRules(rules as SelectedRule[]); setStep(4) }}
            />
            <div style={{marginTop: '16px'}}>
              <button className="btn-secondary" onClick={() => setStep(2)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
            </div>
          </div>
        )}

        {/* ── Step 4: Buy-in ────────────────────────────────────────────── */}
        {step === 4 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '4px'}}>
              buy-in amount <span style={{fontWeight: 400, color: '#aaa'}}>(optional)</span>
            </label>
            <p style={{fontSize: '11px', color: '#888', marginBottom: '12px'}}>
              players will be prompted to pay via venmo or zelle when they join. you handle the money — pool'em never touches it.
            </p>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}}>
              <span style={{fontSize: '16px', color: '#555'}}>$</span>
              <input type="number" min="0" step="1" placeholder="0" value={buyIn}
                onChange={e => setBuyIn(e.target.value)}
                style={{border: '1px solid #ddd', padding: '8px 10px', fontSize: '16px', width: 100, fontFamily: 'inherit', minHeight: 44}} />
              <span style={{fontSize: '13px', color: '#888'}}>per person</span>
            </div>

            {buyIn && parseFloat(buyIn) > 0 && (
              <>
                <div style={{marginBottom: '16px'}}>
                  <label style={{display: 'block', fontWeight: 600, marginBottom: '6px'}}>your venmo handle <span style={{fontWeight: 400, color: '#aaa'}}>(optional)</span></label>
                  <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    <span style={{color: '#555', fontSize: '14px'}}>@</span>
                    <input type="text" placeholder="yourhandle" value={venmoHandle}
                      onChange={e => setVenmoHandle(e.target.value.replace('@', ''))}
                      style={{border: '1px solid #ddd', padding: '8px 10px', fontSize: '16px', flex: 1, fontFamily: 'inherit', minHeight: 44}} />
                  </div>
                </div>

                <div style={{marginBottom: '16px'}}>
                  <label style={{display: 'block', fontWeight: 600, marginBottom: '6px'}}>your zelle phone or email <span style={{fontWeight: 400, color: '#aaa'}}>(optional)</span></label>
                  <input type="text" placeholder="phone or email" value={zelleHandle}
                    onChange={e => setZelleHandle(e.target.value)}
                    style={{border: '1px solid #ddd', padding: '8px 10px', fontSize: '16px', width: '100%', fontFamily: 'inherit', minHeight: 44, boxSizing: 'border-box' as const}} />
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
                          {t.id !== 'custom' && <span style={{fontSize: '11px', color: '#888'}}>{t.description}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                  {payoutTemplate === 'custom' && (
                    <textarea
                      placeholder="e.g. 1st: 50%, 2nd: 30%, 3rd: 20%"
                      value={customPayout}
                      onChange={e => setCustomPayout(e.target.value)}
                      rows={3}
                      style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const}} />
                  )}
                </div>
              </>
            )}

            <div style={{marginBottom: '12px', padding: '10px', background: '#f9f9f9', border: '1px solid #eee', fontSize: '11px', color: '#555'}}>
              {isBracket
                ? <><strong>{groupFormat}</strong> group format · {name} · {TOURNAMENTS.find(t => t.id === tournamentId)?.name}</>
                : <><strong>{selectedRules.length} predictions</strong> selected · {name} · {TOURNAMENTS.find(t => t.id === tournamentId)?.name}</>
              }
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
