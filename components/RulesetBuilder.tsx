'use client'

import { useState, useEffect, useRef } from 'react'
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
  points: number       // pts per correct team score (exact score); pts for all other categories
  bonus_points: number // bonus when BOTH team scores are correct (exact score only)
  enabled: boolean
}

const EXAMPLE_FIXTURE = {
  home_team: 'Mexico',
  away_team: 'South Africa',
  home_flag: '🇲🇽',
  away_flag: '🇿🇦',
  date: 'Jun 12 · 12:00 PM PT',
  round: 'Group A · Matchday 1',
  goals_line: 2.5,
  corners_line: 9.5,
  card_pts_line: 30,
  handicap_line: -0.5,
}

const EXAMPLE_FIXTURE_PL = {
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  home_flag: '🔴',
  away_flag: '🔵',
  date: 'Aug 16 · 3:00 PM BST',
  round: 'Matchday 1',
  goals_line: 2.5,
  corners_line: 9.5,
  card_pts_line: 30,
  handicap_line: -0.5,
}

const EXAMPLE_FIXTURE_MMA = {
  home_team: 'Ilia Topuria',
  away_team: 'Justin Gaethje',
  home_flag: '',
  away_flag: '',
  date: 'Jun 14 · 5:00 PM PT',
  round: 'Lightweight · Main Event',
  goals_line: null,
  corners_line: null,
  card_pts_line: null,
  handicap_line: null,
}


// All WC 2026 squad players for brace/goalscorer search (representative sample)
const WC_PLAYERS = [
  'Hirving Lozano', 'Raúl Jiménez', 'Edson Álvarez', 'Henry Martín', 'Chucky Lozano',
  'Percy Tau', 'Lyle Foster', 'Ronwen Williams', 'Bafana Bafana', 'Evidence Makgopa',
  'Robert Lewandowski', 'Piotr Zieliński', 'Jakub Błaszczykowski',
  'Salem Al-Dawsari', 'Firas Al-Buraikan', 'Mohammed Al-Owais',
  'Kylian Mbappé', 'Antoine Griezmann', 'Ousmane Dembélé',
  'Harry Kane', 'Bukayo Saka', 'Jude Bellingham', 'Phil Foden',
  'Vinicius Jr.', 'Rodrygo', 'Neymar', 'Richarlison',
  'Erling Haaland', 'Martin Ødegaard',
  'Mohamed Salah', 'Omar Marmoush',
  'Lamine Yamal', 'Pedri', 'Ferran Torres', 'Álvaro Morata',
  'Ciro Immobile', 'Federico Chiesa', 'Gianluigi Donnarumma',
  'Serge Gnabry', 'Kai Havertz', 'Florian Wirtz', 'Thomas Müller',
  'Romelu Lukaku', 'Kevin De Bruyne', 'Dodi Lukebakio',
  'Christian Pulisic', 'Gio Reyna', 'Ricardo Pepi',
  'Lionel Messi', 'Julián Álvarez', 'Enzo Fernández',
]

const EXAMPLE_FIXTURE_F1 = {
  home_team: 'Max Verstappen',
  away_team: 'Lewis Hamilton',
  home_flag: '🇳🇱',
  away_flag: '🇬🇧',
  date: 'Monaco Grand Prix · May 25',
  round: 'Race · Round 8',
  goals_line: null,
  corners_line: null,
  card_pts_line: null,
  handicap_line: null,
}

