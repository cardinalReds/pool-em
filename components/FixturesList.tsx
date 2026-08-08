'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WC_SQUADS } from '@/lib/wc_squads'
import Best5Selector from '@/components/Best5Selector'
import {
  syncGhostToPublicPools, copyGhostPredictionsToMirrors,
  findUnresolvedCopyCandidates, resolveCopyPreference, copyUserPredictionsToLinkedPools,
  type CopyCandidate,
} from '@/lib/publicPoolSync'

interface Fixture {
  id: number
  date: string
  home_team: string
  away_team: string
  venue: string
  city: string
  status: string
  home_score: number | null
  away_score: number | null
  round: string
  first_scorer_name: string | null
  odds_home: number | null
  odds_draw: number | null
  odds_away: number | null
  line_total_goals: number | null
  line_total_corners: number | null
  line_card_points: number | null
  line_asian_handicap_home: number | null
  line_asian_handicap_away: number | null
  live_home_corners: number | null
  live_away_corners: number | null
  live_home_cards: number | null
  live_away_cards: number | null
  ht_home_score: number | null
  ht_away_score: number | null
  ht_home_corners: number | null
  ht_away_corners: number | null
  first_yellow_team: string | null
  first_team_score: string | null
  ht_home_card_pts: number | null
  ht_away_card_pts: number | null
  line_total_rounds: number | null
  home_logo: string | null
  away_logo: string | null
  penalty_winner: string | null
}

// One row per category per fixture in predictions_v2
interface PredV2 {
  id?: string
  pool_id: string
  user_id: string
  fixture_id: number | null
  category_id: string
  value_wld: string | null
  value_number: number | null
  value_text: string | null
  value_ou: string | null
  value_yesno: boolean | null
  points_earned: number | null
  is_correct: boolean | null
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
  input_type: string
  name: string
  requires_line: boolean
  prediction_type: string  // 'per_game' | 'per_round'
}

const FLAG_CODES: Record<string, string> = {
  'Mexico': 'mx', 'South Africa': 'za', 'South Korea': 'kr', 'Czechia': 'cz',
  'Canada': 'ca', 'Bosnia and Herzegovina': 'ba', 'Bosnia & Herzegovina': 'ba', 'Qatar': 'qa', 'Switzerland': 'ch',
  'USA': 'us', 'Paraguay': 'py', 'Haiti': 'ht', 'Scotland': 'gb-sct',
  'Australia': 'au', 'Türkiye': 'tr', 'Brazil': 'br', 'Morocco': 'ma',
  'Germany': 'de', 'Curaçao': 'cw', 'Netherlands': 'nl', 'Japan': 'jp',
  'Sweden': 'se', 'Tunisia': 'tn', 'Saudi Arabia': 'sa', 'Uruguay': 'uy',
  'Spain': 'es', 'Cabo Verde': 'cv', 'Cape Verde Islands': 'cv', 'Iran': 'ir', 'New Zealand': 'nz',
  'Belgium': 'be', 'Egypt': 'eg', 'France': 'fr', 'Senegal': 'sn',
  'Iraq': 'iq', 'Norway': 'no', 'Argentina': 'ar', 'Algeria': 'dz',
  'Austria': 'at', 'Jordan': 'jo', 'Ghana': 'gh', 'Panama': 'pa',
  'England': 'gb-eng', 'Croatia': 'hr', 'Portugal': 'pt', 'Congo DR': 'cd',
  'Uzbekistan': 'uz', 'Colombia': 'co', 'Denmark': 'dk', 'Serbia': 'rs',
  'Poland': 'pl', 'Chile': 'cl', 'Venezuela': 've', 'Nigeria': 'ng',
  'Ivory Coast': 'ci', 'Ecuador': 'ec', 'Peru': 'pe', 'Costa Rica': 'cr',
  'Jamaica': 'jm', 'Honduras': 'hn', 'Cape Verde': 'cv',
}

function Flag({ team, size = 16 }: { team: string; size?: number }) {
  const code = FLAG_CODES[team]
  if (!code) return null
  return <img src={`https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${code}.png`} width={size} height={Math.round(size * 0.75)} alt={team} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
}

// Keep FLAGS for backward compat in bracket components
const FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czechia': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Australia': '🇦🇺', 'Türkiye': '🇹🇷', 'Brazil': '🇧🇷', 'Morocco': '🇲🇦',
  'Germany': '🇩🇪', 'Curaçao': '🇨🇼', 'Netherlands': '🇳🇱', 'Japan': '🇯🇵',
  'Sweden': '🇸🇪', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'France': '🇫🇷', 'Senegal': '🇸🇳',
  'Iraq': '🇮🇶', 'Norway': '🇳🇴', 'Argentina': '🇦🇷', 'Algeria': '🇩🇿',
  'Austria': '🇦🇹', 'Jordan': '🇯🇴', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Portugal': '🇵🇹', 'Congo DR': '🇨🇩',
  'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸',
  'Poland': '🇵🇱', 'Chile': '🇨🇱', 'Venezuela': '🇻🇪', 'Nigeria': '🇳🇬',
  'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨', 'Peru': '🇵🇪', 'Costa Rica': '🇨🇷',
  'Jamaica': '🇯🇲', 'Honduras': '🇭🇳',
}

const KNOCKOUT_ROUNDS = new Set(['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'])
function isKnockoutRound(round: string) { return KNOCKOUT_ROUNDS.has(round) }

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'America/Los_Angeles'

function formatPT(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ,
    hour: 'numeric', minute: '2-digit',
  })
}

function formatLockTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: USER_TZ,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatDatePT(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: USER_TZ,
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: USER_TZ,
    month: 'short', day: 'numeric',
  })
}

// Keyed as `${fixtureId}:${categoryId}` → PredV2
type PredMap = Record<string, PredV2>

// For exact score we store home/away separately in local state
// key: `${fixtureId}:${categoryId}:home` / `:away`
type ScoreInputMap = Record<string, string>

// PlayerSearch component — outside FixturesList to avoid remount
const POSITION_ORDER = ['Attacker', 'Midfielder', 'Defender', 'Goalkeeper']

