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

  // Per-game ruleset
  const [selectedRules, setSelectedRules] = useState<SelectedRule[]>([])

  // PL-specific config (step 2b)
  const [plSeasonProps, setPlSeasonProps] = useState(false)
  const [plSelectedProps, setPlSelectedProps] = useState<string[]>([])
  const [plGameMode, setPlGameMode] = useState<'every_game' | 'best5'>('every_game')

  // PL prize structure (step 4 for PL)
  const [plPrizeSeason, setPlPrizeSeason] = useState(false)
  const [plPrizeWeekly, setPlPrizeWeekly] = useState(false)
  const [plSeasonBuyIn, setPlSeasonBuyIn] = useState('')
  const [plWeeklyBuyIn, setPlWeeklyBuyIn] = useState('')
  const [plBestWeeks, setPlBestWeeks] = useState(38)

  // PL prop point rules (category → points, set during ruleset step)
  const [plPropPoints, setPlPropPoints] = useState<Record<string, number>>({})

  const PL_PROPS = [
    { id: 'title_winner', label: 'Title winner', desc: 'Pick the Premier League champion. Just 1 team.' },
    { id: 'top_4', label: 'Top 4', desc: 'Pick 4 teams in finishing order. 1st = champion (scores separately if Title winner is also enabled). Points for exact position + 1pt consolation for top 4 in wrong spot.' },
    { id: 'top_scorer', label: 'Top scorer', desc: 'Pick the Golden Boot winner' },
    { id: 'top_assist', label: 'Top assist', desc: 'Pick the player with the most assists' },
    { id: 'golden_glove', label: 'Golden Glove', desc: 'Pick the keeper with the most clean sheets' },
    { id: 'relegated', label: 'Relegated teams', desc: 'Pick all 3 relegated teams (no order needed)' },
  ]

  const isPL = tournamentId.startsWith('pl_')
  const defaultPropPts = Math.round(selectedRules.reduce((sum, r) => sum + (r.points || 0), 0) * 10 * 0.10)

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

  const [TOURNAMENTS, setTOURNAMENTS] = useState<{id: string, name: string, sport: string, description: string, started: boolean}[]>([])

  useEffect(() => {
    async function loadTournaments() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, sport, end_date')
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('created_at', { ascending: false })

      const descriptions: Record<string, string> = {
        'wc_2026': 'FIFA World Cup 2026',
        'f1_2026': 'Formula 1 2026',
        'ufc_329': 'McGregor vs Holloway · Jul 11',
      }

      // Check which tournaments have started (any non-NS fixtures)
      const ids = (data || []).map(t => t.id)
      const { data: startedFixtures } = await supabase
        .from('fixtures')
        .select('tournament_id')
        .in('tournament_id', ids)
        .neq('status', 'NS')
        .limit(100)
      const startedIds = new Set((startedFixtures || []).map(f => f.tournament_id))

      // Also check f1_sessions
      const { data: startedF1 } = await supabase
        .from('f1_sessions')
        .select('tournament_id')
        .in('tournament_id', ids)
        .eq('scored', true)
        .limit(10)
      for (const s of startedF1 || []) startedIds.add(s.tournament_id)

      setTOURNAMENTS((data || []).map(t => ({
        id: t.id,
        name: t.name,
        sport: t.sport,
        description: descriptions[t.id] || '',
        started: startedIds.has(t.id),
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
      buy_in_amount: isPL ? null : (buyIn ? parseFloat(buyIn) : null),
      venmo_handle: venmoHandle.replace('@', '').trim() || null,
      zelle_handle: zelleHandle.trim() || null,
      payout_structure: !isPL && buyIn && parseFloat(buyIn) > 0
        ? (payoutTemplate === 'custom' ? customPayout.trim() : PAYOUT_TEMPLATES.find(t => t.id === payoutTemplate)?.description || null)
        : null,
      pick_mode: deadlineType === 'before_tournament' ? groupFormat : null,
      // PL-specific
      ...(isPL ? {
        pl_game_mode: plGameMode,
        pl_best_weeks: plBestWeeks,
        prize_season: plPrizeSeason,
        prize_weekly: plPrizeWeekly,
        season_buy_in: plPrizeSeason && plSeasonBuyIn ? parseFloat(plSeasonBuyIn) : null,
        weekly_buy_in: plPrizeWeekly && plWeeklyBuyIn ? parseFloat(plWeeklyBuyIn) : null,
        season_props_enabled: plSeasonProps,
      } : {}),
    }).select().single()

    if (poolError) { setError(poolError.message); setLoading(false); return }

    // Save season prop rules for PL pools
    if (isPL && plSeasonProps && plSelectedProps.length > 0) {
      const maxPtsPerGame = selectedRules.reduce((sum, r) => sum + (r.points || 0), 0)
      const defaultPropPts = Math.round(maxPtsPerGame * 10 * 0.10)
      const propsToSave: {category: string, points: number}[] = []
      for (const cat of plSelectedProps) {
        if (cat === 'top_4') {
          propsToSave.push({ category: 'title_winner', points: plPropPoints['title_winner'] ?? defaultPropPts })
          propsToSave.push({ category: 'top_4_2nd', points: plPropPoints['top_4'] ?? defaultPropPts })
          propsToSave.push({ category: 'top_4_3rd', points: plPropPoints['top_4_3rd'] ?? defaultPropPts })
          propsToSave.push({ category: 'top_4_4th', points: plPropPoints['top_4_4th'] ?? defaultPropPts })
          propsToSave.push({ category: 'top_4_consolation', points: plPropPoints['top_4_consolation'] ?? 1 })
        } else {
          propsToSave.push({ category: cat, points: plPropPoints[cat] ?? defaultPropPts })
        }
      }
      await supabase.from('season_prop_rules').insert(
        propsToSave.map(p => ({ pool_id: pool.id, category: p.category, points: p.points }))
      )
    }

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

  // Step labels differ by pool type
  const isBracket = deadlineType === 'before_tournament'
  const totalSteps = isPL ? 5 : 4
  const stepLabels = isPL
    ? ['competition', 'name', 'pl config', 'predictions', 'prizes']
    : isBracket
    ? ['competition', 'name', 'scoring', 'buy-in']
    : ['competition', 'name', 'predictions', 'buy-in']

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

      <div style={{maxWidth: (step === 3 && (!isBracket || sport === 'mma' || sport === 'f1')) || (isPL && step === 4) ? 1100 : 520, margin: '0 auto', padding: '24px 16px'}}>
        <div style={{marginBottom: '16px'}}>
          <h1 style={{fontWeight: 700, fontSize: '15px', marginBottom: '2px'}}>new pool</h1>
        </div>

        {/* Step indicator */}
        <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' as const}}>
          {Array.from({length: totalSteps}, (_, i) => i + 1).map((s, i) => (
            <div key={s} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 600, flexShrink: 0,
                background: s === step ? '#111' : s < step ? '#C8102E' : 'transparent',
                color: s <= step ? 'white' : '#bbb',
                border: `1px solid ${s <= step ? 'transparent' : '#ddd'}`,
              }}>{s < step ? '✓' : s}</div>
              <span style={{fontSize: '11px', color: s === step ? '#111' : '#bbb', whiteSpace: 'nowrap' as const}}>{stepLabels[i]}</span>
              {i < totalSteps - 1 && <span style={{color: '#ddd', margin: '0 2px'}}>→</span>}
            </div>
          ))}
        </div>

        {/* ── Step 1: Competition ───────────────────────────────────────── */}
        {step === 1 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '16px'}}>pick a competition</label>

            {/* Group by sport, split into in progress / upcoming */}
            {(['soccer', 'mma', 'f1'] as const).map(sportKey => {
              const sportTournaments = TOURNAMENTS.filter(t => t.sport === sportKey)
              if (!sportTournaments.length) return null
              const inProgress = sportTournaments.filter(t => t.started)
              const upcoming = sportTournaments.filter(t => !t.started)
              const sportLabel: Record<string, string> = { soccer: '⚽ Soccer', mma: '🥊 MMA', f1: '🏎 Formula 1' }
              return (
                <div key={sportKey} style={{marginBottom: 20}}>
                  <div style={{fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8}}>{sportLabel[sportKey]}</div>
                  {inProgress.length > 0 && (
                    <div style={{marginBottom: 8}}>
                      <div style={{fontSize: '10px', color: '#2d7a2d', fontWeight: 600, marginBottom: 4}}>● in progress</div>
                      {inProgress.map(t => (
                        <button key={t.id} onClick={() => {
                          setTournamentId(t.id)
                          setSport(t.sport)
                          if (t.sport === 'f1') setDeadlineType('before_weekend' as any)
                          else if (t.sport === 'mma') setDeadlineType('before_tournament')
                          else if (t.id.startsWith('pl_')) setDeadlineType('before_weekend' as any)
                          else setDeadlineType('before_each_game')
                        }} style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: '1px solid', marginBottom: 4, cursor: 'pointer',
                          borderColor: tournamentId === t.id ? '#C8102E' : '#e0e0db',
                          background: tournamentId === t.id ? '#fff5f5' : 'white',
                        }}>
                          <div style={{fontWeight: 600, color: tournamentId === t.id ? '#C8102E' : '#111'}}>{t.name}</div>
                          {t.description && <div style={{fontSize: '11px', color: '#888', marginTop: 2}}>{t.description}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                  {upcoming.length > 0 && (
                    <div>
                      {inProgress.length > 0 && <div style={{fontSize: '10px', color: '#aaa', fontWeight: 600, marginBottom: 4}}>upcoming</div>}
                      {upcoming.map(t => (
                        <button key={t.id} onClick={() => {
                          setTournamentId(t.id)
                          setSport(t.sport)
                          if (t.sport === 'f1') setDeadlineType('before_weekend' as any)
                          else if (t.sport === 'mma') setDeadlineType('before_tournament')
                          else if (t.id.startsWith('pl_')) setDeadlineType('before_weekend' as any)
                          else setDeadlineType('before_each_game')
                        }} style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: '1px solid', marginBottom: 4, cursor: 'pointer',
                          borderColor: tournamentId === t.id ? '#C8102E' : '#e0e0db',
                          background: tournamentId === t.id ? '#fff5f5' : 'white',
                        }}>
                          <div style={{fontWeight: 600, color: tournamentId === t.id ? '#C8102E' : '#111'}}>{t.name}</div>
                          {t.description && <div style={{fontSize: '11px', color: '#888', marginTop: 2}}>{t.description}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Deadline type */}
            {tournamentId && (
              <>
                <label style={{display: 'block', fontWeight: 600, marginBottom: '8px', marginTop: 4}}>prediction deadline</label>
                <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
                  {(sport === 'f1' ? [
                    {id: 'before_weekend', label: 'before each race weekend', desc: 'picks lock before the qualifying session starts — one ticket per GP weekend'},
                    {id: 'before_session', label: 'before each session', desc: 'separate tickets for qualifying and race — picks lock before each session'},
                  ] : sport === 'mma' ? [
                    {id: 'before_tournament', label: 'before the card', desc: 'predict all fights before the card starts — picks lock at first fight'},
                  ] : isPL ? [
                    {id: 'before_weekend', label: 'before each match week', desc: 'all picks for the matchday lock before the first game kicks off'},
                    {id: 'before_each_game', label: 'before each game', desc: 'picks lock individually at each kickoff'},
                  ] : [
                    {id: 'before_each_game', label: 'before each game', desc: 'picks lock at kickoff — predict game by game'},
                    {id: 'before_tournament', label: 'before the tournament', desc: 'predict the whole tournament upfront — group stage + full bracket'},
                  ]).map((opt: any) => (
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
              </>
            )}

            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '16px'}}>
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!tournamentId}
                style={{padding: '10px 24px', fontSize: '14px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Name ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '8px'}}>what's this pool called?</label>
            <input className="input" placeholder="e.g. The Office World Cup" value={name}
              onChange={e => setName(e.target.value)} maxLength={50} autoFocus
              style={{fontSize: '16px', padding: '10px 12px'}} />
            <p style={{fontSize: '11px', color: '#aaa', marginTop: '6px'}}>your friends will see this when they join</p>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '16px'}}>
              <button onClick={() => setStep(1)} style={{padding: '10px 16px', fontSize: '13px', background: 'none', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit'}}>← back</button>
              <button className="btn-primary" onClick={() => setStep(3)} disabled={!name.trim()}
                style={{padding: '10px 24px', fontSize: '14px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: PL Config (PL pools only) ────────────────────────── */}
        {step === 3 && isPL && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <div style={{fontWeight: 600, fontSize: '14px', marginBottom: 4}}>Premier League settings</div>
            <div style={{fontSize: '11px', color: '#aaa', marginBottom: 20}}>configure your pool for the 2026/27 season</div>

            {/* Season-long props */}
            <div style={{marginBottom: 20}}>
              <label style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10}}>
                <input type="checkbox" checked={plSeasonProps} onChange={e => {
                  setPlSeasonProps(e.target.checked)
                  if (e.target.checked) setPlSelectedProps(PL_PROPS.map(p => p.id))
                  else setPlSelectedProps([])
                }}
                  style={{width: 18, height: 18, cursor: 'pointer'}} />
                <div>
                  <div style={{fontWeight: 600, fontSize: '13px'}}>season-long props</div>
                  <div style={{fontSize: '11px', color: '#aaa'}}>members predict title winner, top 4, golden boot, etc. before matchday 1</div>
                </div>
              </label>

              {plSeasonProps && (
                <div style={{marginLeft: 28, display: 'flex', flexDirection: 'column' as const, gap: 8}}>
                  {PL_PROPS.map(prop => (
                    <label key={prop.id} style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', border: '1px solid', borderColor: plSelectedProps.includes(prop.id) ? '#C8102E' : '#e0e0db', background: plSelectedProps.includes(prop.id) ? '#fff5f5' : 'white'}}>
                      <input type="checkbox" checked={plSelectedProps.includes(prop.id)}
                        onChange={e => setPlSelectedProps(prev => e.target.checked ? [...prev, prop.id] : prev.filter(p => p !== prop.id))}
                        style={{width: 16, height: 16, cursor: 'pointer', flexShrink: 0}} />
                      <div style={{flex: 1}}>
                        <div style={{fontWeight: 600, fontSize: '12px'}}>{prop.label}</div>
                        <div style={{fontSize: '11px', color: '#aaa'}}>{prop.desc}</div>
                      </div>
                    </label>
                  ))}
                  <div style={{fontSize: '10px', color: '#aaa', marginTop: 4}}>point values will be set after you configure your scoring rules</div>
                </div>
              )}
            </div>

            {/* Game mode */}
            <div style={{marginBottom: 20}}>
              <label style={{display: 'block', fontWeight: 600, marginBottom: 8}}>games per matchday</label>
              <div style={{display: 'flex', flexDirection: 'column' as const, gap: 6}}>
                <button type="button" onClick={() => setPlGameMode('every_game')}
                  style={{padding: '12px', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                    borderColor: plGameMode === 'every_game' ? '#C8102E' : '#e0e0db',
                    background: plGameMode === 'every_game' ? '#fff5f5' : 'white'}}>
                  <div style={{fontWeight: 600, fontSize: '13px', color: plGameMode === 'every_game' ? '#C8102E' : '#111'}}>every game</div>
                  <div style={{fontSize: '11px', color: '#aaa', marginTop: 3}}>predict all games each matchday — typically 10 games</div>
                </button>
                <button type="button" onClick={() => setPlGameMode('best5')}
                  style={{padding: '12px', border: '1px solid', textAlign: 'left', cursor: 'pointer', opacity: 0.5,
                    borderColor: plGameMode === 'best5' ? '#C8102E' : '#e0e0db',
                    background: plGameMode === 'best5' ? '#fff5f5' : 'white'}}>
                  <div style={{fontWeight: 600, fontSize: '13px', color: plGameMode === 'best5' ? '#C8102E' : '#111'}}>best 5 games <span style={{fontSize: '10px', fontWeight: 400, color: '#bbb'}}>coming soon</span></div>
                  <div style={{fontSize: '11px', color: '#aaa', marginTop: 3}}>algorithm picks the 5 most predictable games each matchday</div>
                </button>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '16px'}}>
              <button onClick={() => setStep(2)} style={{padding: '10px 16px', fontSize: '13px', background: 'none', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit'}}>← back</button>
              <button className="btn-primary" onClick={() => setStep(4)}
                style={{padding: '10px 24px', fontSize: '14px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3a/4: Bracket scoring (before_tournament, soccer only) ─── */}
        {((isPL ? step === 4 : step === 3)) && isBracket && sport !== 'mma' && (
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
              <button className="btn-secondary" onClick={() => setStep(isPL ? 3 : 2)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
              <button className="btn-primary" onClick={() => setStep(isPL ? 5 : 4)} style={{padding: '10px 20px', minHeight: 44}}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3b/4: Ruleset builder (before_each_game or UFC before_card) */}
        {(isPL ? step === 4 : step === 3) && (!isBracket || sport === 'mma') && (
          <div>
            <RulesetBuilder
              sport={sport}
              isPL={isPL}
              plSelectedProps={plSelectedProps}
              onComplete={(rules, propPoints) => { 
                const r = rules as SelectedRule[]
                setSelectedRules(r)
                if (propPoints) setPlPropPoints(propPoints)
                setStep(isPL ? 5 : 4) 
              }}
            />
            <div style={{marginTop: '16px'}}>
              <button className="btn-secondary" onClick={() => setStep(isPL ? 3 : 2)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
            </div>
          </div>
        )}

        {/* ── Step 5: PL Buy-in rules ───────────────────────────────────── */}
        {step === 5 && isPL && (
          <div style={{background: 'white', border: '1px solid #e0e0db', padding: '20px'}}>
            <div style={{fontWeight: 600, fontSize: '14px', marginBottom: 4}}>buy-in rules</div>
            <div style={{fontSize: '11px', color: '#aaa', marginBottom: 20}}>set up how winnings work — you can have both</div>

            {/* Season pot */}
            <div style={{marginBottom: 16, padding: '14px', border: '1px solid', borderColor: plPrizeSeason ? '#C8102E' : '#e0e0db', background: plPrizeSeason ? '#fff5f5' : 'white'}}>
              <label style={{display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: plPrizeSeason ? 12 : 0}}>
                <input type="checkbox" checked={plPrizeSeason} onChange={e => setPlPrizeSeason(e.target.checked)}
                  style={{width: 18, height: 18, cursor: 'pointer', marginTop: 2}} />
                <div>
                  <div style={{fontWeight: 600, fontSize: '13px'}}>season pot</div>
                  <div style={{fontSize: '11px', color: '#aaa'}}>collect once upfront, pay out at end of season</div>
                </div>
              </label>
              {plPrizeSeason && (
                <div style={{marginLeft: 28}}>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12}}>
                    <div>
                      <div style={{fontSize: '11px', color: '#888', marginBottom: 4}}>buy-in amount ($)</div>
                      <input type="number" min="0" placeholder="e.g. 50" value={plSeasonBuyIn}
                        onChange={e => setPlSeasonBuyIn(e.target.value)}
                        style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '16px', fontFamily: 'inherit'}} />
                    </div>
                    <div>
                      <div style={{fontSize: '11px', color: '#888', marginBottom: 4}}>best weeks counted</div>
                      <input type="number" min="1" max="38" value={plBestWeeks}
                        onChange={e => setPlBestWeeks(parseInt(e.target.value) || 38)}
                        style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '16px', fontFamily: 'inherit'}} />
                    </div>
                  </div>
                  <div style={{fontSize: '10px', color: '#aaa'}}>
                    only the best {plBestWeeks} of 38 matchdays will count toward the season total — missed weeks won't hurt you
                  </div>
                </div>
              )}
            </div>

            {/* Weekly pot */}
            <div style={{marginBottom: 20, padding: '14px', border: '1px solid', borderColor: plPrizeWeekly ? '#C8102E' : '#e0e0db', background: plPrizeWeekly ? '#fff5f5' : 'white'}}>
              <label style={{display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: plPrizeWeekly ? 12 : 0}}>
                <input type="checkbox" checked={plPrizeWeekly} onChange={e => setPlPrizeWeekly(e.target.checked)}
                  style={{width: 18, height: 18, cursor: 'pointer', marginTop: 2}} />
                <div>
                  <div style={{fontWeight: 600, fontSize: '13px'}}>weekly pot</div>
                  <div style={{fontSize: '11px', color: '#aaa'}}>members buy credits, allocate before each matchday, weekly winner paid out</div>
                </div>
              </label>
              {plPrizeWeekly && (
                <div style={{marginLeft: 28}}>
                  <div style={{fontSize: '11px', color: '#888', marginBottom: 4}}>buy-in per matchday ($)</div>
                  <input type="number" min="0" placeholder="e.g. 10" value={plWeeklyBuyIn}
                    onChange={e => setPlWeeklyBuyIn(e.target.value)}
                    style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '16px', fontFamily: 'inherit', marginBottom: 8}} />
                  <div style={{fontSize: '10px', color: '#aaa'}}>
                    you issue credits to members as they pay. they allocate credits to enter each matchday. weekly winner takes the pot.
                  </div>
                </div>
              )}
            </div>

            {/* Payment handles */}
            {(plPrizeSeason || plPrizeWeekly) && (
              <div style={{marginBottom: 20}}>
                <div style={{fontSize: '12px', fontWeight: 600, marginBottom: 8}}>payment handles</div>
                <div style={{display: 'flex', flexDirection: 'column' as const, gap: 8}}>
                  <div>
                    <div style={{fontSize: '11px', color: '#888', marginBottom: 4}}>venmo handle</div>
                    <input placeholder="@yourhandle" value={venmoHandle} onChange={e => setVenmoHandle(e.target.value)}
                      style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '14px', fontFamily: 'inherit'}} />
                  </div>
                  <div>
                    <div style={{fontSize: '11px', color: '#888', marginBottom: 4}}>zelle (phone or email)</div>
                    <input placeholder="phone or email" value={zelleHandle} onChange={e => setZelleHandle(e.target.value)}
                      style={{width: '100%', border: '1px solid #ddd', padding: '8px', fontSize: '14px', fontFamily: 'inherit'}} />
                  </div>
                </div>
              </div>
            )}

            {/* Season prop point values */}
            {plSeasonProps && plSelectedProps.length > 0 && (
              <div style={{marginBottom: 20}}>
                <div style={{fontWeight: 600, fontSize: '13px', marginBottom: 4}}>season prop points</div>
                <div style={{fontSize: '11px', color: '#aaa', marginBottom: 10}}>
                  default = 10% of max game points per matchday ({defaultPropPts} pts) · adjust as needed
                </div>
                <div style={{display: 'flex', flexDirection: 'column' as const, gap: 6}}>
                  {plSelectedProps.map(catId => {
                    const prop = PL_PROPS.find(p => p.id === catId)
                    if (!prop) return null
                    const val = plPropPoints[catId] ?? defaultPropPts
                    return (
                      <div key={catId} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid #e0e0db'}}>
                        <div>
                          <div style={{fontWeight: 600, fontSize: '12px'}}>{prop.label}</div>
                          <div style={{fontSize: '11px', color: '#aaa'}}>{prop.desc}</div>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0}}>
                          <input type="number" min="1" max="500" value={val}
                            onChange={e => setPlPropPoints(prev => ({...prev, [catId]: parseInt(e.target.value) || 0}))}
                            style={{width: 56, border: '1px solid #ddd', padding: '6px', fontSize: '14px', fontFamily: 'inherit', textAlign: 'center'}} />
                          <span style={{fontSize: '11px', color: '#aaa'}}>pts</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '16px'}}>
              <button className="btn-secondary" onClick={() => setStep(4)} style={{padding: '10px 20px', minHeight: 44}}>← back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}
                style={{padding: '10px 24px', fontSize: '14px', minHeight: 44}}>
                {loading ? 'creating...' : 'create pool →'}
              </button>
            </div>
            {error && <p style={{fontSize: '12px', color: '#C8102E', marginTop: 8}}>{error}</p>}
          </div>
        )}

        {/* ── Step 4/4: Buy-in (non-PL pools) ─────────────────────────────── */}
        {step === 4 && !isPL && (
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