const F1_DRIVERS_2026 = [
  // McLaren
  'Lando Norris', 'Oscar Piastri',
  // Ferrari
  'Charles Leclerc', 'Lewis Hamilton',
  // Red Bull
  'Max Verstappen', 'Isack Hadjar',
  // Mercedes
  'George Russell', 'Kimi Antonelli',
  // Aston Martin
  'Fernando Alonso', 'Lance Stroll',
  // Williams
  'Alexander Albon', 'Carlos Sainz',
  // Alpine
  'Pierre Gasly', 'Franco Colapinto',
  // Haas
  'Esteban Ocon', 'Oliver Bearman',
  // Racing Bulls
  'Liam Lawson', 'Arvid Lindblad',
  // Audi
  'Nico Hülkenberg', 'Gabriel Bortoleto',
  // Cadillac
  'Sergio Pérez', 'Valtteri Bottas',
]

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
  const homeCardPts = homeYellows * 10 + homeReds * 25
  const awayCardPts = awayYellows * 10 + awayReds * 25
  const totalGoals = score[0] + score[1]
  const scorers = WC_PLAYERS.slice(0, 8)
  // first yellow: 'home', 'away', or 'none'
  const firstYellow = homeYellows === 0 && awayYellows === 0 ? 'none' : homeYellows > 0 && awayYellows > 0
    ? (Math.random() > 0.5 ? 'home' : 'away')
    : homeYellows > 0 ? 'home' : 'away'
  return {
    home_score: score[0], away_score: score[1],
    ht_home: ht[0], ht_away: ht[1],
    home_corners: corners[0], away_corners: corners[1],
    ht_home_corners: htCorners[0], ht_away_corners: htCorners[1],
    home_yellows: homeYellows, away_yellows: awayYellows,
    home_reds: homeReds, away_reds: awayReds,
    home_card_pts: homeCardPts, away_card_pts: awayCardPts,
    total_card_pts: homeCardPts + awayCardPts,
    first_scorer: totalGoals > 0 ? scorers[Math.floor(Math.random()*scorers.length)] : null,
    btts: score[0] > 0 && score[1] > 0,
    total_goals: totalGoals,
    total_corners: corners[0] + corners[1],
    first_yellow: firstYellow,
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
  switch (categoryId) {
    case 'soccer_result': return pick === actual
    case 'soccer_ht_result': return pick === htActual
    case 'soccer_exact_score': return pick === `${result.home_score}-${result.away_score}`
    case 'soccer_ht_exact_score': return pick === `${result.ht_home}-${result.ht_away}`
    case 'soccer_btts': return pick === result.btts
    case 'soccer_total_goals_ou':
      return (pick === 'over' && result.total_goals > EXAMPLE_FIXTURE.goals_line) ||
             (pick === 'under' && result.total_goals <= EXAMPLE_FIXTURE.goals_line)
    case 'soccer_first_team_score': {
      const fts = result.total_goals === 0 ? 'none' : result.home_score > 0 ? 'home' : 'away'
      return pick === fts
    }
    case 'soccer_corners_winner': return pick === getResult(result.home_corners, result.away_corners)
    case 'soccer_ht_corners_winner': return pick === getResult(result.ht_home_corners, result.ht_away_corners)
    case 'soccer_total_corners_ou':
      return (pick === 'over' && result.total_corners > EXAMPLE_FIXTURE.corners_line) ||
             (pick === 'under' && result.total_corners <= EXAMPLE_FIXTURE.corners_line)
    case 'soccer_card_points_ou':
      return (pick === 'over' && result.total_card_pts > EXAMPLE_FIXTURE.card_pts_line) ||
             (pick === 'under' && result.total_card_pts <= EXAMPLE_FIXTURE.card_pts_line)
    case 'soccer_cards_home_away': return pick === getResult(result.home_card_pts, result.away_card_pts)
    case 'soccer_cards_ht': return false
    case 'soccer_first_yellow_team': return pick === result.first_yellow
    case 'soccer_asian_handicap': {
      const adjustedHome = result.home_score + EXAMPLE_FIXTURE.handicap_line
      if (pick === 'home') return adjustedHome > result.away_score
      if (pick === 'away') return result.away_score > adjustedHome
      return false
    }
    case 'soccer_first_goalscorer': return pick && result.first_scorer && pick.toLowerCase() === result.first_scorer.toLowerCase()
    case 'soccer_anytime_goalscorer': return false // can't simulate full scorer list
    default: return false
  }
}