function PlayerDropdown({ value, onChange, disabled, homeTeam, awayTeam }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  homeTeam: string
  awayTeam: string
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!openTeam) return
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenTeam(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [openTeam])

  function normalizeTeam(team: string) {
    if (team === 'Bosnia & Herzegovina') return 'Bosnia and Herzegovina'
    if (team === 'Cape Verde Islands') return 'Cape Verde'
    return team
  }

  function getPlayers(team: string) {
    return (WC_SQUADS[normalizeTeam(team)] || [])
      .slice()
      .sort((a, b) => {
        const ai = POSITION_ORDER.indexOf(a.position)
        const bi = POSITION_ORDER.indexOf(b.position)
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return a.name.localeCompare(b.name)
      })
  }

  function select(v: string) {
    onChange(v)
    // Keep dropdown open — highlight only, close on click outside
  }

  function toggle(team: string) {
    setOpenTeam(prev => prev === team ? null : team)
  }

  return (
    <div ref={containerRef} style={{ fontSize: '13px' }}>
      {/* Current selection */}
      {value && (
        <div style={{ padding: '6px 10px', background: '#fff5f5', border: '1px solid #f0d0d0', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#C8102E', fontWeight: 600 }}>{value}</span>
          {!disabled && (
            <button type="button" onMouseDown={e => { e.preventDefault(); onChange('') }}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>×</button>
          )}
        </div>
      )}
      {/* Team buttons */}
      {!disabled && (
        <div style={{ display: 'flex', gap: 6 }}>
          {[homeTeam, awayTeam].map(team => (
            <div key={team} style={{ flex: 1 }}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); toggle(team) }}
                style={{
                  width: '100%', padding: '8px 6px', border: '1px solid',
                  borderColor: openTeam === team ? '#C8102E' : '#ddd',
                  background: openTeam === team ? '#C8102E' : 'white',
                  color: openTeam === team ? 'white' : '#333',
                  fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                  cursor: 'pointer', textAlign: 'center' as const,
                  whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {team} {openTeam === team ? '▲' : '▼'}
              </button>
              {openTeam === team && (
                <div
                  onMouseDown={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}
                  style={{ border: '1px solid #eee', borderTop: 'none', maxHeight: 220, overflowY: 'auto' as const }}>
                  <button type="button" onMouseDown={e => { e.preventDefault(); select(`Own Goal (${team})`) }}
                    style={{
                      width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f5f5f5',
                      background: value === `Own Goal (${team})` ? '#fff5f5' : '#fafafa',
                      color: value === `Own Goal (${team})` ? '#C8102E' : '#888',
                      fontWeight: 700, fontSize: '12px', fontFamily: 'inherit',
                      textAlign: 'left' as const, cursor: 'pointer', minHeight: 40,
                    }}>
                    Own Goal
                  </button>
                  {getPlayers(team).map(p => (
                    <button key={p.name} type="button" onMouseDown={e => { e.preventDefault(); select(p.name) }}
                      style={{
                        width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f5f5f5',
                        background: value === p.name ? '#fff5f5' : 'white',
                        color: value === p.name ? '#C8102E' : '#111',
                        fontWeight: value === p.name ? 700 : 400,
                        fontSize: '13px', fontFamily: 'inherit',
                        textAlign: 'left' as const, cursor: 'pointer', minHeight: 40,
                      }}>
                      {p.name} <span style={{ color: '#aaa', fontSize: '11px' }}>({p.position})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// CategoryInput is defined outside FixturesList to prevent remounting on parent re-renders
// (which would close PlayerDropdown's open state). All closure vars are passed as props.
function CategoryInput({ fixture, rule, pred, locked, finished, updateLocal, scoreInputs, setScoreInputs, predsRef, poolRules, isPL }: {
fixture: Fixture
rule: PoolRule
pred: PredV2 | undefined
locked: boolean
finished: boolean
updateLocal: (fixtureId: number, categoryId: string, fields: any) => void
scoreInputs: Record<string, string>
setScoreInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
predsRef: React.MutableRefObject<Record<string, PredV2>>
poolRules: PoolRule[]
isPL?: boolean
}) {
  const key = `${fixture.id}:${rule.category_id}`
  // pred passed as prop
  // locked passed as prop
  // finished passed as prop
  const isExact = rule.input_type === 'exact'

  const btnStyle = (val: string | boolean | number): React.CSSProperties => {
    const active = pred?.value_wld === val || pred?.value_ou === val || pred?.value_text === val || pred?.value_yesno === val || pred?.value_number === val
    return {
      flex: 1, padding: '8px 4px', fontSize: '12px', border: '1px solid',
      cursor: locked || finished ? 'default' : 'pointer',
      fontFamily: 'inherit', minHeight: 44,
      borderColor: active ? '#C8102E' : '#ddd',
      background: active ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
      color: active ? 'white' : '#555',
      opacity: locked && !active ? 0.6 : 1,
    }
  }

  // Points feedback
  const feedback = finished && pred?.points_earned !== null && pred?.points_earned !== undefined ? (
    <span style={{ fontSize: '10px', color: pred.points_earned > 0 ? '#2d7a2d' : '#aaa', marginLeft: 6 }}>
      {pred.points_earned > 0 ? `+${pred.points_earned} pts` : '✗'}
    </span>
  ) : null

  // ── MMA categories ──────────────────────────────────────────────────────
  if (rule.category_id.startsWith('mma_')) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{rule.name}</span>
          {feedback}
        </div>

        {/* Fight result — home fighter vs away fighter, no draw */}
        {rule.category_id === 'mma_result' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block', fontSize: '11px' }}>{fixture.home_team}</span>
            </button>
            <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block', fontSize: '11px' }}>{fixture.away_team}</span>
            </button>
          </div>
        )}

        {/* Method of victory */}
        {rule.category_id === 'mma_method' && (
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' as const }}>
            {['KO/TKO', 'Submission', 'Decision', 'DQ'].map((method, i, arr) => (
              <button type="button" key={method}
                style={{ ...btnStyle(method), ...(i < arr.length - 1 ? { borderRight: 'none' } : {}), flex: '1 1 auto', minWidth: 60 }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: method })}>
                {method}
              </button>
            ))}
          </div>
        )}

        {/* Yes/No categories */}
        {(rule.category_id === 'mma_goes_distance' || rule.category_id === 'mma_finish_rd1') && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button type="button" style={{ ...btnStyle(true), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: true })}>
              Yes
            </button>
            <button type="button" style={{ ...btnStyle(false) }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: false })}>
              No
            </button>
          </div>
        )}

        {/* Total rounds O/U */}
        {rule.category_id === 'mma_total_rounds_ou' && (
          <div style={{ display: 'flex', gap: 0 }}>
            <button type="button" style={{ ...btnStyle('over'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'over' })}>
              over {fixture.line_total_rounds ?? '2.5'}
            </button>
            <button type="button" style={{ ...btnStyle('under') }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'under' })}>
              under {fixture.line_total_rounds ?? '2.5'}
            </button>
          </div>
        )}

        {/* Round finished */}
        {rule.category_id === 'mma_round_finish' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
            {[1, 2, 3, 4, 5].map(round => (
              <button type="button" key={round}
                style={{ ...btnStyle(round), flex: '0 0 44px' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_number: round })}>
                R{round}
              </button>
            ))}
            <button type="button"
              style={{ ...btnStyle('Decision'), flex: '1 1 auto' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: 'Decision', value_number: null })}>
              Decision
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Soccer categories ────────────────────────────────────────────────────
  // Hide soccer_result in knockout rounds and soccer_team_to_advance in group stage
  const isKnockout = isKnockoutRound(fixture.round)
  if (rule.category_id === 'soccer_result' && isKnockout) return null
  if (rule.category_id === 'soccer_team_to_advance' && !isKnockout) return null

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: '10px', color: '#888', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>
          {rule.category_id === 'soccer_exact_score' && isKnockoutRound(fixture.round)
            ? 'Score at the end of regulation/extra time'
            : rule.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {rule.requires_line && !finished && (() => {
            let line: number | null = null
            if (rule.category_id === 'soccer_total_goals_ou') line = fixture.line_total_goals
            else if (rule.category_id === 'soccer_total_corners_ou') line = fixture.line_total_corners
            else if (rule.category_id === 'soccer_card_points_ou') line = fixture.line_card_points
            else if (rule.category_id === 'soccer_asian_handicap') line = fixture.line_asian_handicap_home
            if (line != null) return null // line shown inline on buttons
            return <span style={{ fontSize: '9px', color: '#bbb', fontStyle: 'italic' }}>line TBD 24h before</span>
          })()}
          {feedback}
        </div>
      </div>

      {/* WLD — soccer_result for group stage, soccer_team_to_advance for knockouts */}
      {rule.input_type === 'wld' &&
        rule.category_id !== 'soccer_first_team_score' &&
        rule.category_id !== 'soccer_first_yellow_team' &&
        rule.category_id !== 'soccer_asian_handicap' && (
        (() => {
          const isKnockout = isKnockoutRound(fixture.round)
          // Hide soccer_result in knockout rounds (replaced by soccer_team_to_advance)
          if (rule.category_id === 'soccer_result' && isKnockout) return null
          // Hide soccer_team_to_advance in group stage
          if (rule.category_id === 'soccer_team_to_advance' && !isKnockout) return null
          // No draw for team_to_advance
          const noDrawCategories = ['soccer_team_to_advance']
          const showDraw = !noDrawCategories.includes(rule.category_id)
          return (
            <div style={{ display: 'flex', gap: 0 }}>
              <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {isPL && fixture.home_logo
                    ? <img src={fixture.home_logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                    : <Flag team={fixture.home_team} />
                  } {fixture.home_team}
                </span>
              </button>
              {showDraw && (
                <button type="button" style={{ ...btnStyle('draw'), borderRight: 'none', flexShrink: 0, flex: '0 0 60px' }}
                  disabled={locked || finished}
                  onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'draw' })}>
                  draw
                </button>
              )}
              <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {isPL && fixture.away_logo
                    ? <img src={fixture.away_logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                    : <Flag team={fixture.away_team} />
                  } {fixture.away_team}
                </span>
              </button>
            </div>
          )
        })()
      )}

      {/* Asian handicap — separate since it needs line display */}
      {rule.category_id === 'soccer_asian_handicap' && (
        <div style={{ display: 'flex', gap: 0 }}>
          <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isPL && fixture.home_logo
                ? <img src={fixture.home_logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                : <Flag team={fixture.home_team} />
              } {fixture.home_team}
              {fixture.line_asian_handicap_home != null && (
                <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 3 }}>
                  ({fixture.line_asian_handicap_home > 0 ? '+' : ''}{fixture.line_asian_handicap_home})
                </span>
              )}
            </span>
          </button>
          <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isPL && fixture.away_logo
                ? <img src={fixture.away_logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                : <Flag team={fixture.away_team} />
              } {fixture.away_team}
              {fixture.line_asian_handicap_away != null && (
                <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 3 }}>
                  ({fixture.line_asian_handicap_away > 0 ? '+' : ''}{fixture.line_asian_handicap_away})
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* First team to score */}
      {rule.category_id === 'soccer_first_team_score' && (
        <div style={{ display: 'flex', gap: 0 }}>
          <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {isPL && fixture.home_logo ? <img src={fixture.home_logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Flag team={fixture.home_team} />} {fixture.home_team}
            </span>
          </button>
          <button type="button" style={{ ...btnStyle('none' as any), borderRight: 'none', flexShrink: 0, flex: '0 0 70px' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
            no goal
          </button>
          <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {isPL && fixture.away_logo ? <img src={fixture.away_logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Flag team={fixture.away_team} />} {fixture.away_team}
            </span>
          </button>
        </div>
      )}

      {/* First yellow card */}
      {rule.category_id === 'soccer_first_yellow_team' && (
        <div style={{ display: 'flex', gap: 0 }}>
          <button type="button" style={{ ...btnStyle('home'), borderRight: 'none', overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'home' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {isPL && fixture.home_logo ? <img src={fixture.home_logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Flag team={fixture.home_team} />} {fixture.home_team}
            </span>
          </button>
          <button type="button" style={{ ...btnStyle('none' as any), borderRight: 'none', flexShrink: 0, flex: '0 0 70px' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'none' })}>
            no card
          </button>
          <button type="button" style={{ ...btnStyle('away'), overflow: 'hidden' }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_wld: 'away' })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {isPL && fixture.away_logo ? <img src={fixture.away_logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Flag team={fixture.away_team} />} {fixture.away_team}
            </span>
          </button>
        </div>
      )}

      {/* Over / Under */}
      {rule.input_type === 'ou' && (() => {
        // Pick the right line based on category
        let line: number | null = null
        if (rule.category_id === 'soccer_total_goals_ou') line = fixture.line_total_goals
        else if (rule.category_id === 'soccer_total_corners_ou') line = fixture.line_total_corners
        else if (rule.category_id === 'soccer_card_points_ou') line = fixture.line_card_points
        const lineLabel = line != null ? line.toString() : '—'
        return (
          <div style={{ display: 'flex', gap: 0 }}>
            <button type="button" style={{ ...btnStyle('over'), borderRight: 'none' }}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'over' })}>
              over {lineLabel}
            </button>
            <button type="button" style={btnStyle('under')}
              disabled={locked || finished}
              onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_ou: 'under' })}>
              under {lineLabel}
            </button>
          </div>
        )
      })()}

      {/* Exact score — stepper buttons instead of number inputs to avoid mobile keyboard scroll */}
      {isExact && (() => {
        const homeKey = `${fixture.id}:${rule.category_id}:home`
        const awayKey = `${fixture.id}:${rule.category_id}:away`
        const homeNum = scoreInputs[homeKey] !== undefined ? parseInt(scoreInputs[homeKey]) : null
        const awayNum = scoreInputs[awayKey] !== undefined ? parseInt(scoreInputs[awayKey]) : null

        function adjust(side: 'home' | 'away', delta: number) {
          if (locked || finished) return
          const scrollY = window.scrollY
          const key = side === 'home' ? homeKey : awayKey
          const current = side === 'home' ? homeNum : awayNum
          const next = Math.max(0, Math.min(15, (current ?? 0) + delta))
          setScoreInputs(prev => {
            const newInputs = { ...prev, [key]: String(next) }
            const h = side === 'home' ? next : (homeNum ?? null)
            const a = side === 'away' ? next : (awayNum ?? null)
            if (h !== null && a !== null) {
              updateLocal(fixture.id, rule.category_id, { value_text: `${h}-${a}` })
              // Auto-derive related predictions from the score
              // Only set if user hasn't already made a pick for that category
              const existingPreds = predsRef.current
              // Match result
              const resultKey = `${fixture.id}:soccer_result`
              const advanceKey = `${fixture.id}:soccer_team_to_advance`
              const resultWld = h > a ? 'home' : a > h ? 'away' : 'draw'
              if (!existingPreds[resultKey]?.value_wld) {
                updateLocal(fixture.id, 'soccer_result', { value_wld: resultWld })
              }
              // Team to advance — only for knockout rounds
              if (!existingPreds[advanceKey]?.value_wld && (h !== a) && isKnockoutRound(fixture.round)) {
                updateLocal(fixture.id, 'soccer_team_to_advance', { value_wld: h > a ? 'home' : 'away' })
              }
              // BTTS
              const bttsKey = `${fixture.id}:soccer_btts`
              if (!existingPreds[bttsKey]?.value_yesno !== undefined) {
                updateLocal(fixture.id, 'soccer_btts', { value_yesno: h > 0 && a > 0 })
              }
              // First team to score — only derivable when one team has 0 goals
              const firstTeamKey = `${fixture.id}:soccer_first_team_score`
              if (!existingPreds[firstTeamKey]?.value_wld && h !== a) {
                if (a === 0) updateLocal(fixture.id, 'soccer_first_team_score', { value_wld: 'home' })
                else if (h === 0) updateLocal(fixture.id, 'soccer_first_team_score', { value_wld: 'away' })
              }
              const totalGoals = h + a
              const goalsKey = `${fixture.id}:soccer_total_goals_ou`
              const line = fixture.line_total_goals
              if (line !== null && !existingPreds[goalsKey]?.value_ou) {
                updateLocal(fixture.id, 'soccer_total_goals_ou', { value_ou: totalGoals > line ? 'over' : 'under' })
              }
            }
            return newInputs
          })
          requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
        }

        const stepBtn = (disabled: boolean) => ({
          width: 32, height: 36, border: '1px solid #ddd',
          background: disabled ? '#fafafa' : 'white',
          fontSize: '20px', lineHeight: '1', cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit', color: disabled ? '#ccc' : '#333',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' as const,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        })

        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button type="button" onClick={() => adjust('home', -1)} disabled={locked || finished || homeNum === 0} style={stepBtn(locked || finished || homeNum === 0)}>−</button>
              <span style={{ width: 36, textAlign: 'center', fontSize: '18px', fontWeight: 600, color: homeNum !== null ? '#111' : '#ccc' }}>{homeNum !== null ? homeNum : '?'}</span>
              <button type="button" onClick={() => adjust('home', 1)} disabled={locked || finished} style={stepBtn(locked || finished)}>+</button>
            </div>
            <span style={{ color: '#aaa' }}>–</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button type="button" onClick={() => adjust('away', -1)} disabled={locked || finished || awayNum === 0} style={stepBtn(locked || finished || awayNum === 0)}>−</button>
              <span style={{ width: 36, textAlign: 'center', fontSize: '18px', fontWeight: 600, color: awayNum !== null ? '#111' : '#ccc' }}>{awayNum !== null ? awayNum : '?'}</span>
              <button type="button" onClick={() => adjust('away', 1)} disabled={locked || finished} style={stepBtn(locked || finished)}>+</button>
            </div>
            {finished && fixture.home_score !== null && (
              <span style={{ fontSize: '10px', color: '#aaa', marginLeft: 4 }}>
                actual: {fixture.home_score}–{fixture.away_score}
              </span>
            )}
          </div>
        )
      })()}

      {/* Yes / No */}
      {rule.input_type === 'yesno' && (
        <div style={{ display: 'flex', gap: 0 }}>
          <button type="button"
            style={{ ...btnStyle(true), borderRight: 'none',
              borderColor: pred?.value_yesno === true ? '#C8102E' : '#ddd',
              background: pred?.value_yesno === true ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
              color: pred?.value_yesno === true ? 'white' : '#555',
            }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: true })}>
            yes
          </button>
          <button type="button"
            style={{ ...btnStyle(false),
              borderColor: pred?.value_yesno === false ? '#C8102E' : '#ddd',
              background: pred?.value_yesno === false ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
              color: pred?.value_yesno === false ? 'white' : '#555',
            }}
            disabled={locked || finished}
            onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_yesno: false })}>
            no
          </button>
        </div>
      )}

      {/* Player dropdown */}
      {rule.input_type === 'player' && (
        <>
          {(rule.category_id === 'soccer_first_goalscorer' || rule.category_id === 'soccer_anytime_goalscorer') && (
            <div style={{ marginBottom: 4 }}>
              <button type="button"
                disabled={locked || finished}
                onClick={() => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: '', value_wld: pred?.value_wld === 'none' ? null : 'none' })}
                style={{
                  width: '100%', padding: '7px', border: '1px solid',
                  borderColor: pred?.value_wld === 'none' ? '#C8102E' : '#ddd',
                  background: pred?.value_wld === 'none' ? '#C8102E' : locked || finished ? '#fafafa' : 'white',
                  color: pred?.value_wld === 'none' ? 'white' : '#555',
                  fontSize: '12px', fontFamily: 'inherit', cursor: locked || finished ? 'default' : 'pointer',
                }}>
                no goal
              </button>
            </div>
          )}
          {pred?.value_wld !== 'none' && (
            <PlayerDropdown
              value={pred?.value_text || ''}
              disabled={locked || finished}
              homeTeam={fixture.home_team}
              awayTeam={fixture.away_team}
              onChange={v => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: v, value_wld: null })}
            />
          )}
        </>
      )}

      {/* Team text */}
      {rule.input_type === 'team' && (
        <input
          value={pred?.value_text || ''}
          placeholder="team name..."
          disabled={locked || finished}
          style={{ width: '100%', border: '1px solid #ddd', padding: '5px 8px', fontSize: '11px', fontFamily: 'inherit', background: locked || finished ? '#fafafa' : 'white', boxSizing: 'border-box' }}
          onChange={e => !locked && !finished && updateLocal(fixture.id, rule.category_id, { value_text: e.target.value })}
        />
      )}
    </div>
  )
}


