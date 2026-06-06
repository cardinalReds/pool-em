'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Category {
  id: string
  sport: string
  name: string
  description: string
  default_points: number
  prediction_type: string
  requires_line: boolean
  input_type: string
  sort_order: number
}

interface SelectedRule {
  category_id: string
  points: number
  enabled: boolean
  partial_credit?: boolean
  partial_credit_points?: number
}

const EXAMPLE_FIXTURE = {
  home_team: 'Mexico',
  away_team: 'South Africa',
  home_flag: '🇲🇽',
  away_flag: '🇿🇦',
  date: 'Jun 12 · 12:00 PM PT',
  round: 'Group A · Matchday 1',
}

function generateResult() {
  const scores = [[0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2],[2,2],[3,0],[0,3],[3,1],[1,3]]
  const score = scores[Math.floor(Math.random() * scores.length)]
  const htScores = [[0,0],[1,0],[0,1],[1,1]]
  const ht = htScores[Math.floor(Math.random() * htScores.length)]
  const corners = [Math.floor(Math.random()*8)+2, Math.floor(Math.random()*8)+2]
  const htCorners = [Math.floor(Math.random()*4)+1, Math.floor(Math.random()*4)+1]
  const homeYellows = Math.floor(Math.random()*3)
  const awayYellows = Math.floor(Math.random()*3)
  const homeReds = Math.random() > 0.85 ? 1 : 0
  const awayReds = Math.random() > 0.85 ? 1 : 0
  const scorers = ['Vinicius Jr.', 'Mbappé', 'Salah', 'Benzema', 'Lewandowski', 'Kane', 'De Bruyne', 'Neymar']
  const homeCardPts = homeYellows * 10 + homeReds * 25
  const awayCardPts = awayYellows * 10 + awayReds * 25
  return {
    home_score: score[0], away_score: score[1],
    ht_home: ht[0], ht_away: ht[1],
    home_corners: corners[0], away_corners: corners[1],
    ht_home_corners: htCorners[0], ht_away_corners: htCorners[1],
    home_yellows: homeYellows, away_yellows: awayYellows,
    home_reds: homeReds, away_reds: awayReds,
    home_card_pts: homeCardPts, away_card_pts: awayCardPts,
    total_card_pts: homeCardPts + awayCardPts,
    first_scorer: score[0] > 0 || score[1] > 0 ? scorers[Math.floor(Math.random()*scorers.length)] : null,
    btts: score[0] > 0 && score[1] > 0,
    total_goals: score[0] + score[1],
    total_corners: corners[0] + corners[1],
    handicap_line: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5][Math.floor(Math.random()*7)],
  }
}