const CATEGORY_GROUPS = [
  { label: 'Match Outcome', ids: ['soccer_result', 'soccer_team_to_advance', 'soccer_ht_result', 'soccer_asian_handicap'], plExclude: ['soccer_team_to_advance'] },
  { label: 'Goals', ids: ['soccer_exact_score', 'soccer_ht_exact_score', 'soccer_btts', 'soccer_total_goals_ou', 'soccer_first_team_score', 'soccer_first_goalscorer', 'soccer_anytime_goalscorer'] },
  { label: 'Corners', ids: ['soccer_corners_winner', 'soccer_ht_corners_winner', 'soccer_total_corners_ou'] },
  { label: 'Cards', ids: ['soccer_card_points_ou', 'soccer_cards_home_away', 'soccer_cards_ht', 'soccer_first_yellow_team'] },
  { label: 'Fight Result', ids: ['mma_result', 'mma_method'] },
  { label: 'Fight Duration', ids: ['mma_round_finish'] },
  { label: 'Race', ids: ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_first_pit_lap', 'f1_teammate_battle'] },
  { label: 'Qualifying', ids: ['f1_pole_position', 'f1_top3_quali', 'f1_q1_eliminated', 'f1_q3_qualifier'] },
  { label: 'Sprint', ids: ['f1_sprint_winner', 'f1_sprint_podium'] },
  { label: 'Head to Head', ids: ['f1_top6_teammate'] },
]

const ROUND_SPECIALS = ['soccer_clean_sheet_round', 'soccer_brace_round', 'soccer_red_card_round', 'soccer_penalty_round']

// Descriptions that override whatever is in the DB for display clarity
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  soccer_clean_sheet_round: 'Predict which team will keep a clean sheet. Pick 1 team per group, per matchday.',
  soccer_brace_round: 'Predict which player scores 2+ goals across any game that matchday. One pick per matchday.',
  soccer_red_card_round: 'Predict which team receives a red card across any game that matchday. One pick per matchday.',
  soccer_penalty_round: 'Predict which team earns a penalty across any game that matchday. One pick per matchday.',
}