// Build round-special picks (no fixture_id) + restored brace team per matchday from a set of predictions_v2 rows
function buildRoundSpecialState(preds: any[]) {
  const roundPicks: Record<string, Record<string, string>> = {}
  const braceTeams: Record<string, string> = {}
  preds.filter((p: any) => !p.fixture_id && p.matchday).forEach((p: any) => {
    if (!roundPicks[p.matchday]) roundPicks[p.matchday] = {}
    roundPicks[p.matchday][p.category_id] = p.value_text || p.value_wld || ''
    // Restore brace team from saved player name
    if (p.category_id === 'soccer_brace_round' && p.value_text) {
      for (const [team, players] of Object.entries(WC_SQUADS)) {
        if ((players as any[]).some((pl: any) => pl.name === p.value_text)) {
          braceTeams[p.matchday] = team
          break
        }
      }
    }
  })
  return { roundPicks, braceTeams }
}

export default function FixturesList({
  poolId, userId, packageId, deadlineType, tournamentId,
  hideControls, externalSortMode, externalViewMode, isAdmin,
  plGameMode, plBest5AdminOverride, previewMode, onPreviewInteract,
}: {
  poolId: string
  userId: string
  packageId: string
  deadlineType: string
  scope?: string
  tournamentId?: string
  hideControls?: boolean
  externalSortMode?: 'date' | 'group' | 'round'
  externalViewMode?: 'pages' | 'list'
  isAdmin?: boolean
  plGameMode?: string
  plBest5AdminOverride?: boolean
  // Signed-out visitor browsing a pool before creating an account: renders the real
  // fixtures UI (so it looks and feels identical to the real thing) but any attempt to
  // actually make a pick calls onPreviewInteract instead of saving anything.
  previewMode?: boolean
  onPreviewInteract?: () => void
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<PredMap>({})
  const [memberPreds, setMemberPreds] = useState<PredMap>({})
  const [memberRoundPreds, setMemberRoundPreds] = useState<Record<string, Record<string, Record<string, string>>>>({}) // matchday → memberId → categoryId → value
  const [members, setMembers] = useState<Record<string, string>>({})
  const [scoreInputs, setScoreInputs] = useState<ScoreInputMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [saveErrors, setSaveErrors] = useState<Record<number, string | null>>({})
  const [copyCandidates, setCopyCandidates] = useState<CopyCandidate[]>([])
  const [resolvingCopyId, setResolvingCopyId] = useState<string | null>(null)
  // Pools this user has already opted into copying with (task #7) that score at least
  // one category this pool doesn't — rendered as extra inline inputs per fixture so
  // those picks can be made without leaving this pool's view.
  const [linkedPools, setLinkedPools] = useState<{ poolId: string; poolName: string; rules: PoolRule[] }[]>([])
  const [linkedPreds, setLinkedPreds] = useState<Record<string, PredMap>>({})
  const [linkedSaving, setLinkedSaving] = useState<Record<string, boolean>>({})
  const [linkedSaveErrors, setLinkedSaveErrors] = useState<Record<string, string | null>>({})
  const linkedPredsRef = useRef<Record<string, PredMap>>({})
  const linkedSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const autoSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const roundSpecialTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [roundSpecialPicks, setRoundSpecialPicks] = useState<Record<string, Record<string, string>>>({})
  const [roundFacts, setRoundFacts] = useState<Record<string, any>>({}) // matchday → facts
  const [showMemberPicksMap, setShowMemberPicksMap] = useState<Record<number, boolean>>({})
  const [revealedOddsIds, setRevealedOddsIds] = useState<Set<number>>(new Set())
  const [roundSpecialSaving, setRoundSpecialSaving] = useState<string | null>(null)
  const [roundSpecialError, setRoundSpecialError] = useState<string | null>(null)
  const [roundSpecialSaved, setRoundSpecialSaved] = useState<Record<string, boolean>>({})
  const [braceTeamByMatchday, setBraceTeamByMatchday] = useState<Record<string, string>>({})
  const [ghostEntries, setGhostEntries] = useState<{ id: string; name: string }[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string>(userId)
  const [newGhostName, setNewGhostName] = useState('')
  const [addingGhost, setAddingGhost] = useState(false)
  const [_sortMode, setSortMode] = useState<'date' | 'group' | 'round'>('group')
  const [_viewMode, setViewMode] = useState<'pages' | 'list'>('pages')
  const sortMode = externalSortMode ?? _sortMode
  const viewMode = externalViewMode ?? _viewMode
  const [currentPage, setCurrentPage] = useState(0)
  const [best5Selections, setBest5Selections] = useState<Record<string, number[]>>({})

  const isCustom = packageId?.toUpperCase() === 'CUSTOM'
  const isMMA = tournamentId?.startsWith('ufc_') || tournamentId?.includes('mma')
  const isPL = tournamentId?.startsWith('pl_')
  const isBest5Active = isPL && plGameMode === 'best5'
  const hasPerGame = poolRules.some(r => r.prediction_type === 'per_game')
  const hasPerRound = poolRules.some(r => r.prediction_type === 'per_round')
  const onlyRoundSpecials = isCustom && hasPerRound && !hasPerGame

  // Auto-switch to round view if only round specials
  useEffect(() => {
    if (onlyRoundSpecials) { setSortMode('round'); setCurrentPage(0) }
  }, [onlyRoundSpecials])

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Fixtures
      const res = await fetch(`/api/fixtures?tournament_id=${tournamentId || 'wc_2026'}`)
      const data = await res.json()
      setFixtures(data.fixtures || [])

      // best5 pools: fetch whatever's already selected, then compute-and-store any round
      // that hasn't been picked yet (only happens once per round, ever — after that it's
      // a single cheap select). Awaited before pages get built below so nothing flashes
      // the full unfiltered fixture list first.
      if (isPL && plGameMode === 'best5' && data.fixtures?.length > 0) {
        const { data: existingRows } = await supabase
          .from('pool_matchweek_selections')
          .select('round, fixture_id')
          .eq('pool_id', poolId)
        const selMap: Record<string, number[]> = {}
        for (const r of existingRows || []) {
          (selMap[r.round] ??= []).push(r.fixture_id)
        }
        const rounds = [...new Set((data.fixtures as any[]).map(f => f.round))]
        const missingRounds = rounds.filter(r => !selMap[r])
        if (missingRounds.length > 0) {
          const computed = await Promise.all(missingRounds.map(round =>
            fetch('/api/pl/best5-select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ poolId, round }),
            }).then(r => r.json()).then(j => ({ round, fixtureIds: j.fixtureIds || [] }))
          ))
          for (const { round, fixtureIds } of computed) selMap[round] = fixtureIds
        }
        setBest5Selections(selMap)
      }

      // Set initial page to next upcoming or live fixture (in PT timezone)
      if (data.fixtures?.length > 0) {
        const now = new Date()
        // Find the next fixture that is live or upcoming
        const upcoming = (data.fixtures as any[])
          .filter((f: any) => f.status === 'live' || f.status === 'NS' || !f.status)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        const nextFixture = upcoming[0]
        if (nextFixture) {
          // Get the PT date of the next fixture
          const ptDateStr = new Date(nextFixture.date).toLocaleDateString('en-US', {
            timeZone: USER_TZ,
            year: 'numeric', month: '2-digit', day: '2-digit'
          })
          // Convert MM/DD/YYYY → YYYY-MM-DD
          const [m, d, y] = ptDateStr.split('/')
          const targetIso = `${y}-${m}-${d}`
          // Find which page has this date
          const sorted = [...(data.fixtures as any[])].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          const dateMap: Record<string, boolean> = {}
          sorted.forEach((f: any) => {
            const ptD = new Date(f.date).toLocaleDateString('en-US', { timeZone: USER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
            const [fm, fd, fy] = ptD.split('/')
            dateMap[`${fy}-${fm}-${fd}`] = true
          })
          const dates = Object.keys(dateMap).sort()
          const pageIndex = dates.indexOf(targetIso)
          if (pageIndex >= 0) setCurrentPage(pageIndex)
        }
      }

      if (isCustom) {
        // Load pool_rules joined with ruleset_categories for input_type etc.
        const { data: rules } = await supabase
          .from('pool_rules')
          .select('category_id, points, bonus_points, ruleset_categories(name, input_type, requires_line, prediction_type)')
          .eq('pool_id', poolId)

        const mapped: PoolRule[] = (rules || []).map((r: any) => ({
          category_id: r.category_id,
          points: r.points,
          bonus_points: r.bonus_points ?? 0,
          name: r.ruleset_categories?.name ?? r.category_id,
          input_type: r.ruleset_categories?.input_type ?? 'wld',
          requires_line: r.ruleset_categories?.requires_line ?? false,
          prediction_type: r.ruleset_categories?.prediction_type ?? 'per_game',
        }))
        setPoolRules(mapped)

        const perGameCats = mapped.filter(r => r.prediction_type === 'per_game').map(r => r.category_id)
        findUnresolvedCopyCandidates(supabase, userId, poolId, tournamentId, perGameCats)
          .then(setCopyCandidates)
          .catch(() => {})

        // Pools already linked (opted into copying with) that score categories this
        // pool doesn't — load their extra rules + this user's existing picks there so
        // those categories can be filled in inline, right on this fixture card.
        ;(async () => {
          const currentCatSet = new Set(mapped.map(r => r.category_id))
          const { data: linkPrefs } = await supabase
            .from('pool_pick_copy_prefs').select('to_pool_id').eq('user_id', userId).eq('from_pool_id', poolId).eq('enabled', true)
          const linkedPoolIds = (linkPrefs || []).map((p: any) => p.to_pool_id)
          if (linkedPoolIds.length === 0) { setLinkedPools([]); setLinkedPreds({}); return }

          const results: { poolId: string; poolName: string; rules: PoolRule[] }[] = []
          const predsByPool: Record<string, PredMap> = {}
          for (const linkedPoolId of linkedPoolIds) {
            const { data: linkedPool } = await supabase.from('pools').select('id, name').eq('id', linkedPoolId).maybeSingle()
            if (!linkedPool) continue
            const { data: linkedRules } = await supabase
              .from('pool_rules')
              .select('category_id, points, bonus_points, ruleset_categories(name, input_type, requires_line, prediction_type)')
              .eq('pool_id', linkedPoolId)
            const extraRules: PoolRule[] = (linkedRules || [])
              .filter((r: any) => !currentCatSet.has(r.category_id))
              .map((r: any) => ({
                category_id: r.category_id,
                points: r.points,
                bonus_points: r.bonus_points ?? 0,
                name: r.ruleset_categories?.name ?? r.category_id,
                input_type: r.ruleset_categories?.input_type ?? 'wld',
                requires_line: r.ruleset_categories?.requires_line ?? false,
                prediction_type: r.ruleset_categories?.prediction_type ?? 'per_game',
              }))
            if (extraRules.length === 0) continue
            results.push({ poolId: linkedPoolId, poolName: linkedPool.name, rules: extraRules })

            const { data: linkedPreds2 } = await supabase.from('predictions_v2').select('*').eq('pool_id', linkedPoolId).eq('user_id', userId)
            const predMap: PredMap = {}
            for (const p of linkedPreds2 || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
            predsByPool[linkedPoolId] = predMap
          }
          setLinkedPools(results)
          setLinkedPreds(predsByPool)
        })()

        // Load predictions_v2
        const { data: v2preds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', poolId)
          .eq('user_id', userId)

        const predMap: PredMap = {}
        const scoreMap: ScoreInputMap = {}
        ;(v2preds || []).forEach((p: PredV2) => {
          predMap[`${p.fixture_id}:${p.category_id}`] = p
          // Restore exact score inputs
          if (p.value_text?.includes('-')) {
            const [h, a] = p.value_text.split('-')
            scoreMap[`${p.fixture_id}:${p.category_id}:home`] = h
            scoreMap[`${p.fixture_id}:${p.category_id}:away`] = a
          }
        })
        setPreds(predMap)
        setScoreInputs(scoreMap)

        // Merge localStorage backup — push any missing predictions to DB
        try {
          const lsKey = `pool_preds_${poolId}_${userId}`
          const lsRaw = localStorage.getItem(lsKey)
          if (lsRaw) {
            const lsPreds: PredMap = JSON.parse(lsRaw)
            const rowsToUpsert: any[] = []
            Object.entries(lsPreds).forEach(([key, lsPred]) => {
              const dbPred = predMap[key]
              // If not in DB or DB has no value, use localStorage value
              const dbHasValue = dbPred && (dbPred.value_wld || dbPred.value_text || dbPred.value_ou || dbPred.value_yesno !== null)
              if (!dbHasValue && lsPred) {
                predMap[key] = lsPred
                rowsToUpsert.push({
                  pool_id: poolId,
                  user_id: userId,
                  fixture_id: lsPred.fixture_id,
                  category_id: lsPred.category_id,
                  value_wld: lsPred.value_wld ?? null,
                  value_text: lsPred.value_text ?? null,
                  value_ou: lsPred.value_ou ?? null,
                  value_yesno: lsPred.value_yesno ?? null,
                  value_number: lsPred.value_number ?? null,
                  submitted_at: new Date().toISOString(),
                })
              }
            })
            if (!previewMode && rowsToUpsert.length > 0) {
              await supabase.from('predictions_v2').upsert(rowsToUpsert, {
                onConflict: 'pool_id,user_id,fixture_id,category_id',
              })
            }
            setPreds({ ...predMap })
          }
        } catch {}

        // Load round special picks (no fixture_id)
        const { roundPicks, braceTeams } = buildRoundSpecialState(v2preds || [])
        setRoundSpecialPicks(roundPicks)
        setBraceTeamByMatchday(braceTeams)

        // Fetch all members' display names
        const { data: memberRows } = await supabase
          .from('pool_members')
          .select('user_id, display_name')
          .eq('pool_id', poolId)
        const memberMap: Record<string, string> = {}
        ;(memberRows || []).forEach((m: any) => { memberMap[m.user_id] = m.display_name })

        // Fetch ghost entries and merge into members
        const { data: ghosts } = await supabase
          .from('ghost_entries')
          .select('id, name')
          .eq('pool_id', poolId)
        ;(ghosts || []).forEach((g: any) => { memberMap[g.id] = g.name })
        setGhostEntries(ghosts || [])
        setMembers(memberMap)

        // Fetch all members' picks for locked/finished fixtures (everyone's picks, not just ours)
        const { data: allPreds } = await supabase
          .from('predictions_v2')
          .select('*')
          .eq('pool_id', poolId)
          .limit(10000)
        const allPredMap: PredMap = {}
        const roundPredMap: Record<string, Record<string, Record<string, string>>> = {}
        ;(allPreds || []).forEach((p: any) => {
          if (p.fixture_id) {
            allPredMap[`${p.user_id}:${String(p.fixture_id)}:${p.category_id}`] = p
          } else if (p.matchday) {
            if (!roundPredMap[p.matchday]) roundPredMap[p.matchday] = {}
            if (!roundPredMap[p.matchday][p.user_id]) roundPredMap[p.matchday][p.user_id] = {}
            roundPredMap[p.matchday][p.user_id][p.category_id] = p.value_text || ''
          }
        })
        setMemberPreds(allPredMap)
        setMemberRoundPreds(roundPredMap)

        // Load round facts for actual results display
        const { data: factsRows } = await supabase
          .from('round_facts')
          .select('*')
          .eq('tournament_id', tournamentId || 'wc_2026')
        const factsMap: Record<string, any> = {}
        ;(factsRows || []).forEach((f: any) => { factsMap[f.round_id] = f })
        setRoundFacts(factsMap)
      } else {
        // Legacy: load from predictions table
        const { data: legacyPreds } = await supabase
          .from('predictions')
          .select('*')
          .eq('pool_id', poolId)
          .eq('user_id', userId)

        // Shim into PredMap using synthetic category ids
        const predMap: PredMap = {}
        ;(legacyPreds || []).forEach((p: any) => {
          if (p.predicted_result) {
            predMap[`${p.fixture_id}:legacy_result`] = {
              pool_id: poolId, user_id: activeEntryId, fixture_id: p.fixture_id,
              category_id: 'legacy_result',
              value_wld: p.predicted_result, value_number: null, value_text: null,
              value_ou: null, value_yesno: null,
              points_earned: p.points_earned, is_correct: null,
            }
          }
        })
        setPreds(predMap)
      }

      setLoading(false)
    }
    load()
  }, [poolId, userId, isCustom])

  // Update local state and localStorage backup, DB write on save
  const LS_KEY = `pool_preds_${poolId}_${userId}`

  // Use a ref to always have fresh preds in saveFixture
  const predsRef = useRef(preds)
  useEffect(() => { predsRef.current = preds }, [preds])
  useEffect(() => { linkedPredsRef.current = linkedPreds }, [linkedPreds])

  // Use a ref for saveFixture so updateLocal always calls the latest version
  const saveFixtureRef = useRef<(fixtureId: number) => Promise<void>>(async () => {})
  const saveRoundSpecialsRef = useRef<(matchday: string) => Promise<void>>(async () => {})
  const saveLinkedFixtureRef = useRef<(linkedPoolId: string, fixtureId: number) => Promise<void>>(async () => {})

  async function switchEntry(entryId: string) {
    // Flush any pending debounced saves for the outgoing entry first, so a pick
    // made just before switching gets attributed to the right person instead of
    // racing the switch.
    const pendingFixtureIds = Object.keys(autoSaveTimers.current).map(Number)
    for (const fixtureId of pendingFixtureIds) {
      clearTimeout(autoSaveTimers.current[fixtureId])
      delete autoSaveTimers.current[fixtureId]
    }
    await Promise.all(pendingFixtureIds.map(fixtureId => saveFixtureRef.current(fixtureId)))

    const pendingMatchdays = Object.keys(roundSpecialTimers.current)
    for (const matchday of pendingMatchdays) {
      clearTimeout(roundSpecialTimers.current[matchday])
      delete roundSpecialTimers.current[matchday]
    }
    await Promise.all(pendingMatchdays.map(matchday => saveRoundSpecialsRef.current(matchday)))

    setActiveEntryId(entryId)
    const supabase = createClient()
    const { data } = await supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', entryId)
    const predMap: PredMap = {}
    for (const p of data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
    setPreds(predMap)

    // Round specials (fixture_id is null) are in the same result set — rebuild per-entry state
    const { roundPicks, braceTeams } = buildRoundSpecialState(data || [])
    setRoundSpecialPicks(roundPicks)
    setBraceTeamByMatchday(braceTeams)
  }

  async function answerCopyPrompt(candidate: CopyCandidate, enabled: boolean) {
    setResolvingCopyId(candidate.poolId)
    const supabase = createClient()
    await resolveCopyPreference(supabase, userId, poolId, candidate.poolId, enabled)
    setCopyCandidates(prev => prev.filter(c => c.poolId !== candidate.poolId))
    setResolvingCopyId(null)
  }

  async function addGhostEntry() {
    if (!newGhostName.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from('ghost_entries').insert({
      pool_id: poolId, name: newGhostName.trim(), created_by: userId
    }).select().single()
    if (data) {
      setGhostEntries(prev => [...prev, data])
      setMembers(prev => ({ ...prev, [data.id]: data.name }))
      await syncGhostToPublicPools(supabase, poolId, data)
      await switchEntry(data.id)
      setNewGhostName('')
      setAddingGhost(false)
    }
  }

  const updateLocal = useCallback((
    fixtureId: number,
    categoryId: string,
    fields: Partial<PredV2>,
  ) => {
    if (previewMode) { onPreviewInteract?.(); return }
    const key = `${fixtureId}:${categoryId}`
    // Save scroll position before state update — mobile browsers can scroll to top on re-render
    const scrollY = window.scrollY
    setPreds(prev => {
      const updated = {
        ...prev,
        [key]: {
          ...(prev[key] || { pool_id: poolId, user_id: activeEntryId, fixture_id: fixtureId, category_id: categoryId, points_earned: null, is_correct: null }),
          ...fields,
        } as PredV2,
      }
      // Persist to localStorage as backup
      try {
        const toStore: Record<string, any> = {}
        Object.entries(updated).forEach(([k, v]) => {
          if (v.value_wld || v.value_text || v.value_ou || v.value_yesno !== null || v.value_number !== null) {
            toStore[k] = v
          }
        })
        localStorage.setItem(LS_KEY, JSON.stringify(toStore))
      } catch {}
      return updated
    })
    // Restore scroll position after React re-renders
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' as any }))
    // Auto-save to DB after 800ms debounce
    if (autoSaveTimers.current[fixtureId]) clearTimeout(autoSaveTimers.current[fixtureId])
    autoSaveTimers.current[fixtureId] = setTimeout(() => {
      saveFixtureRef.current(fixtureId)
    }, 800)
  }, [poolId, userId, activeEntryId, LS_KEY, previewMode, onPreviewInteract])

  const saveFixture = useCallback(async (fixtureId: number) => {
    setSaving(fixtureId)
    const supabase = createClient()
    const currentPreds = predsRef.current
    const perGameRules = poolRules.filter(r => r.prediction_type === 'per_game')
    const rows = perGameRules.map(rule => {
      const key = `${fixtureId}:${rule.category_id}`
      const pred = currentPreds[key]
      return {
        pool_id: poolId,
        user_id: activeEntryId,
        fixture_id: fixtureId,
        category_id: rule.category_id,
        value_wld: pred?.value_wld ?? null,
        value_number: pred?.value_number ?? null,
        value_text: pred?.value_text ?? null,
        value_ou: pred?.value_ou ?? null,
        value_yesno: pred?.value_yesno ?? null,
        submitted_at: new Date().toISOString(),
      }
    }).filter(r =>
      r.value_wld || r.value_text || r.value_ou || r.value_yesno !== null || r.value_number !== null
    )

    if (rows.length > 0) {
      const { error } = await supabase.from('predictions_v2').upsert(rows, {
        onConflict: 'pool_id,user_id,fixture_id,category_id',
      })
      setSaveErrors(prev => ({ ...prev, [fixtureId]: error ? 'failed to save — try again' : null }))
      if (error) { setSaving(null); return }

      const isGhost = ghostEntries.some(g => g.id === activeEntryId)
      if (isGhost) await copyGhostPredictionsToMirrors(supabase, activeEntryId, rows)
      else if (activeEntryId === userId) await copyUserPredictionsToLinkedPools(supabase, userId, poolId, rows)
    }

    setSaving(null)
    setSaved(prev => ({ ...prev, [fixtureId]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [fixtureId]: false })), 3000)
  }, [poolId, userId, activeEntryId, poolRules, ghostEntries])

  // Keep saveFixtureRef in sync
  useEffect(() => { saveFixtureRef.current = saveFixture }, [saveFixture])

  // ── Inline picks for a linked pool's extra categories (task #8) — mirrors
  // updateLocal/saveFixture but targets a different pool_id than the one this
  // component is otherwise showing, so it's kept as its own small parallel path
  // rather than generalizing the main preds/saveFixture machinery. ──
  const updateLinkedLocal = useCallback((linkedPoolId: string, fixtureId: number, categoryId: string, fields: Partial<PredV2>) => {
    const key = `${fixtureId}:${categoryId}`
    setLinkedPreds(prev => {
      const poolMap = prev[linkedPoolId] || {}
      return {
        ...prev,
        [linkedPoolId]: {
          ...poolMap,
          [key]: {
            ...(poolMap[key] || { pool_id: linkedPoolId, user_id: userId, fixture_id: fixtureId, category_id: categoryId, points_earned: null, is_correct: null }),
            ...fields,
          } as PredV2,
        },
      }
    })
    const timerKey = `${linkedPoolId}:${fixtureId}`
    if (linkedSaveTimers.current[timerKey]) clearTimeout(linkedSaveTimers.current[timerKey])
    linkedSaveTimers.current[timerKey] = setTimeout(() => {
      saveLinkedFixtureRef.current(linkedPoolId, fixtureId)
    }, 800)
  }, [userId])

  const saveLinkedFixture = useCallback(async (linkedPoolId: string, fixtureId: number) => {
    const timerKey = `${linkedPoolId}:${fixtureId}`
    setLinkedSaving(prev => ({ ...prev, [timerKey]: true }))
    const supabase = createClient()
    const currentPreds = linkedPredsRef.current[linkedPoolId] || {}
    const rules = (linkedPools.find(l => l.poolId === linkedPoolId)?.rules || []).filter(r => r.prediction_type === 'per_game')
    const rows = rules.map(rule => {
      const key = `${fixtureId}:${rule.category_id}`
      const pred = currentPreds[key]
      return {
        pool_id: linkedPoolId,
        user_id: userId,
        fixture_id: fixtureId,
        category_id: rule.category_id,
        value_wld: pred?.value_wld ?? null,
        value_number: pred?.value_number ?? null,
        value_text: pred?.value_text ?? null,
        value_ou: pred?.value_ou ?? null,
        value_yesno: pred?.value_yesno ?? null,
        submitted_at: new Date().toISOString(),
      }
    }).filter(r => r.value_wld || r.value_text || r.value_ou || r.value_yesno !== null || r.value_number !== null)

    if (rows.length > 0) {
      const { error } = await supabase.from('predictions_v2').upsert(rows, { onConflict: 'pool_id,user_id,fixture_id,category_id' })
      setLinkedSaveErrors(prev => ({ ...prev, [timerKey]: error ? 'failed to save — try again' : null }))
    }
    setLinkedSaving(prev => ({ ...prev, [timerKey]: false }))
  }, [userId, linkedPools])

  useEffect(() => { saveLinkedFixtureRef.current = saveLinkedFixture }, [saveLinkedFixture])

  // Force-sync predictions to DB at kickoff time for each upcoming fixture.
  // Ensures picks in local state are flushed to DB even if the user hasn't
  // interacted with the page recently — prevents late submitted_at timestamps.
  useEffect(() => {
    if (!fixtures.length || deadlineType === 'before_tournament') return
    const now = Date.now()
    const timers: ReturnType<typeof setTimeout>[] = []
    fixtures.forEach(f => {
      const kickoff = new Date(f.date).getTime()
      const msUntilKickoff = kickoff - now
      if (msUntilKickoff > 0 && msUntilKickoff < 24 * 60 * 60 * 1000) {
        const timer = setTimeout(() => {
          saveFixtureRef.current(f.id)
        }, msUntilKickoff)
        timers.push(timer)
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [fixtures, deadlineType])

  function isLocked(f: Fixture) {
    if (deadlineType === 'before_tournament') return false
    if (deadlineType === 'before_weekend') {
      // Lock when the first game of this matchday starts
      const matchdayFixtures = fixtures.filter(x => x.round === f.round)
      const firstKickoff = Math.min(...matchdayFixtures.map(x => new Date(x.date).getTime()))
      return Date.now() >= firstKickoff
    }
    return new Date(f.date) <= new Date()
  }

  function matchdayLockTime(round: string): Date | null {
    const matchdayFixtures = fixtures.filter(x => x.round === round)
    if (!matchdayFixtures.length) return null
    return new Date(Math.min(...matchdayFixtures.map(x => new Date(x.date).getTime())))
  }

  function totalPointsForFixture(fixtureId: number): number | null {
    const keys = Object.keys(preds).filter(k => k.startsWith(`${fixtureId}:`))
    if (keys.length === 0) return null
    // Return null if no predictions have been scored yet
    if (keys.every(k => preds[k]?.points_earned === null)) return null
    return keys.reduce((sum, k) => sum + (preds[k]?.points_earned ?? 0), 0)
  }

  // Subscribe to realtime fixture updates
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('fixtures-live')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'fixtures',
        filter: `tournament_id=eq.${tournamentId || 'wc_2026'}`,
      }, (payload) => {
        const updated = payload.new as Fixture
        setFixtures(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tournamentId])
  const MATCHDAY_ROUNDS = [
    { id: 'round_1', label: 'Round 1', start: '2026-06-11', end: '2026-06-17' },
    { id: 'round_2', label: 'Round 2', start: '2026-06-18', end: '2026-06-23' },
    { id: 'round_3', label: 'Round 3', start: '2026-06-24', end: '2026-06-27' },
    { id: 'round_of_32', label: 'Round of 32', start: '2026-06-28', end: '2026-07-03' },
    { id: 'round_of_16', label: 'Round of 16', start: '2026-07-04', end: '2026-07-07' },
    { id: 'quarter_final', label: 'Quarter-finals', start: '2026-07-09', end: '2026-07-11' },
    { id: 'semi_final', label: 'Semi-finals', start: '2026-07-14', end: '2026-07-15' },
    { id: 'bronze_final', label: 'Bronze Final', start: '2026-07-18', end: '2026-07-18' },
    { id: 'final', label: 'Final', start: '2026-07-19', end: '2026-07-19' },
  ]
  function getRoundId(iso: string) {
    return MATCHDAY_ROUNDS.find(r => iso >= r.start && iso <= r.end)?.id ?? null
  }

  // ── Sorted + paged ──────────────────────────────────────────────────────
  // best5: fall back to showing everything for a round whose selection hasn't loaded yet
  // (shouldn't happen — load() awaits computing every round before this ever renders —
  // but never silently hide a whole matchweek if something's missing).
  const visibleFixtures = isBest5Active
    ? fixtures.filter(f => !best5Selections[f.round] || best5Selections[f.round].includes(f.id))
    : fixtures
  const sorted = [...visibleFixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const dateMap: Record<string, Fixture[]> = {}
  const dateIsoMap: Record<string, string> = {}
  const groupMap: Record<string, Fixture[]> = {}
  const roundMap: Record<string, Fixture[]> = {}
  sorted.forEach(f => {
    const day = formatDatePT(f.date)
    const iso = f.date.slice(0, 10)
    if (!dateMap[day]) { dateMap[day] = []; dateIsoMap[day] = iso }
    dateMap[day].push(f)
    if (!groupMap[f.round]) groupMap[f.round] = []
    groupMap[f.round].push(f)
    const rid = getRoundId(iso)
    if (rid) { if (!roundMap[rid]) roundMap[rid] = []; roundMap[rid].push(f) }
  })
  const pages = sortMode === 'date'
    ? Object.entries(dateMap).map(([label, fx]) => ({ label, isoDate: dateIsoMap[label], roundId: null as string | null, sub: `${fx.length} game${fx.length > 1 ? 's' : ''}`, fixtures: fx }))
    : sortMode === 'round'
    ? MATCHDAY_ROUNDS.filter(r => roundMap[r.id]?.length > 0).map(r => ({ label: r.label, isoDate: r.start, roundId: r.id, sub: `${roundMap[r.id]?.length ?? 0} games`, fixtures: roundMap[r.id] || [] }))
    : Object.entries(groupMap).map(([label, fx]) => {
        const dates = fx.map(f => new Date(f.date).getTime())
        const minDate = new Date(Math.min(...dates)).toISOString()
        const maxDate = new Date(Math.max(...dates)).toISOString()
        const sub = formatShortDate(minDate) === formatShortDate(maxDate)
          ? formatShortDate(minDate)
          : `${formatShortDate(minDate)} – ${formatShortDate(maxDate)}`
        return { label, isoDate: null as string | null, roundId: null as string | null, sub, fixtures: fx }
      })
  const totalPages = pages.length
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1))

  // ── Round specials save ────────────────────────────────────────────────────
  const saveRoundSpecials = useCallback(async (matchday: string) => {
    setRoundSpecialSaving(matchday)
    const supabase = createClient()
    const picks = roundSpecialPicks[matchday] || {}
    const rows = Object.entries(picks)
      .filter(([, value]) => value)
      .map(([categoryId, value]) => ({
        pool_id: poolId,
        user_id: activeEntryId,
        fixture_id: null,
        category_id: categoryId,
        matchday,
        value_text: value,
        submitted_at: new Date().toISOString(),
      }))
    if (rows.length > 0) {
      // fixture_id is always null here (round specials apply to a whole matchday, not
      // one fixture) — leaving it out of the conflict target since a plain unique index
      // on (pool_id,user_id,category_id,matchday) is what actually exists.
      const { error } = await supabase.from('predictions_v2').upsert(rows, {
        onConflict: 'pool_id,user_id,category_id,matchday',
      })
      setRoundSpecialError(error ? 'failed to save — try again' : null)
    }
    setRoundSpecialSaving(null)
    setRoundSpecialSaved(prev => ({ ...prev, [matchday]: true }))
    setTimeout(() => setRoundSpecialSaved(prev => ({ ...prev, [matchday]: false })), 3000)
  }, [poolId, activeEntryId, roundSpecialPicks])

  // Keep saveRoundSpecialsRef in sync
  useEffect(() => { saveRoundSpecialsRef.current = saveRoundSpecials }, [saveRoundSpecials])

  // ── Round Specials Card ────────────────────────────────────────────────────
  function RoundSpecialsCard({ matchday, locked }: { matchday: string; locked: boolean }) {
    const roundRules = poolRules.filter(r => r.prediction_type === 'per_round')
    if (roundRules.length === 0) return null
    const picks = roundSpecialPicks[matchday] || {}
    // Use lifted state to persist across re-renders
    const braceTeam2 = braceTeamByMatchday[matchday] || ''
    const setBraceTeam2 = (v: string) => setBraceTeamByMatchday(prev => ({ ...prev, [matchday]: v }))
    const allTeams = Object.keys(WC_SQUADS).sort()

    function updatePick(categoryId: string, value: string) {
      if (previewMode) { onPreviewInteract?.(); return }
      setRoundSpecialPicks(prev => ({ ...prev, [matchday]: { ...(prev[matchday] || {}), [categoryId]: value } }))
      // Auto-save after short delay — debounced + cancelable so switching entries can flush it first
      if (roundSpecialTimers.current[matchday]) clearTimeout(roundSpecialTimers.current[matchday])
      roundSpecialTimers.current[matchday] = setTimeout(() => {
        saveRoundSpecialsRef.current(matchday)
      }, 500)
    }

    return (
      <div style={{ background: 'white', border: '1px solid #e0e0db', borderLeft: '3px solid #111', marginBottom: 8 }}>
        <div style={{ background: '#f9f9f9', padding: '6px 10px', borderBottom: '1px solid #e0e0db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#555' }}>round specials</span>
          <span style={{ fontSize: '10px', color: '#aaa' }}>one pick per round</span>
        </div>
        <div style={{ padding: '10px' }}>
          {roundRules.map(rule => {
            const val = picks[rule.category_id] || ''
            const isBrace = rule.category_id === 'soccer_brace_round' || rule.input_type === 'player'
            return (
              <div key={rule.category_id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{rule.name}</span>
                  <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points !== 1 ? 's' : ''}</span>
                </div>
                {isBrace ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={braceTeam2} disabled={locked} onChange={e => setBraceTeam2(e.target.value)}
                      style={{ flex: 1, border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                      <option value="">select team...</option>
                      {allTeams.map(t => <option key={t} value={t}>{FLAGS[t] || ''} {t}</option>)}
                    </select>
                    <select value={val} disabled={locked || !braceTeam2} onChange={e => updatePick(rule.category_id, e.target.value)}
                      style={{ flex: 1, border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                      <option value="">select player...</option>
                      {(WC_SQUADS[braceTeam2] || []).map(p => <option key={p.name} value={p.name}>{p.name} ({p.position})</option>)}
                    </select>
                  </div>
                ) : (
                  <select value={val} disabled={locked} onChange={e => updatePick(rule.category_id, e.target.value)}
                    style={{ width: '100%', border: '1px solid #ddd', padding: '6px', fontSize: '12px', fontFamily: 'inherit', background: locked ? '#fafafa' : 'white' }}>
                    <option value="">select team...</option>
                    {allTeams.map(t => <option key={t} value={t}>{FLAGS[t] || ''} {t}</option>)}
                  </select>
                )}
              </div>
            )
          })}
          {!locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
              {roundSpecialSaving === matchday
                ? <span style={{ fontSize: '11px', color: '#aaa' }}>saving...</span>
                : roundSpecialError
                ? <span style={{ fontSize: '11px', color: '#C8102E' }}>✗ {roundSpecialError}</span>
                : <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ predictions are automatically saved</span>
              }
            </div>
          )}

          {/* Member picks when locked */}
          {locked && Object.keys(members).length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', marginBottom: 8 }}>everyone's picks</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600 }}></td>
                      {roundRules.map(rule => (
                        <td key={rule.category_id} style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>{rule.name}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(members).map(([memberId, displayName]) => {
                      const isMe = memberId === userId
                      const memberMatchdayPicks = memberRoundPreds[matchday]?.[memberId] || {}
                      return (
                        <tr key={memberId} style={{ background: isMe ? '#fff5f5' : 'transparent' }}>
                          <td style={{ padding: '4px 6px', fontWeight: isMe ? 700 : 400, color: isMe ? '#C8102E' : '#555', whiteSpace: 'nowrap' as const, borderTop: '1px solid #f5f5f5' }}>
                            {displayName}{isMe ? ' (you)' : ''}
                          </td>
                          {roundRules.map(rule => (
                            <td key={rule.category_id} style={{ padding: '4px 6px', textAlign: 'center' as const, borderTop: '1px solid #f5f5f5', color: '#555' }}>
                              {memberMatchdayPicks[rule.category_id] ? (
                                <span>{FLAGS[memberMatchdayPicks[rule.category_id]] || ''} {memberMatchdayPicks[rule.category_id]}</span>
                              ) : '—'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                  {roundFacts[matchday] && (
                    <tfoot>
                      <tr>
                        <td style={{ padding: '6px 6px 2px', fontSize: '10px', fontWeight: 700, color: '#2d7a2d', borderTop: '2px solid #eee', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>actual</td>
                        {roundRules.map(rule => {
                          const facts = roundFacts[matchday]
                          let actual = '—'
                          if (rule.category_id === 'soccer_clean_sheet_round') {
                            actual = (facts.clean_sheet_teams || []).length > 0 ? (facts.clean_sheet_teams || []).map((t: string) => `${FLAGS[t] || ''} ${t}`).join(', ') : '✗ none'
                          } else if (rule.category_id === 'soccer_penalty_round') {
                            actual = (facts.penalty_teams || []).length > 0 ? (facts.penalty_teams || []).map((t: string) => `${FLAGS[t] || ''} ${t}`).join(', ') : '✗ none'
                          } else if (rule.category_id === 'soccer_red_card_round') {
                            actual = (facts.red_card_teams || []).length > 0 ? (facts.red_card_teams || []).map((t: string) => `${FLAGS[t] || ''} ${t}`).join(', ') : '✗ none'
                          } else if (rule.category_id === 'soccer_brace_round') {
                            actual = (facts.brace_players || []).length > 0 ? (facts.brace_players || []).join(', ') : '✗ none'
                          }
                          return (
                            <td key={rule.category_id} style={{ padding: '6px 6px 2px', textAlign: 'center' as const, borderTop: '2px solid #eee', fontSize: '11px', fontWeight: 600, color: '#2d7a2d', whiteSpace: 'nowrap' as const }}>
                              {actual}
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Per-category input inside a fixture card ─────────────────────────────

  // CategoryInput is now defined outside this component — see above

  function formatPickValue(pred: PredV2 | undefined, rule: PoolRule, fixture: Fixture): string {
    if (!pred) return '—'
    // Handle 'no goal' / 'no card' picks stored as value_wld = 'none'
    if (pred.value_wld === 'none') return rule.category_id === 'soccer_first_yellow_team' ? 'no card' : 'no goal'
    if (rule.input_type === 'wld' || rule.category_id === 'soccer_first_team_score' || rule.category_id === 'soccer_first_yellow_team') {
      if (!pred.value_wld) return '—'
      if (pred.value_wld === 'home') return `${FLAGS[fixture.home_team] || ''} ${fixture.home_team}`
      if (pred.value_wld === 'away') return `${fixture.away_team} ${FLAGS[fixture.away_team] || ''}`
      if (pred.value_wld === 'draw') return 'draw'
      if (pred.value_wld === 'none') return rule.category_id === 'soccer_first_yellow_team' ? 'no card' : 'no goal'
      return pred.value_wld
    }
    if (rule.input_type === 'exact') return pred.value_text || '—'
    if (rule.input_type === 'ou') return pred.value_ou ? `${pred.value_ou}` : '—'
    if (rule.input_type === 'yesno') return pred.value_yesno === null ? '—' : pred.value_yesno ? 'yes' : 'no'
    if (rule.input_type === 'player' || rule.input_type === 'team') return pred.value_text || '—'
    return '—'
  }

  // ── Fixture card ─────────────────────────────────────────────────────────
  function FixtureCard({ fixture }: { fixture: Fixture }) {
    const locked = isLocked(fixture)
    const finished = fixture.status === 'FT'
    const isLive = fixture.status === 'live'
    const perGameRules = poolRules
      .filter(r => r.prediction_type === 'per_game')
      .slice()
      .sort((a, b) => {
        if (isKnockoutRound(fixture.round)) {
          if (a.category_id === 'soccer_team_to_advance') return -1
          if (b.category_id === 'soccer_team_to_advance') return 1
        }
        return 0
      })
    const hasAnyPick = perGameRules.some(r => {
      const p = preds[`${fixture.id}:${r.category_id}`]
      return p?.value_wld || p?.value_ou || p?.value_text || p?.value_yesno !== null
    })
    const totalPts = totalPointsForFixture(fixture.id)
    const showMemberPicks = showMemberPicksMap[fixture.id] ?? false
    const setShowMemberPicks = (v: boolean | ((prev: boolean) => boolean)) => {
      setShowMemberPicksMap(prev => ({ ...prev, [fixture.id]: typeof v === 'function' ? v(prev[fixture.id] ?? false) : v }))
    }

    const hasOdds = fixture.odds_home != null || fixture.odds_draw != null || fixture.odds_away != null
    const oddsRevealed = revealedOddsIds.has(fixture.id)
    const toggleOdds = (e: React.MouseEvent) => {
      e.stopPropagation()
      setRevealedOddsIds(prev => {
        const next = new Set(prev)
        if (next.has(fixture.id)) next.delete(fixture.id); else next.add(fixture.id)
        return next
      })
    }
    const oddsBadge = (light: boolean) => hasOdds && (
      <span
        onClick={toggleOdds}
        title={oddsRevealed ? 'tap to hide odds' : 'tap to reveal odds'}
        style={{
          cursor: 'pointer', userSelect: 'none' as const,
          color: light ? 'rgba(255,255,255,0.9)' : '#888',
          filter: oddsRevealed ? 'none' : 'blur(4px)',
          transition: 'filter 0.15s',
        }}>
        {fixture.odds_home != null ? fixture.odds_home.toFixed(2) : '—'}
        {fixture.odds_draw != null ? ` / ${fixture.odds_draw.toFixed(2)}` : ''}
        {' / '}{fixture.odds_away != null ? fixture.odds_away.toFixed(2) : '—'}
      </span>
    )

    return (
      <div style={{
        background: 'white',
        border: isLive ? '2px solid #2d7a2d' : '1px solid #e0e0db',
        borderLeft: isLive ? '4px solid #2d7a2d' : hasAnyPick ? '3px solid #C8102E' : '1px solid #e0e0db',
        marginBottom: 4,
        width: '100%',
      }}>

        {/* Live banner */}
        {isLive && (
          <div style={{ background: '#2d7a2d', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
              LIVE
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '10px' }}>
              {oddsBadge(true)}
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>{fixture.city}</span>
            </span>
          </div>
        )}

        {/* Meta row */}
        {!isLive && (
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid #f0f0f0',
            fontSize: '10px', color: '#aaa',
          }}>
            <span>{formatPT(fixture.date)}</span>
            <span>{fixture.city}</span>
            {oddsBadge(false)}
            {totalPts !== null && (
              <span style={{ color: totalPts > 0 ? '#C8102E' : '#aaa', fontWeight: 600 }}>
                {totalPts > 0 ? `+${totalPts} pts` : '0 pts'}
              </span>
            )}
            {locked && !finished && <span style={{ color: '#aaa' }}>locked</span>}
            {!locked && !finished && deadlineType === 'before_weekend' && (() => {
              const lockTime = matchdayLockTime(fixture.round)
              return lockTime ? <span style={{ color: '#bbb' }}>locks {formatLockTime(lockTime.toISOString())}</span> : null
            })()}
            {!locked && !finished && deadlineType === 'before_each_game' && (
              <span style={{ color: '#bbb' }}>locks at kickoff · {formatLockTime(fixture.date)}</span>
            )}
          </div>
        )}

        {/* Team/Fighter header */}
        {isPL ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 10px', borderBottom: perGameRules.length > 0 ? '1px solid #f5f5f5' : 'none', gap: 4 }}>
            {/* Home */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, gap: 4 }}>
              {fixture.home_logo
                ? <img src={fixture.home_logo} alt={fixture.home_team} style={{ width: 44, height: 44, objectFit: 'contain' }} />
                : <span style={{ fontSize: '28px' }}>{FLAGS[fixture.home_team] || '⚽'}</span>
              }
              <span style={{ fontWeight: 700, fontSize: '11px', textAlign: 'center' as const, lineHeight: 1.2 }}>{fixture.home_team}</span>
            </div>
            {/* Score or VS */}
            {(finished || isLive)
              ? <span style={{ fontWeight: 700, fontSize: isLive ? '22px' : '18px', color: isLive ? '#2d7a2d' : '#111', flexShrink: 0, padding: '0 8px' }}>{fixture.home_score} – {fixture.away_score}</span>
              : <span style={{ fontSize: '12px', color: '#ccc', flexShrink: 0, padding: '0 8px' }}>vs</span>
            }
            {/* Away */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flex: 1, gap: 4 }}>
              {fixture.away_logo
                ? <img src={fixture.away_logo} alt={fixture.away_team} style={{ width: 44, height: 44, objectFit: 'contain' }} />
                : <span style={{ fontSize: '28px' }}>{FLAGS[fixture.away_team] || '⚽'}</span>
              }
              <span style={{ fontWeight: 700, fontSize: '11px', textAlign: 'center' as const, lineHeight: 1.2 }}>{fixture.away_team}</span>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: perGameRules.length > 0 ? '1px solid #f5f5f5' : 'none', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{isMMA ? '' : FLAGS[fixture.home_team]} {fixture.home_team}</span>
          {(finished || isLive)
            ? <span style={{ fontWeight: 700, fontSize: isLive ? '18px' : '14px', color: isLive ? '#2d7a2d' : '#111', flexShrink: 0, padding: '0 8px' }}>{isMMA ? (fixture.home_score === 1 ? 'W' : fixture.away_score === 1 ? 'L' : '?') : `${fixture.home_score} – ${fixture.away_score}`}</span>
            : <span style={{ fontSize: '11px', color: '#ccc', flexShrink: 0, padding: '0 8px' }}>vs</span>
          }
          <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, textAlign: 'right' as const }}>{fixture.away_team} {isMMA ? '' : FLAGS[fixture.away_team]}</span>
        </div>
        )}

        {/* Per-game predictions */}
        {/* Live stats bar — corners and cards */}
        {isLive && (() => {
          const hasCorners = perGameRules.some(r => r.category_id === 'soccer_total_corners_ou' || r.category_id === 'soccer_corners_winner')
          const hasCards = perGameRules.some(r => r.category_id === 'soccer_card_points_ou' || r.category_id === 'soccer_cards_home_away')
          if (!hasCorners && !hasCards) return null
          return (
            <div style={{ display: 'flex', gap: 16, padding: '6px 10px', background: '#f0fff4', borderBottom: '1px solid #d0f0d8', fontSize: '11px', color: '#2d7a2d', flexWrap: 'wrap' as const, justifyContent: 'center' as const }}>
              {hasCorners && (
                <span>
                  🚩 corners: <Flag team={fixture.home_team} /> {fixture.live_home_corners ?? 0} – {fixture.live_away_corners ?? 0} <Flag team={fixture.away_team} />
                  {fixture.line_total_corners && <span style={{ color: '#aaa', marginLeft: 4 }}>(line {fixture.line_total_corners})</span>}
                </span>
              )}
              {hasCards && (
                <span>
                  🟨 cards: <Flag team={fixture.home_team} /> {fixture.live_home_cards ?? 0} – {fixture.live_away_cards ?? 0} <Flag team={fixture.away_team} />
                  {fixture.line_card_points && <span style={{ color: '#aaa', marginLeft: 4 }}>(line {fixture.line_card_points})</span>}
                </span>
              )}
            </div>
          )
        })()}

        {perGameRules.length > 0 && (
          <div style={{ padding: '8px 10px' }}>
            {perGameRules.map(rule => (
              <CategoryInput
                key={rule.category_id}
                fixture={fixture}
                rule={rule}
                pred={preds[`${fixture.id}:${rule.category_id}`]}
                locked={isLocked(fixture)}
                finished={fixture.status === 'FT'}
                updateLocal={updateLocal}
                scoreInputs={scoreInputs}
                setScoreInputs={setScoreInputs}
                predsRef={predsRef}
                poolRules={poolRules}
                isPL={isPL}
              />
            ))}
            {!locked && !finished && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving === fixture.id
                  ? <span style={{ fontSize: '11px', color: '#aaa' }}>saving...</span>
                  : saveErrors[fixture.id]
                  ? <span style={{ fontSize: '11px', color: '#C8102E' }}>✗ {saveErrors[fixture.id]}</span>
                  : <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ predictions are automatically saved</span>
                }
              </div>
            )}

            {/* Linked pool's extra categories (task #8) — only while viewing your own
                picks, not a ghost's, since linking is a real-user-only concept */}
            {activeEntryId === userId && linkedPools.map(lp => {
              const relevantRules = lp.rules.filter(r => r.prediction_type === 'per_game')
              if (relevantRules.length === 0) return null
              const timerKey = `${lp.poolId}:${fixture.id}`
              return (
                <div key={lp.poolId} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0e0db' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>
                    also for {lp.poolName}
                  </div>
                  {relevantRules.map(rule => (
                    <CategoryInput
                      key={rule.category_id}
                      fixture={fixture}
                      rule={rule}
                      pred={linkedPreds[lp.poolId]?.[`${fixture.id}:${rule.category_id}`]}
                      locked={isLocked(fixture)}
                      finished={fixture.status === 'FT'}
                      updateLocal={(fixtureId, categoryId, fields) => updateLinkedLocal(lp.poolId, fixtureId, categoryId, fields)}
                      scoreInputs={scoreInputs}
                      setScoreInputs={setScoreInputs}
                      predsRef={{ get current() { return linkedPredsRef.current[lp.poolId] || {} } }}
                      poolRules={lp.rules}
                      isPL={isPL}
                    />
                  ))}
                  {!locked && !finished && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {linkedSaving[timerKey]
                        ? <span style={{ fontSize: '11px', color: '#aaa' }}>saving...</span>
                        : linkedSaveErrors[timerKey]
                        ? <span style={{ fontSize: '11px', color: '#C8102E' }}>✗ {linkedSaveErrors[timerKey]}</span>
                        : <span style={{ fontSize: '11px', color: '#2d7a2d' }}>✓ saved to {lp.poolName}</span>
                      }
                    </div>
                  )}
                </div>
              )
            })}

            {/* Member picks comparison — visible once locked or live */}
            {(locked || finished || isLive) && Object.keys(members).length > 0 && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb' }}>
                    everyone's picks
                  </div>
                  {isLive && (
                    <button type="button" onClick={() => setShowMemberPicks(p => !p)}
                      style={{ fontSize: '10px', color: '#888', background: 'none', border: '1px solid #ddd', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {showMemberPicks ? 'hide' : 'show'}
                    </button>
                  )}
                </div>
                {(!isLive || showMemberPicks) && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const }}></td>
                        {perGameRules
                          .filter(rule => {
                            if (rule.category_id === 'soccer_result' && isKnockoutRound(fixture.round)) return false
                            if (rule.category_id === 'soccer_team_to_advance' && !isKnockoutRound(fixture.round)) return false
                            return true
                          })
                          .map(rule => (
                          <td key={rule.category_id} style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' as const, textAlign: 'center' as const }}>
                            {rule.category_id === 'soccer_exact_score' && isKnockoutRound(fixture.round) ? 'score AET' : rule.name}
                          </td>
                        ))}
                        {(finished || isLive) && <td style={{ padding: '3px 6px', color: '#aaa', fontWeight: 600, textAlign: 'center' as const }}>pts</td>}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(members)
                        .filter(([memberId]) => 
                          perGameRules.some(rule => {
                            const p = memberPreds[`${memberId}:${String(fixture.id)}:${rule.category_id}`]
                            return p && (p.value_wld || p.value_text || p.value_ou || p.value_yesno !== null || p.value_number !== null)
                          })
                        )
                        .map(([memberId, displayName]) => {
                          const memberTotalPts = perGameRules.reduce((sum, rule) => {
                            const p = memberPreds[`${memberId}:${String(fixture.id)}:${rule.category_id}`]
                            return sum + (p?.points_earned ?? 0)
                          }, 0)
                          return { memberId, displayName, memberTotalPts }
                        })
                        .sort((a, b) => b.memberTotalPts - a.memberTotalPts)
                        .map(({ memberId, displayName, memberTotalPts }) => {
                        const isMe = memberId === userId
                        return (
                          <tr key={memberId} style={{ background: isMe ? '#fff5f5' : 'transparent' }}>
                            <td style={{ padding: '4px 6px', fontWeight: isMe ? 700 : 400, color: isMe ? '#C8102E' : '#555', whiteSpace: 'nowrap' as const, borderTop: '1px solid #f5f5f5' }}>
                              {displayName}{isMe ? ' (you)' : ''}
                            </td>
                            {perGameRules
                              .filter(rule => {
                                if (rule.category_id === 'soccer_result' && isKnockoutRound(fixture.round)) return false
                                if (rule.category_id === 'soccer_team_to_advance' && !isKnockoutRound(fixture.round)) return false
                                return true
                              })
                              .map(rule => {
                              const p = memberPreds[`${memberId}:${String(fixture.id)}:${rule.category_id}`]
                              const isCorrect = p?.is_correct
                              const isExact = rule.category_id === 'soccer_exact_score' || rule.category_id === 'soccer_ht_exact_score'
                              
                              // For exact score — show per-team checkmarks
                              let displayContent: ReactNode
                              if (isExact && (finished || isLive) && p?.value_text && fixture.home_score !== null && fixture.away_score !== null) {
                                const parts = p.value_text.split('-')
                                const predHome = parseInt(parts[0])
                                const predAway = parseInt(parts[1])
                                if (isNaN(predHome) || isNaN(predAway)) {
                                  displayContent = <span style={{ color: '#ccc' }}>—</span>
                                } else {
                                const homeOk = predHome === fixture.home_score
                                const awayOk = predAway === fixture.away_score
                                displayContent = (
                                  <span>
                                    <span style={{ color: homeOk ? '#2d7a2d' : '#aaa' }}>{predHome}{homeOk ? ' ✓' : ' ✗'}</span>
                                    {' - '}
                                    <span style={{ color: awayOk ? '#2d7a2d' : '#aaa' }}>{predAway}{awayOk ? ' ✓' : ' ✗'}</span>
                                  </span>
                                )
                                }
                              } else {
                                displayContent = (
                                  <>
                                    {formatPickValue(p, rule, fixture)}
                                    {(finished || isLive) && isCorrect && <span style={{ marginLeft: 3 }}>✓</span>}
                                  </>
                                )
                              }

                              return (
                                <td key={rule.category_id} style={{
                                  padding: '4px 6px', textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
                                  borderTop: '1px solid #f5f5f5',
                                  color: (finished || isLive) && !isExact ? (isCorrect ? '#2d7a2d' : isCorrect === false ? '#aaa' : '#555') : '#555',
                                }}>
                                  {displayContent}
                                </td>
                              )
                            })}
                            {(finished || isLive) && (
                              <td style={{ padding: '4px 6px', textAlign: 'center' as const, fontWeight: 700, color: memberTotalPts > 0 ? '#C8102E' : '#aaa', borderTop: '1px solid #f5f5f5' }}>
                                {memberTotalPts > 0 ? `+${memberTotalPts}` : '0'}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    {(finished || isLive) && (
                      <tfoot>
                        <tr>
                          <td style={{ padding: '6px 6px 2px', fontSize: '10px', fontWeight: 700, color: isLive ? '#e67e00' : '#2d7a2d', borderTop: '2px solid #eee', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{isLive ? '🔴 live' : 'actual'}</td>
                          {perGameRules
                            .filter(rule => {
                              if (rule.category_id === 'soccer_result' && isKnockoutRound(fixture.round)) return false
                              if (rule.category_id === 'soccer_team_to_advance' && !isKnockoutRound(fixture.round)) return false
                              return true
                            })
                            .map(rule => {
                            let actual: React.ReactNode = '—'
                            const h = fixture.home_score ?? 0
                            const a = fixture.away_score ?? 0
                            const htH = fixture.ht_home_score
                            const htA = fixture.ht_away_score
                            const result = h > a ? 'home' : a > h ? 'away' : 'draw'
                            const htResult = htH != null && htA != null ? (htH > htA ? 'home' : htA > htH ? 'away' : 'draw') : null
                            const homeCorn = fixture.live_home_corners ?? 0
                            const awayCorn = fixture.live_away_corners ?? 0
                            const htHomeCorn = fixture.ht_home_corners
                            const htAwayCorn = fixture.ht_away_corners
                            const homeCards = fixture.live_home_cards ?? 0
                            const awayCards = fixture.live_away_cards ?? 0
                            const cornResult = homeCorn > awayCorn ? 'home' : awayCorn > homeCorn ? 'away' : 'draw'

                            const teamNode = (team: string) => <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Flag team={team} />{team}</span>

                            switch (rule.category_id) {
                              case 'soccer_result': actual = result === 'home' ? teamNode(fixture.home_team) : result === 'away' ? teamNode(fixture.away_team) : 'draw'; break
                              case 'soccer_team_to_advance': {
                                const winner = h > a ? fixture.home_team : a > h ? fixture.away_team : fixture.penalty_winner || null
                                actual = winner ? teamNode(winner) : '—'
                                break
                              }
                              case 'soccer_ht_result': actual = htResult ? (htResult === 'home' ? <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Flag team={fixture.home_team} />HT</span> : htResult === 'away' ? <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Flag team={fixture.away_team} />HT</span> : 'draw HT') : '—'; break
                              case 'soccer_exact_score': actual = `${h}–${a}`; break
                              case 'soccer_ht_exact_score': actual = htH != null && htA != null ? `${htH}–${htA} HT` : '—'; break
                              case 'soccer_first_goalscorer':
                              case 'soccer_anytime_goalscorer': actual = fixture.first_scorer_name || 'no goal'; break
                              case 'soccer_first_team_score': {
                                const fts = fixture.first_team_score
                                if (!fts) {
                                  if (isLive && h === 0 && a === 0) { actual = 'no goal'; break }
                                  actual = h > 0 ? teamNode(fixture.home_team) : a > 0 ? teamNode(fixture.away_team) : '—'
                                  break
                                }
                                actual = fts === 'home' ? teamNode(fixture.home_team) : teamNode(fixture.away_team)
                                break
                              }
                              case 'soccer_btts': actual = (h > 0 && a > 0) ? 'Yes' : 'No'; break
                              case 'soccer_total_goals_ou': actual = `${h + a} goals`; break
                              case 'soccer_total_corners_ou': actual = `${homeCorn + awayCorn} corners`; break
                              case 'soccer_corners_winner': actual = cornResult === 'home' ? teamNode(fixture.home_team) : cornResult === 'away' ? teamNode(fixture.away_team) : 'draw'; break
                              case 'soccer_ht_corners_winner': actual = htHomeCorn != null && htAwayCorn != null ? (htHomeCorn > htAwayCorn ? <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Flag team={fixture.home_team} />HT</span> : htAwayCorn > htHomeCorn ? <span style={{display:'inline-flex',alignItems:'center',gap:3}}><Flag team={fixture.away_team} />HT</span> : 'draw HT') : '—'; break
                              case 'soccer_card_points_ou': actual = `${homeCards + awayCards} card pts`; break
                              case 'soccer_cards_home_away': actual = homeCards > awayCards ? teamNode(fixture.home_team) : awayCards > homeCards ? teamNode(fixture.away_team) : 'draw'; break
                              case 'soccer_cards_ht': {
                                const htHC = fixture.ht_home_card_pts ?? 0
                                const htAC = fixture.ht_away_card_pts ?? 0
                                actual = htHC > htAC ? teamNode(fixture.home_team) : htAC > htHC ? teamNode(fixture.away_team) : 'draw'
                                break
                              }
                              case 'soccer_first_yellow_team': actual = fixture.first_yellow_team ? (fixture.first_yellow_team === 'home' ? teamNode(fixture.home_team) : teamNode(fixture.away_team)) : '—'; break
                              case 'soccer_asian_handicap': actual = result === 'home' ? teamNode(fixture.home_team) : result === 'away' ? teamNode(fixture.away_team) : 'draw'; break
                            }
                            return (
                              <td key={rule.category_id} style={{ padding: '6px 6px 2px', textAlign: 'center' as const, fontSize: '11px', color: '#2d7a2d', fontWeight: 600, borderTop: '2px solid #eee' }}>
                                {actual}
                              </td>
                            )
                          })}
                          {(finished || isLive) && <td style={{ borderTop: '2px solid #eee' }} />}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px' }}>loading fixtures...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Cross-pool pick-copy prompt — one-time per pool pair, only shown while viewing
          your own picks (not a ghost's) */}
      {activeEntryId === userId && copyCandidates.map(candidate => (
        <div key={candidate.poolId} style={{ padding: '10px 12px', background: '#f5f8ff', border: '1px solid #cdd9f5' }}>
          <div style={{ fontSize: '12px', marginBottom: 6 }}>
            you're also in <strong>{candidate.poolName}</strong> for this competition — copy your picks between the two automatically from now on?
          </div>
          {candidate.onlyInOtherCategories.length > 0 && (
            <div style={{ fontSize: '11px', color: '#888', marginBottom: 8 }}>
              {candidate.poolName} also scores: {candidate.onlyInOtherCategories.join(', ')} — those won't be copied since this pool doesn't track them.
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={resolvingCopyId === candidate.poolId} onClick={() => answerCopyPrompt(candidate, true)}
              style={{ padding: '5px 12px', background: '#111', color: 'white', border: 'none', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
              yes, always copy
            </button>
            <button type="button" disabled={resolvingCopyId === candidate.poolId} onClick={() => answerCopyPrompt(candidate, false)}
              style={{ padding: '5px 12px', background: 'white', color: '#888', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
              no thanks
            </button>
          </div>
        </div>
      ))}

      {/* Ghost entry switcher — admin only */}
      {isAdmin && (
        <div style={{ padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>making picks for</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: addingGhost ? 8 : 0 }}>
            <button type="button" onClick={() => switchEntry(userId)}
              style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                borderColor: activeEntryId === userId ? '#C8102E' : '#ddd',
                background: activeEntryId === userId ? '#C8102E' : 'white',
                color: activeEntryId === userId ? 'white' : '#555', fontWeight: activeEntryId === userId ? 700 : 400 }}>
              you
            </button>
            {ghostEntries.map(g => (
              <button key={g.id} type="button" onClick={() => switchEntry(g.id)}
                style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid', fontFamily: 'inherit', cursor: 'pointer',
                  borderColor: activeEntryId === g.id ? '#C8102E' : '#ddd',
                  background: activeEntryId === g.id ? '#C8102E' : 'white',
                  color: activeEntryId === g.id ? 'white' : '#555', fontWeight: activeEntryId === g.id ? 700 : 400 }}>
                {g.name}
              </button>
            ))}
            {!addingGhost && (
              <button type="button" onClick={() => setAddingGhost(true)}
                style={{ padding: '5px 10px', fontSize: '12px', border: '1px dashed #ddd', background: 'white', color: '#aaa', cursor: 'pointer', fontFamily: 'inherit' }}>
                + add entry
              </button>
            )}
          </div>
          {addingGhost && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus value={newGhostName} onChange={e => setNewGhostName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGhostEntry()}
                placeholder="entry name..."
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit' }} />
              <button type="button" onClick={addGhostEntry}
                style={{ padding: '6px 12px', background: '#111', color: 'white', border: 'none', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
                add
              </button>
              <button type="button" onClick={() => { setAddingGhost(false); setNewGhostName('') }}
                style={{ padding: '6px 10px', background: 'none', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', color: '#aaa' }}>
                cancel
              </button>
            </div>
          )}
        </div>
      )}
      {/* Controls */}
      {!hideControls && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(onlyRoundSpecials ? ['round'] : (isPL ? ['date', 'group'] : ['date', 'group', 'round'])).map((mode, i) => (
            <button type="button" key={mode} onClick={() => { setSortMode(mode as any); setCurrentPage(0) }}
              style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: sortMode === mode ? '#111' : 'white', color: sortMode === mode ? 'white' : '#888', minHeight: 44 }}>
              {mode === 'group' && isPL ? 'by matchday' : `by ${mode}`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3 }}>
          {(['pages', 'list'] as const).map((mode, i) => (
            <button type="button" key={mode} onClick={() => setViewMode(mode)}
              style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit', background: viewMode === mode ? '#111' : 'white', color: viewMode === mode ? 'white' : '#888', minHeight: 44 }}>
              {mode}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Live fixtures — always shown at top */}
      {fixtures.filter(f => f.status === 'live').length > 0 && (
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#2d7a2d', padding: '4px 0', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2d7a2d', display: 'inline-block' }} />
            live now
          </div>
          {fixtures.filter(f => f.status === 'live').map(f => <FixtureCard key={f.id} fixture={f} />)}
        </div>
      )}

      {/* Pager */}
      {viewMode === 'pages' && pages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e0e0db', padding: '8px 14px', width: '100%' }}>
          <button type="button" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
            style={{ background: 'none', border: '1px solid #ddd', padding: '8px 16px', cursor: safePage === 0 ? 'default' : 'pointer', fontSize: '18px', color: safePage === 0 ? '#ddd' : '#555', minHeight: 44 }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{pages[safePage]?.label}</div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>{safePage + 1} of {totalPages} · {pages[safePage]?.sub}</div>
          </div>
          <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}
            style={{ background: 'none', border: '1px solid #ddd', padding: '8px 16px', cursor: safePage === totalPages - 1 ? 'default' : 'pointer', fontSize: '18px', color: safePage === totalPages - 1 ? '#ddd' : '#555', minHeight: 44 }}>›</button>
        </div>
      )}

      {isBest5Active && plBest5AdminOverride && pages[safePage] && (() => {
        const round = pages[safePage].label
        const selectedIds = best5Selections[round] || []
        const roundFixtures = fixtures.filter(f => f.round === round)
        const selectedFixtures = roundFixtures.filter(f => selectedIds.includes(f.id))
        // The 5 selected games need to be announced with enough notice for people to
        // plan around them — swaps close one week before the earliest of the FIVE
        // selected kickoffs, not the round's overall first game (a swap can move the
        // earliest selected kickoff later or earlier than the round's unfiltered first game).
        const earliestSelectedKickoff = selectedFixtures.length > 0
          ? Math.min(...selectedFixtures.map(f => new Date(f.date).getTime()))
          : null
        const overrideLockTime = earliestSelectedKickoff !== null ? earliestSelectedKickoff - 7 * 24 * 60 * 60 * 1000 : null
        const locked = overrideLockTime !== null && Date.now() >= overrideLockTime
        return (
          <>
            {/* Everyone sees this, not just the admin — the 5 games can still change
                via override until the lock, so predictions made early on a game that
                later gets swapped out won't count. */}
            {!locked && (
              <div style={{ background: '#fffaf0', border: '1px solid #f0dca0', color: '#8a6d1f', fontSize: '11px', padding: '8px 12px', marginBottom: 8 }}>
                ⚠️ this pool's admin can still swap out any of these 5 games until {overrideLockTime !== null ? new Date(overrideLockTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'kickoff'} — picks on a game that gets swapped out won't count.
              </div>
            )}
            {isAdmin && (
              <Best5Selector
                poolId={poolId}
                round={round}
                selectedIds={selectedIds}
                allFixtures={roundFixtures}
                locked={locked}
                lockTime={overrideLockTime !== null ? new Date(overrideLockTime) : null}
                onSwap={(oldId, newId) => setBest5Selections(prev => ({
                  ...prev,
                  [round]: (prev[round] || []).map(id => id === oldId ? newId : id),
                }))}
              />
            )}
          </>
        )
      })()}

      {/* Fixture cards */}
      <div>
        {viewMode === 'pages' ? (() => {
          const page = pages[safePage]
          if (!page) return null
          if (sortMode === 'round' && page.roundId) {
            // Group fixtures by day within the round
            const dayMap: Record<string, Fixture[]> = {}
            const dayIsoMap: Record<string, string> = {}
            page.fixtures.filter(f => f.status !== 'live').sort((a, b) => {
              const statusOrder = (f: Fixture) => f.status === 'NS' ? 0 : f.status === 'FT' ? 1 : 2
              if (statusOrder(a) !== statusOrder(b)) return statusOrder(a) - statusOrder(b)
              return new Date(a.date).getTime() - new Date(b.date).getTime()
            }).forEach(f => {
              const day = formatDatePT(f.date)
              if (!dayMap[day]) { dayMap[day] = []; dayIsoMap[day] = f.date.slice(0, 10) }
              dayMap[day].push(f)
            })
            return (
              <>
                {isCustom && (() => {
                  const roundDef = MATCHDAY_ROUNDS.find(r => r.id === page.roundId)
                  const roundLocked = roundDef ? new Date() >= new Date(roundDef.start + 'T00:00:00-07:00') : false
                  return <RoundSpecialsCard matchday={page.roundId} locked={roundLocked} />
                })()}
                {Object.entries(dayMap).map(([day, fx]) => (
                  <div key={day}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #eee', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      {day} <span style={{ fontWeight: 400, textTransform: 'none' as const, color: '#ccc' }}>· {fx.length} game{fx.length > 1 ? 's' : ''}</span>
                    </div>
                    {fx.map(f => <FixtureCard key={f.id} fixture={f} />)}
                  </div>
                ))}
              </>
            )
          }
          return <>{page.fixtures
            .filter(f => f.status !== 'live')
            .sort((a, b) => {
              const statusOrder = (f: Fixture) => f.status === 'NS' ? 0 : f.status === 'FT' ? 1 : 2
              if (statusOrder(a) !== statusOrder(b)) return statusOrder(a) - statusOrder(b)
              return new Date(a.date).getTime() - new Date(b.date).getTime()
            })
            .map(f => <FixtureCard key={f.id} fixture={f} />)}</>
        })()
        : pages.map(page => (
          <div key={page.label}>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #e8e8e4', marginBottom: 4, width: '100%' }}>
              {page.label} <span style={{ fontWeight: 400, textTransform: 'none' as const, color: '#ccc' }}>{page.sub}</span>
            </div>
            {page.fixtures.filter(f => f.status !== 'live').map(f => <FixtureCard key={f.id} fixture={f} />)}
            <div style={{ marginBottom: 10 }} />
          </div>
        ))
        }
      </div>
    </div>
  )
}