function getResult(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

function checkCorrect(categoryId: string, pick: any, result: ReturnType<typeof generateResult>): boolean {
  const actual = getResult(result.home_score, result.away_score)
  const htActual = getResult(result.ht_home, result.ht_away)
  switch(categoryId) {
    case 'soccer_result': return pick === actual
    case 'soccer_ht_result': return pick === htActual
    case 'soccer_exact_score': return pick === `${result.home_score}-${result.away_score}`
    case 'soccer_ht_exact_score': return pick === `${result.ht_home}-${result.ht_away}`
    case 'soccer_btts': return pick === result.btts
    case 'soccer_total_goals_ou': return (pick === 'over' && result.total_goals > 2.5) || (pick === 'under' && result.total_goals <= 2.5)
    case 'soccer_first_team_score': {
      const fts = result.total_goals === 0 ? 'none' : result.home_score > 0 ? 'home' : 'away'
      return pick === fts
    }
    case 'soccer_corners_winner': return pick === getResult(result.home_corners, result.away_corners)
    case 'soccer_ht_corners_winner': return pick === getResult(result.ht_home_corners, result.ht_away_corners)
    case 'soccer_total_corners_ou': return (pick === 'over' && result.total_corners > 9.5) || (pick === 'under' && result.total_corners <= 9.5)
    case 'soccer_card_points_ou': return (pick === 'over' && result.total_card_pts > 30) || (pick === 'under' && result.total_card_pts <= 30)
    case 'soccer_cards_home_away': return pick === getResult(result.home_card_pts, result.away_card_pts)
    case 'soccer_cards_ht': return false // can't simulate HT cards easily
    case 'soccer_asian_handicap': {
      const adjustedHome = result.home_score + (result.handicap_line || 0)
      if (pick === 'home') return adjustedHome > result.away_score
      if (pick === 'away') return result.away_score > adjustedHome
      return false
    }
    default: return false
  }
}

const CATEGORY_GROUPS = [
  { label: 'Match Outcome', ids: ['soccer_result', 'soccer_ht_result', 'soccer_asian_handicap'] },
  { label: 'Goals', ids: ['soccer_exact_score', 'soccer_ht_exact_score', 'soccer_btts', 'soccer_total_goals_ou', 'soccer_first_team_score', 'soccer_first_goalscorer', 'soccer_anytime_goalscorer'] },
  { label: 'Corners', ids: ['soccer_corners_winner', 'soccer_ht_corners_winner', 'soccer_total_corners_ou'] },
  { label: 'Bad Sportsmanship', ids: ['soccer_card_points_ou', 'soccer_cards_home_away', 'soccer_cards_ht', 'soccer_first_yellow_team'] },
]

const ROUND_SPECIALS = ['soccer_clean_sheet_round', 'soccer_brace_round', 'soccer_red_card_round', 'soccer_penalty_round']

export default function RulesetBuilder({ sport, onComplete }: {
  sport: string
  onComplete: (rules: SelectedRule[]) => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<Record<string, SelectedRule>>({})
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof generateResult> | null>(null)
  const [userPicks, setUserPicks] = useState<Record<string, any>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('ruleset_categories').select('*').eq('sport', sport).order('sort_order')
      const cats = data || []
      setCategories(cats)
      const initial: Record<string, SelectedRule> = {}
      cats.forEach(c => { initial[c.id] = { category_id: c.id, points: c.default_points, enabled: false } })
      setRules(initial)
      setLoading(false)
    }
    load()
  }, [sport])

  function toggleRule(id: string) {
    setRules(prev => ({ ...prev, [id]: { ...prev[id], enabled: !prev[id].enabled } }))
  }

  function setPoints(id: string, points: number) {
    setRules(prev => ({ ...prev, [id]: { ...prev[id], points } }))
  }

  function togglePartialCredit(id: string) {
    setRules(prev => ({ ...prev, [id]: { ...prev[id], partial_credit: !prev[id].partial_credit, partial_credit_points: prev[id].partial_credit_points || 1 } }))
  }

  function calcScore(): number {
    if (!result) return 0
    let pts = 0
    Object.values(rules).filter(r => r.enabled).forEach(rule => {
      const pick = userPicks[rule.category_id]
      if (pick === undefined || pick === null || pick === '') return
      const correct = checkCorrect(rule.category_id, pick, result)
      if (correct) {
        pts += rule.points
      } else if (rule.partial_credit && (rule.category_id === 'soccer_exact_score' || rule.category_id === 'soccer_ht_exact_score')) {
        // partial credit: correct result but wrong score
        const scoreResult = getResult(result.home_score, result.away_score)
        const htResult = getResult(result.ht_home, result.ht_away)
        const [ph, pa] = (pick || '0-0').split('-').map(Number)
        const predictedResult = getResult(ph, pa)
        if (rule.category_id === 'soccer_exact_score' && predictedResult === scoreResult) pts += (rule.partial_credit_points || 1)
        if (rule.category_id === 'soccer_ht_exact_score' && predictedResult === htResult) pts += (rule.partial_credit_points || 1)
      }
    })
    return pts
  }

  const enabledCount = Object.values(rules).filter(r => r.enabled).length

  if (loading) return <div style={{color: '#aaa', fontSize: '13px'}}>loading...</div>

  function RuleRow({ cat }: { cat: Category }) {
    const rule = rules[cat.id]
    if (!rule) return null
    const pick = userPicks[cat.id]
    const isExact = cat.id === 'soccer_exact_score' || cat.id === 'soccer_ht_exact_score'
    const correct = result && pick !== undefined && pick !== '' ? checkCorrect(cat.id, pick, result) : null

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
        <div onClick={() => toggleRule(cat.id)} style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
          background: rule.enabled ? '#C8102E' : '#ddd', cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
        }}>
          <div style={{
            position: 'absolute', top: 2, left: rule.enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: 'white',
            transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        <div style={{flex: 1}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px'}}>
            <span style={{fontWeight: 600, fontSize: '12px', color: rule.enabled ? '#111' : '#888'}}>{cat.name}</span>
            <div style={{display: 'flex', gap: '4px'}}>
              {cat.requires_line && <span style={{fontSize: '9px', color: '#C8102E', border: '1px solid #C8102E', padding: '1px 4px'}}>LIVE LINE</span>}
              {cat.prediction_type === 'per_round' && <span style={{fontSize: '9px', color: '#888', border: '1px solid #ddd', padding: '1px 4px'}}>ROUND</span>}
            </div>
          </div>
          <p style={{fontSize: '11px', color: '#aaa', margin: '0 0 4px', lineHeight: 1.4}}>{cat.description}</p>
          {rule.enabled && (
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px'}}>
                <span style={{fontSize: '11px', color: '#555'}}>points:</span>
                <input type="number" min="1" max="20" value={rule.points}
                  onChange={e => setPoints(cat.id, parseInt(e.target.value) || 1)}
                  style={{width: 44, border: '1px solid #ddd', padding: '2px 6px', fontSize: '12px', fontWeight: 600, textAlign: 'center', fontFamily: 'inherit'}} />
                <span style={{fontSize: '11px', color: '#aaa'}}>per correct prediction</span>
              </div>
              {isExact && (
                <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px'}}>
                  <input type="checkbox" id={`pc-${cat.id}`} checked={!!rule.partial_credit}
                    onChange={() => togglePartialCredit(cat.id)} />
                  <label htmlFor={`pc-${cat.id}`} style={{fontSize: '11px', color: '#555', cursor: 'pointer'}}>
                    partial credit for correct result (wrong score)
                  </label>
                  {rule.partial_credit && (
                    <input type="number" min="1" max="10" value={rule.partial_credit_points || 1}
                      onChange={e => setRules(prev => ({...prev, [cat.id]: {...prev[cat.id], partial_credit_points: parseInt(e.target.value) || 1}}))}
                      style={{width: 36, border: '1px solid #ddd', padding: '2px 4px', fontSize: '11px', textAlign: 'center', fontFamily: 'inherit'}} />
                  )}
                  {rule.partial_credit && <span style={{fontSize: '11px', color: '#aaa'}}>pts</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function TicketInput({ cat }: { cat: Category }) {
    const rule = rules[cat.id]
    if (!rule?.enabled) return null
    const pick = userPicks[cat.id]
    const correct = result && pick !== undefined && pick !== '' ? checkCorrect(cat.id, pick, result) : null

    const btnStyle = (val: any) => ({
      flex: 1, padding: '5px 3px', fontSize: '10px', border: '1px solid',
      cursor: 'pointer', fontFamily: 'inherit',
      borderColor: pick === val ? '#C8102E' : '#ddd',
      background: pick === val ? '#C8102E' : 'white',
      color: pick === val ? 'white' : '#555',
    } as React.CSSProperties)

    return (
      <div style={{marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f0f0f0'}}>
        <div style={{fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: '5px', display: 'flex', justifyContent: 'space-between'}}>
          <span>{cat.name}</span>
          <span style={{color: '#C8102E'}}>{rule.points} pt{rule.points > 1 ? 's' : ''}</span>
        </div>

        {cat.input_type === 'wld' && (
          <div style={{display: 'flex', gap: 0}}>
            <button style={{...btnStyle('home'), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'home'}))}>
              {EXAMPLE_FIXTURE.home_flag} {EXAMPLE_FIXTURE.home_team}
            </button>
            {cat.id !== 'soccer_asian_handicap' && (
              <button style={{...btnStyle('draw'), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'draw'}))}>draw</button>
            )}
            <button style={btnStyle('away')} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'away'}))}>
              {EXAMPLE_FIXTURE.away_team} {EXAMPLE_FIXTURE.away_flag}
            </button>
          </div>
        )}

        {cat.id === 'soccer_first_team_score' && (
          <div style={{display: 'flex', gap: 0}}>
            <button style={{...btnStyle('home'), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'home'}))}>{EXAMPLE_FIXTURE.home_flag} {EXAMPLE_FIXTURE.home_team}</button>
            <button style={{...btnStyle('none'), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'none'}))}>no goal</button>
            <button style={btnStyle('away')} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'away'}))}>{EXAMPLE_FIXTURE.away_team} {EXAMPLE_FIXTURE.away_flag}</button>
          </div>
        )}

        {cat.input_type === 'yesno' && (
          <div style={{display: 'flex', gap: 0}}>
            <button style={{...btnStyle(true), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: true}))}>yes</button>
            <button style={btnStyle(false)} onClick={() => setUserPicks(p => ({...p, [cat.id]: false}))}>no</button>
          </div>
        )}

        {cat.input_type === 'ou' && (
          <div style={{display: 'flex', gap: 0}}>
            <button style={{...btnStyle('over'), borderRight: 'none'}} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'over'}))}>
              over {cat.requires_line ? '(line TBD)' : '2.5'}
            </button>
            <button style={btnStyle('under')} onClick={() => setUserPicks(p => ({...p, [cat.id]: 'under'}))}>
              under {cat.requires_line ? '(line TBD)' : '2.5'}
            </button>
          </div>
        )}

        {cat.input_type === 'exact' && (
          <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
            <input type="number" min="0" max="15" placeholder="0"
              style={{width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit'}}
              onChange={e => {
                const current = (userPicks[cat.id] || '0-0').split('-')
                setUserPicks(p => ({...p, [cat.id]: `${e.target.value}-${current[1] || '0'}`}))
              }} />
            <span style={{color: '#aaa'}}>–</span>
            <input type="number" min="0" max="15" placeholder="0"
              style={{width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit'}}
              onChange={e => {
                const current = (userPicks[cat.id] || '0-0').split('-')
                setUserPicks(p => ({...p, [cat.id]: `${current[0] || '0'}-${e.target.value}`}))
              }} />
          </div>
        )}

        {(cat.input_type === 'player' || cat.input_type === 'team') && (
          <input placeholder={cat.input_type === 'player' ? 'player name...' : 'team name...'}
            style={{width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit'}}
            onChange={e => setUserPicks(p => ({...p, [cat.id]: e.target.value}))} />
        )}

        {result && correct !== null && (
          <div style={{fontSize: '10px', marginTop: '3px', color: correct ? '#2d7a2d' : '#aaa'}}>
            {correct ? `✓ +${rule.points} pts` : `✗ no points`}
            {!correct && rule.partial_credit && (cat.id === 'soccer_exact_score' || cat.id === 'soccer_ht_exact_score') && (() => {
              const [ph, pa] = (pick || '0-0').split('-').map(Number)
              const predicted = getResult(ph, pa)
              const actual = cat.id === 'soccer_exact_score' ? getResult(result.home_score, result.away_score) : getResult(result.ht_home, result.ht_away)
              return predicted === actual ? <span style={{color: '#f59e0b'}}> · partial credit +{rule.partial_credit_points} pts</span> : null
            })()}
          </div>
        )}
      </div>
    )
  }

  const allCatIds = [...CATEGORY_GROUPS.flatMap(g => g.ids), ...ROUND_SPECIALS]
  const perRoundCats = categories.filter(c => ROUND_SPECIALS.includes(c.id))

  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start'}}>

      {/* LEFT */}
      <div>
        <div style={{marginBottom: '16px'}}>
          <h2 style={{fontWeight: 700, fontSize: '15px', marginBottom: '4px'}}>what should participants predict?</h2>
          <p style={{fontSize: '11px', color: '#888'}}>toggle on predictions, set the points. the ticket preview updates live on the right.</p>
        </div>

        {CATEGORY_GROUPS.map(group => {
          const groupCats = categories.filter(c => group.ids.includes(c.id))
          if (groupCats.length === 0) return null
          return (
            <div key={group.label} style={{marginBottom: '20px'}}>
              <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #eee'}}>
                {group.label}
              </div>
              {groupCats.map(cat => <RuleRow key={cat.id} cat={cat} />)}
            </div>
          )
        })}

        {perRoundCats.length > 0 && (
          <div style={{marginBottom: '20px'}}>
            <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #eee'}}>
              round specials
              <span style={{fontWeight: 400, textTransform: 'none' as const, marginLeft: '6px', color: '#ccc'}}>
                — one pick per matchday, covers your group's game that day
              </span>
            </div>
            {perRoundCats.map(cat => <RuleRow key={cat.id} cat={cat} />)}
          </div>
        )}

        <button
          onClick={() => onComplete(Object.values(rules).filter(r => r.enabled))}
          disabled={enabledCount === 0}
          style={{
            padding: '10px 24px', background: enabledCount > 0 ? '#111' : '#ddd',
            color: 'white', border: 'none', cursor: enabledCount > 0 ? 'pointer' : 'default',
            fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
          }}>
          continue with {enabledCount} prediction{enabledCount !== 1 ? 's' : ''} →
        </button>
      </div>

      {/* RIGHT: Ticket emulator */}
      <div style={{position: 'sticky', top: 70}}>
        <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '8px'}}>
          ticket preview — example fixture
        </div>
        <div style={{background: 'white', border: '1px solid #e0e0db'}}>
          <div style={{background: '#111', color: 'white', padding: '10px 12px'}}>
            <div style={{fontSize: '10px', color: '#888', marginBottom: '4px'}}>{EXAMPLE_FIXTURE.round} · {EXAMPLE_FIXTURE.date}</div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{fontWeight: 700, fontSize: '13px'}}>{EXAMPLE_FIXTURE.home_flag} {EXAMPLE_FIXTURE.home_team}</span>
              <span style={{color: '#555', fontSize: '11px'}}>vs</span>
              <span style={{fontWeight: 700, fontSize: '13px'}}>{EXAMPLE_FIXTURE.away_team} {EXAMPLE_FIXTURE.away_flag}</span>
            </div>
            {result && (
              <div style={{marginTop: '8px', fontSize: '11px', color: '#aaa', lineHeight: 1.6}}>
                <div style={{fontWeight: 700, fontSize: '15px', color: 'white', textAlign: 'center'}}>{result.home_score} – {result.away_score}</div>
                <div style={{textAlign: 'center', fontSize: '10px'}}>HT: {result.ht_home}–{result.ht_away} · corners: {result.home_corners}–{result.away_corners} · cards: {result.home_yellows}Y{result.home_reds > 0 ? `/${result.home_reds}R` : ''} / {result.away_yellows}Y{result.away_reds > 0 ? `/${result.away_reds}R` : ''}</div>
                {result.handicap_line !== 0 && <div style={{textAlign: 'center', fontSize: '10px', color: '#C8102E'}}>handicap: {result.home_score > 0 ? EXAMPLE_FIXTURE.home_team : EXAMPLE_FIXTURE.away_team} {result.handicap_line > 0 ? '+' : ''}{result.handicap_line}</div>}
              </div>
            )}
          </div>

          {enabledCount === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '12px'}}>
              toggle on predictions to see the ticket
            </div>
          ) : (
            <div style={{padding: '10px 12px'}}>
              {categories.filter(c => rules[c.id]?.enabled && c.id !== 'soccer_first_team_score').map(cat => (
                <TicketInput key={cat.id} cat={cat} />
              ))}
              {categories.filter(c => c.id === 'soccer_first_team_score' && rules[c.id]?.enabled).map(cat => (
                <TicketInput key={cat.id} cat={cat} />
              ))}

              <div style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee'}}>
                <button onClick={() => { setResult(generateResult()); setUserPicks({}) }}
                  style={{width: '100%', padding: '8px', fontSize: '11px', background: '#f5f5f5', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '6px'}}>
                  🎲 generate random result
                </button>
                {result && Object.keys(userPicks).length > 0 && (
                  <div style={{textAlign: 'center', padding: '8px', background: '#fff5f5', border: '1px solid #f0d0d0'}}>
                    <span style={{fontSize: '11px', color: '#555'}}>score for these picks: </span>
                    <span style={{fontWeight: 700, fontSize: '16px', color: '#C8102E'}}>{calcScore()} pts</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