// PlayerSearch: searchable dropdown for player/team picks
function PlayerSearch({ value, onChange, players, placeholder }: {
  value: string, onChange: (v: string) => void, players: string[], placeholder: string
}) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.length > 0
    ? players.filter(p => p.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
          border: '1px solid #ddd', borderTop: 'none', zIndex: 100, maxHeight: 160, overflowY: 'auto',
        }}>
          {filtered.map(p => (
            <div key={p}
              onMouseDown={() => { onChange(p); setQuery(p); setOpen(false) }}
              style={{ padding: '5px 8px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >{p}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// F1 driver dropdown for the preview ticket — team-organized, no search
function F1PreviewDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const team = F1_GRID_PREVIEW.find(t => t.drivers.includes(value))
  return (
    <div style={{ position: 'relative' as const }}>
      <button type="button" onMouseDown={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '6px 10px', border: '1px solid', borderColor: value ? '#C8102E' : '#ddd', background: 'white', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: value ? '#C8102E' : '#aaa', fontWeight: value ? 700 : 400 }}>{value || 'select driver...'}</span>
        <span style={{ fontSize: '10px', color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #ddd', borderTop: 'none', maxHeight: 220, overflowY: 'auto' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {value && <button type="button" onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false) }}
            style={{ width: '100%', padding: '6px 10px', border: 'none', borderBottom: '1px solid #f0f0f0', background: '#fafafa', color: '#aaa', fontSize: '11px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer' }}>— clear</button>}
          {F1_GRID_PREVIEW.map(t => (
            <div key={t.name}>
              <div style={{ padding: '4px 10px', background: '#f8f8f8', fontSize: '10px', fontWeight: 700, color: t.color, textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #f0f0f0' }}>{t.name}</div>
              {t.drivers.map(d => (
                <button key={d} type="button" onMouseDown={e => { e.preventDefault(); onChange(d); setOpen(false) }}
                  style={{ width: '100%', padding: '7px 10px', border: 'none', borderBottom: '1px solid #f5f5f5', background: value === d ? '#fff5f5' : 'white', color: value === d ? '#C8102E' : '#111', fontWeight: value === d ? 700 : 400, fontSize: '12px', fontFamily: 'inherit', textAlign: 'left' as const, cursor: 'pointer' }}>{d}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Lightweight grid for preview (names + team colors only, no photos needed)
const F1_GRID_PREVIEW = [
  { name: 'McLaren', color: '#FF8000', drivers: ['Lando Norris', 'Oscar Piastri'] },
  { name: 'Ferrari', color: '#E8002D', drivers: ['Charles Leclerc', 'Lewis Hamilton'] },
  { name: 'Red Bull', color: '#3671C6', drivers: ['Max Verstappen', 'Isack Hadjar'] },
  { name: 'Mercedes', color: '#27F4D2', drivers: ['George Russell', 'Kimi Antonelli'] },
  { name: 'Aston Martin', color: '#229971', drivers: ['Fernando Alonso', 'Lance Stroll'] },
  { name: 'Williams', color: '#64C4FF', drivers: ['Alexander Albon', 'Carlos Sainz'] },
  { name: 'Alpine', color: '#0093CC', drivers: ['Pierre Gasly', 'Franco Colapinto'] },
  { name: 'Haas', color: '#B6BABD', drivers: ['Esteban Ocon', 'Oliver Bearman'] },
  { name: 'Racing Bulls', color: '#6692FF', drivers: ['Liam Lawson', 'Arvid Lindblad'] },
  { name: 'Audi', color: '#C00000', drivers: ['Nico Hülkenberg', 'Gabriel Bortoleto'] },
  { name: 'Cadillac', color: '#CC0000', drivers: ['Sergio Pérez', 'Valtteri Bottas'] },
]

export default function RulesetBuilder({ sport, onComplete, isPL }: {
  sport: string
  onComplete: (rules: SelectedRule[]) => void
  isPL?: boolean
}) {
  const fixture = sport === 'mma' ? EXAMPLE_FIXTURE_MMA : sport === 'f1' ? EXAMPLE_FIXTURE_F1 : isPL ? EXAMPLE_FIXTURE_PL : EXAMPLE_FIXTURE
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<Record<string, SelectedRule>>({})
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof generateResult> | null>(null)
  const [userPicks, setUserPicks] = useState<Record<string, any>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase.from('ruleset_categories').select('*').eq('sport', sport).order('sort_order')
      console.log('RulesetBuilder load:', { sport, count: data?.length, error, data })
      const cats = data || []
      setCategories(cats)
      const initial: Record<string, SelectedRule> = {}
      cats.forEach(c => {
        initial[c.id] = { category_id: c.id, points: c.default_points, bonus_points: 3, enabled: false }
      })
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

  function setBonusPoints(id: string, bonus_points: number) {
    setRules(prev => ({ ...prev, [id]: { ...prev[id], bonus_points } }))
  }

  function calcScore(): { total: number; breakdown: Record<string, { pts: number; detail: string }> } {
    const breakdown: Record<string, { pts: number; detail: string }> = {}
    if (!result) return { total: 0, breakdown }
    let total = 0

    Object.values(rules).filter(r => r.enabled).forEach(rule => {
      const pick = userPicks[rule.category_id]
      if (pick === undefined || pick === null || pick === '') return

      const isExact = rule.category_id === 'soccer_exact_score' || rule.category_id === 'soccer_ht_exact_score'

      if (isExact) {
        const [ph, pa] = (pick || '0-0').split('-').map(Number)
        const isFullTime = rule.category_id === 'soccer_exact_score'
        const actualHome = isFullTime ? result.home_score : result.ht_home
        const actualAway = isFullTime ? result.away_score : result.ht_away
        let pts = 0
        const homeCorrect = ph === actualHome
        const awayCorrect = pa === actualAway
        const parts: string[] = []
        if (homeCorrect) { pts += rule.points; parts.push(`${fixture.home_team} ✓ +${rule.points}`) }
        if (awayCorrect) { pts += rule.points; parts.push(`${fixture.away_team} ✓ +${rule.points}`) }
        if (homeCorrect && awayCorrect && rule.bonus_points > 0) { pts += rule.bonus_points; parts.push(`exact bonus +${rule.bonus_points}`) }
        breakdown[rule.category_id] = { pts, detail: parts.length ? parts.join(' · ') : '✗ no points' }
        total += pts
      } else {
        const correct = checkCorrect(rule.category_id, pick, result)
        breakdown[rule.category_id] = correct
          ? { pts: rule.points, detail: `✓ +${rule.points} pts` }
          : { pts: 0, detail: '✗ no points' }
        if (correct) total += rule.points
      }
    })

    return { total, breakdown }
  }

  const enabledCount = Object.values(rules).filter(r => r.enabled).length

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px' }}>loading...</div>

  function RuleRow({ cat }: { cat: Category }) {
    const rule = rules[cat.id]
    if (!rule) return null
    const isExact = cat.id === 'soccer_exact_score' || cat.id === 'soccer_ht_exact_score'
    const isPodiumOrder = cat.id === 'f1_podium_order'
    const isRound = ROUND_SPECIALS.includes(cat.id)
    const description = isPodiumOrder
      ? 'Predict the exact finishing order for P1, P2 and P3.'
      : (DESCRIPTION_OVERRIDES[cat.id] || cat.description)

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
        {/* Toggle */}
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
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: '12px', color: rule.enabled ? '#111' : '#888' }}>{cat.name}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {cat.requires_line && (
                <span style={{ fontSize: '9px', color: '#888', border: '1px solid #ccc', padding: '1px 4px', background: '#f5f5f5' }}>LIVE LINE</span>
              )}
              {isRound && (
                <span style={{ fontSize: '9px', color: '#888', border: '1px solid #ddd', padding: '1px 4px' }}>ROUND</span>
              )}
            </div>
          </div>
          <p style={{ fontSize: '11px', color: '#aaa', margin: '0 0 4px', lineHeight: 1.4 }}>{description}</p>
          {cat.requires_line && (
            <p style={{ fontSize: '10px', color: '#bbb', margin: '0 0 4px', fontStyle: 'italic' }}>
              Lines updated 24 hrs before kickoff.
            </p>
          )}
          {rule.enabled && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', color: '#555' }}>{isExact ? 'pts per team score:' : isPodiumOrder ? 'exact position:' : 'points:'}</span>
                <input type="number" min="1" max="20" value={rule.points}
                  onChange={e => setPoints(cat.id, parseInt(e.target.value) || 1)}
                  style={{ width: 44, border: '1px solid #ddd', padding: '2px 6px', fontSize: '12px', fontWeight: 600, textAlign: 'center', fontFamily: 'inherit' }} />
                {!isExact && !isPodiumOrder && <span style={{ fontSize: '11px', color: '#aaa' }}>per correct prediction</span>}
                {isPodiumOrder && <span style={{ fontSize: '11px', color: '#aaa' }}>pts</span>}
              </div>
              {isExact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#555' }}>exact score bonus:</span>
                  <input type="number" min="0" max="20" value={rule.bonus_points}
                    onChange={e => setBonusPoints(cat.id, parseInt(e.target.value) || 0)}
                    style={{ width: 44, border: '1px solid #ddd', padding: '2px 6px', fontSize: '12px', fontWeight: 600, textAlign: 'center', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: '11px', color: '#aaa' }}>bonus pts (both right)</span>
                </div>
              )}
              {isPodiumOrder && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#555' }}>on podium, wrong spot:</span>
                  <input type="number" min="0" max="20" value={rule.bonus_points}
                    onChange={e => setBonusPoints(cat.id, parseInt(e.target.value) || 0)}
                    style={{ width: 44, border: '1px solid #ddd', padding: '2px 6px', fontSize: '12px', fontWeight: 600, textAlign: 'center', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: '11px', color: '#aaa' }}>pts</span>
                </div>
              )}
              {isExact && (
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px', lineHeight: 1.5 }}>
                  e.g. 1 team right → <strong>{rule.points} pt</strong> · both right → <strong>{rule.points * 2 + rule.bonus_points} pts</strong> ({rule.points}+{rule.points}+{rule.bonus_points})
                </div>
              )}
              {isPodiumOrder && (
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px', lineHeight: 1.5 }}>
                  e.g. P1 correct → <strong>{rule.points} pts</strong> · driver on podium wrong spot → <strong>{rule.bonus_points} pts</strong>
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
    const isExact = cat.id === 'soccer_exact_score' || cat.id === 'soccer_ht_exact_score'
    const isRound = ROUND_SPECIALS.includes(cat.id)
    const scored = result ? calcScore() : null
    const itemBreakdown = pick !== undefined && pick !== null && pick !== '' ? scored?.breakdown[cat.id] : null

    const btnStyle = (val: any): React.CSSProperties => ({
      flex: 1, padding: '5px 3px', fontSize: '10px', border: '1px solid',
      cursor: 'pointer', fontFamily: 'inherit',
      borderColor: pick === val ? '#C8102E' : '#ddd',
      background: pick === val ? '#C8102E' : 'white',
      color: pick === val ? 'white' : '#555',
    })

    // Round specials: just show a "not yet picked" notice in the emulator
    if (isRound) {
      const roundLabel =
        cat.id === 'soccer_clean_sheet_round' ? 'Clean Sheet' :
        cat.id === 'soccer_brace_round' ? 'Brace Scorer' :
        cat.id === 'soccer_red_card_round' ? 'Red Card Team' : 'Penalty Team'

      return (
        <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{cat.name}</span>
            <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points > 1 ? 's' : ''}</span>
          </div>
          <div style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic', padding: '6px 8px', background: '#fafafa', border: '1px solid #f0f0f0' }}>
            {cat.id === 'soccer_clean_sheet_round'
              ? 'Pick 1 team per group, per matchday — shown on the pool page'
              : cat.id === 'soccer_brace_round'
              ? 'Pick any player in the tournament — searchable list shown on the pool page'
              : 'Pick any team in the tournament — shown on the pool page'
            }
            <div style={{ marginTop: '3px', color: '#ccc' }}>Made once per matchday, not per game.</div>
          </div>
        </div>
      )
    }

    return (
      <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{cat.name}</span>
          {isExact
            ? <span style={{ color: '#C8102E' }}>{rule.points} pts/team · +{rule.bonus_points} bonus</span>
            : <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points > 1 ? 's' : ''}</span>
          }
        </div>

        {/* WLD buttons — but NOT for first_team_score (handled separately below) */}
        {cat.input_type === 'wld' && cat.id !== 'soccer_first_team_score' && cat.id !== 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'home' }))}>
              {fixture.home_flag} {fixture.home_team}
            </button>
            {cat.id !== 'soccer_asian_handicap' && (
              <button style={{ ...btnStyle('draw'), borderRight: 'none' }}
                onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'draw' }))}>
                draw
              </button>
            )}
            <button style={btnStyle('away')}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'away' }))}>
              {fixture.away_team} {fixture.away_flag}
            </button>
          </div>
        )}

        {/* First team to score: home / no goal / away */}
        {cat.id === 'soccer_first_team_score' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'home' }))}>
              {fixture.home_flag} {fixture.home_team}
            </button>
            <button style={{ ...btnStyle('none'), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'none' }))}>
              no goal
            </button>
            <button style={btnStyle('away')}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'away' }))}>
              {fixture.away_team} {fixture.away_flag}
            </button>
          </div>
        )}

        {/* First yellow card team: home / no card / away */}
        {cat.id === 'soccer_first_yellow_team' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle('home'), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'home' }))}>
              {fixture.home_flag} {fixture.home_team}
            </button>
            <button style={{ ...btnStyle('none'), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'none' }))}>
              no card
            </button>
            <button style={btnStyle('away')}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'away' }))}>
              {fixture.away_team} {fixture.away_flag}
            </button>
          </div>
        )}

        {/* Over/Under */}
        {cat.input_type === 'ou' && (
          <div>
            <div style={{ display: 'flex', gap: 0 }}>
              <button style={{ ...btnStyle('over'), borderRight: 'none' }}
                onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'over' }))}>
                over {cat.id === 'soccer_total_goals_ou' ? fixture.goals_line
                    : cat.id === 'soccer_total_corners_ou' ? fixture.corners_line
                    : cat.id === 'soccer_card_points_ou' ? fixture.card_pts_line
                    : cat.requires_line ? '(line TBD)' : '2.5'}
              </button>
              <button style={btnStyle('under')}
                onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'under' }))}>
                under {cat.id === 'soccer_total_goals_ou' ? fixture.goals_line
                     : cat.id === 'soccer_total_corners_ou' ? fixture.corners_line
                     : cat.id === 'soccer_card_points_ou' ? fixture.card_pts_line
                     : cat.requires_line ? '(line TBD)' : '2.5'}
              </button>
            </div>
            {cat.requires_line && (
              <div style={{ fontSize: '9px', color: '#bbb', marginTop: '3px', fontStyle: 'italic' }}>
                Lines updated 24 hrs before kickoff
              </div>
            )}
          </div>
        )}

        {/* Exact score — home and away stored as separate keys to avoid stale closure */}
        {cat.input_type === 'exact' && (() => {
          const homeKey = `${cat.id}__home`
          const awayKey = `${cat.id}__away`
          const homeVal = userPicks[homeKey] ?? ''
          const awayVal = userPicks[awayKey] ?? ''
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <input
                type="number" min="0" max="15"
                value={homeVal}
                placeholder="0"
                style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit' }}
                onChange={e => {
                  const v = e.target.value
                  setUserPicks(p => {
                    const away = p[awayKey] ?? ''
                    return { ...p, [homeKey]: v, [cat.id]: `${v}-${away}` }
                  })
                }}
              />
              <span style={{ color: '#aaa' }}>–</span>
              <input
                type="number" min="0" max="15"
                value={awayVal}
                placeholder="0"
                style={{ width: 40, border: '1px solid #ddd', padding: '4px', textAlign: 'center', fontSize: '12px', fontFamily: 'inherit' }}
                onChange={e => {
                  const v = e.target.value
                  setUserPicks(p => {
                    const home = p[homeKey] ?? ''
                    return { ...p, [awayKey]: v, [cat.id]: `${home}-${v}` }
                  })
                }}
              />
            </div>
          )
        })()}

        {/* Yes/No */}
        {cat.input_type === 'yesno' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button style={{ ...btnStyle(true), borderRight: 'none' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: true }))}>yes</button>
            <button style={btnStyle(false)}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: false }))}>no</button>
          </div>
        )}

        {/* Goalscorer/driver search */}
        {(cat.input_type === 'player') && sport !== 'f1' && (
          <PlayerSearch
            value={userPicks[cat.id] || ''}
            onChange={v => setUserPicks(p => ({ ...p, [cat.id]: v }))}
            players={WC_PLAYERS}
            placeholder="search player..."
          />
        )}

        {/* F1 driver dropdown — organized by team, no search */}
        {(cat.input_type === 'player') && sport === 'f1' && (
          <F1PreviewDropdown
            value={userPicks[cat.id] || ''}
            onChange={v => setUserPicks(p => ({ ...p, [cat.id]: v }))}
          />
        )}

        {/* Round finished (MMA) */}
        {cat.id === 'mma_round_finish' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
            {[1, 2, 3, 4, 5].map(round => (
              <button key={round}
                style={{ ...btnStyle(round), flex: '0 0 44px' }}
                onClick={() => setUserPicks(p => ({ ...p, [cat.id]: round }))}>
                R{round}
              </button>
            ))}
            <button style={{ ...btnStyle('Decision'), flex: '1 1 auto' }}
              onClick={() => setUserPicks(p => ({ ...p, [cat.id]: 'Decision' }))}>
              Decision
            </button>
          </div>
        )}

        {/* Team text input */}
        {cat.input_type === 'team' && (
          <input placeholder="team name..."
            style={{ width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit' }}
            onChange={e => setUserPicks(p => ({ ...p, [cat.id]: e.target.value }))} />
        )}

        {/* Scoring feedback */}
        {result && itemBreakdown && (
          <div style={{ fontSize: '10px', marginTop: '4px', color: itemBreakdown.pts > 0 ? '#2d7a2d' : '#aaa' }}>
            {itemBreakdown.detail}
          </div>
        )}
      </div>
    )
  }

  const perRoundCats = categories.filter(c => ROUND_SPECIALS.includes(c.id))

  const ticketPreview = (
    <div style={{ background: 'white', border: '1px solid #e0e0db', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Fixed header */}
      <div style={{ background: '#111', color: 'white', padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>{fixture.round} · {fixture.date}</div>
        {sport === 'f1' ? (
          <div style={{ fontWeight: 700, fontSize: '14px', textAlign: 'center' as const }}>🏎 Monaco Grand Prix</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{fixture.home_flag} {fixture.home_team}</span>
            <span style={{ color: '#555', fontSize: '11px' }}>vs</span>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{fixture.away_team} {fixture.away_flag}</span>
          </div>
        )}
        {result && sport !== 'f1' && (
          <div style={{ marginTop: '8px', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'white', textAlign: 'center' }}>{result.home_score} – {result.away_score}</div>
            <div style={{ textAlign: 'center', fontSize: '10px', color: '#aaa' }}>
              HT: {result.ht_home}–{result.ht_away} · corners: {result.home_corners}–{result.away_corners} · cards: {result.home_yellows}Y{result.home_reds > 0 ? `/${result.home_reds}R` : ''} / {result.away_yellows}Y{result.away_reds > 0 ? `/${result.away_reds}R` : ''}
            </div>
            {result.first_scorer && (
              <div style={{ textAlign: 'center', fontSize: '10px', color: '#aaa' }}>first scorer: {result.first_scorer}</div>
            )}
            <div style={{ textAlign: 'center', fontSize: '10px', color: '#777' }}>
              handicap: {fixture.home_team} {fixture.handicap_line > 0 ? '+' : ''}{fixture.handicap_line} · goals O/U: {fixture.goals_line} · corners O/U: {fixture.corners_line}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      {enabledCount === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '12px' }}>
          toggle on predictions to see the ticket
        </div>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px', maxHeight: isMobile ? 400 : undefined }}>
          {categories.filter(c => rules[c.id]?.enabled).map(cat => (
            <TicketInput key={cat.id} cat={cat} />
          ))}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
            {sport !== 'f1' && (
              <button
                onClick={() => setResult(generateResult())}
                style={{ width: '100%', padding: '10px', fontSize: '12px', background: '#f5f5f5', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '6px', minHeight: 44 }}>
                🎲 generate random result
              </button>
            )}
            {result && Object.keys(userPicks).length > 0 && (
              <div style={{ textAlign: 'center', padding: '8px', background: '#fff5f5', border: '1px solid #f0d0d0' }}>
                <span style={{ fontSize: '11px', color: '#555' }}>score for these picks: </span>
                <span style={{ fontWeight: 700, fontSize: '16px', color: '#C8102E' }}>{calcScore().total} pts</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  const rulesPanel = (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>what should participants predict?</h2>
        <p style={{ fontSize: '11px', color: '#888' }}>
          {isMobile ? 'toggle on predictions, set the points.' : 'toggle on predictions, set the points. the ticket preview updates live on the right.'}
        </p>
      </div>

      {CATEGORY_GROUPS.map(group => {
        const groupCats = categories.filter(c => {
          if (!group.ids.includes(c.id)) return false
          if (isPL && (group as any).plExclude?.includes(c.id)) return false
          return true
        })
        if (groupCats.length === 0) return null
        return (
          <div key={group.label} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #eee' }}>
              {group.label}
            </div>
            {groupCats.map(cat => <RuleRow key={cat.id} cat={cat} />)}
          </div>
        )
      })}

      {perRoundCats.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #eee' }}>
            round specials
            <span style={{ fontWeight: 400, textTransform: 'none' as const, marginLeft: '6px', color: '#ccc' }}>
              — one pick per matchday, per group
            </span>
          </div>
          {perRoundCats.map(cat => <RuleRow key={cat.id} cat={cat} />)}
        </div>
      )}

      <button
        onClick={() => onComplete(Object.values(rules).filter(r => r.enabled))}
        disabled={enabledCount === 0}
        style={{
          padding: '12px 24px', background: enabledCount > 0 ? '#111' : '#ddd',
          color: 'white', border: 'none', cursor: enabledCount > 0 ? 'pointer' : 'default',
          fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', minHeight: 44, width: isMobile ? '100%' : 'auto',
        }}>
        continue with {enabledCount} prediction{enabledCount !== 1 ? 's' : ''} →
      </button>
    </div>
  )

  return isMobile ? (
    <div>
      {rulesPanel}
      <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
        <button
          onClick={() => setShowPreview(p => !p)}
          style={{ width: '100%', padding: '10px', fontSize: '12px', background: 'white', border: '1px solid #ddd', cursor: 'pointer', fontFamily: 'inherit', marginBottom: showPreview ? '12px' : 0, minHeight: 44 }}>
          {showPreview ? '▲ hide ticket preview' : '▼ show ticket preview'}
        </button>
        {showPreview && ticketPreview}
      </div>
    </div>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '24px', alignItems: 'start' }}>
      {rulesPanel}
      {/* RIGHT: Ticket emulator — scrollable, max height so it doesn't go off screen */}
      <div style={{ position: 'sticky', top: 70, maxHeight: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: '8px', flexShrink: 0 }}>
          ticket preview — example fixture
        </div>
        {ticketPreview}
      </div>
    </div>
  )
}
