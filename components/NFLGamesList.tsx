'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface NFLFixture {
  id: number
  round: string
  home_team: string
  away_team: string
  home_logo: string | null
  away_logo: string | null
  date: string
  status: string
  home_score: number | null
  away_score: number | null
  line_asian_handicap_home: number | null
  line_total_goals: number | null
  line_ht_asian_handicap_home: number | null
  line_ht_total_points: number | null
}

interface PoolRule {
  category_id: string
  points: number
  bonus_points: number
  name: string
  input_type: string
}

interface Pred {
  id?: string
  fixture_id: number
  category_id: string
  value_wld?: string | null
  value_ou?: string | null
  points_earned?: number | null
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles'

function fmt(dateStr: string) {
  const date = new Date(dateStr)
  const time = date.toLocaleString('en-US', {
    timeZone: USER_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const tz = date.toLocaleTimeString('en-US', { timeZone: USER_TZ, timeZoneName: 'short' }).split(' ').pop()
  return `${time} ${tz}`
}

// Fixed, sensible display order — full-game props first, then their 1st-half counterparts.
// No exact-score category — NFL scores are too high-variance to make that a hittable pick.
const CATEGORY_ORDER = [
  'nfl_result', 'nfl_spread', 'nfl_total_points_ou',
  'nfl_ht_result', 'nfl_ht_spread', 'nfl_ht_total_points_ou',
]

export default function NFLGamesList({ poolId, userId, tournamentId, deadlineType = 'before_each_game', isAdmin = false }: {
  poolId: string; userId: string; tournamentId: string; deadlineType?: string; isAdmin?: boolean
}) {
  const [games, setGames] = useState<NFLFixture[]>([])
  const [poolRules, setPoolRules] = useState<PoolRule[]>([])
  const [preds, setPreds] = useState<Record<string, Pred>>({})
  const [loading, setLoading] = useState(true)
  const [weekIndex, setWeekIndex] = useState(0)
  const [ghostEntries, setGhostEntries] = useState<{ id: string; name: string }[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string>(userId)
  const [newGhostName, setNewGhostName] = useState('')
  const [addingGhost, setAddingGhost] = useState(false)

  async function load() {
    const supabase = createClient()
    const [gamesRes, rulesRes, predsRes, ghostRes] = await Promise.all([
      supabase.from('fixtures').select('*').eq('tournament_id', tournamentId).order('date'),
      supabase.from('pool_rules').select('category_id, points, bonus_points, ruleset_categories(name, input_type)').eq('pool_id', poolId),
      supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', userId),
      supabase.from('ghost_entries').select('id, name').eq('pool_id', poolId),
    ])

    setGames(gamesRes.data || [])
    setPoolRules((rulesRes.data || []).map((r: any) => ({
      category_id: r.category_id, points: r.points, bonus_points: r.bonus_points || 0,
      name: r.ruleset_categories?.name || r.category_id,
      input_type: r.ruleset_categories?.input_type || 'wld',
    })))
    setGhostEntries(ghostRes.data || [])

    const predMap: Record<string, Pred> = {}
    for (const p of predsRes.data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
    setPreds(predMap)

    // Default to the earliest week that hasn't fully started yet
    const weeks = [...new Set((gamesRes.data || []).map((g: NFLFixture) => g.round))]
    const now = Date.now()
    const nextIdx = weeks.findIndex(w => {
      const weekGames = (gamesRes.data || []).filter((g: NFLFixture) => g.round === w)
      return weekGames.some((g: NFLFixture) => new Date(g.date).getTime() > now)
    })
    setWeekIndex(nextIdx >= 0 ? nextIdx : 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [poolId, userId, tournamentId])

  async function switchEntry(entryId: string) {
    // Fetch and set preds BEFORE flipping activeEntryId — the exact-score inputs are
    // uncontrolled (defaultValue) and remount on activeEntryId change (see their key prop
    // below). If activeEntryId flipped first, that remount would land on a render where
    // preds still held the previous entry's data, baking stale digits into the freshly
    // mounted input as its defaultValue — which then never updates again after mount.
    const supabase = createClient()
    const { data } = await supabase.from('predictions_v2').select('*').eq('pool_id', poolId).eq('user_id', entryId)
    const predMap: Record<string, Pred> = {}
    for (const p of data || []) predMap[`${p.fixture_id}:${p.category_id}`] = p
    setPreds(predMap)
    setActiveEntryId(entryId)
  }

  async function addGhostEntry() {
    if (!newGhostName.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from('ghost_entries').insert({
      pool_id: poolId, name: newGhostName.trim(), created_by: userId
    }).select().single()
    if (data) {
      setGhostEntries(prev => [...prev, data])
      await switchEntry(data.id)
      setNewGhostName('')
      setAddingGhost(false)
    }
  }

  async function savePred(fixtureId: number, categoryId: string, value: Partial<Pred>) {
    const key = `${fixtureId}:${categoryId}`
    const existing = preds[key]
    setPreds(prev => ({ ...prev, [key]: { ...existing, fixture_id: fixtureId, category_id: categoryId, ...value } }))

    const supabase = createClient()
    if (existing?.id) {
      await supabase.from('predictions_v2').update(value).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('predictions_v2').insert({
        pool_id: poolId, user_id: activeEntryId, fixture_id: fixtureId, category_id: categoryId, ...value
      }).select().single()
      if (data) setPreds(prev => ({ ...prev, [key]: data }))
    }
  }

  if (loading) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>loading...</div>

  const weeks = [...new Set(games.map(g => g.round))]
  if (weeks.length === 0) return <div style={{ color: '#aaa', fontSize: '13px', padding: 16 }}>no games found</div>

  const safeIdx = Math.min(Math.max(weekIndex, 0), weeks.length - 1)
  const currentWeek = weeks[safeIdx]
  const weekGames = games.filter(g => g.round === currentWeek).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const enabledRules = CATEGORY_ORDER.map(id => poolRules.find(r => r.category_id === id)).filter(Boolean) as PoolRule[]

  // 'before_weekend' pools lock the whole gameweek at the first kickoff of that week,
  // rather than each game locking individually at its own kickoff — mirrors FixturesList's
  // isLocked/matchdayLockTime for PL's "before each match week" option.
  function isGameLocked(game: NFLFixture) {
    if (deadlineType === 'before_weekend') {
      const weekGamesAll = games.filter(g => g.round === game.round)
      const firstKickoff = Math.min(...weekGamesAll.map(g => new Date(g.date).getTime()))
      return Date.now() >= firstKickoff
    }
    return new Date(game.date) <= new Date()
  }

  return (
    <div>
      {/* Entry switcher — admin only */}
      {isAdmin && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e0e0db' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>making picks for</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
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

      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setWeekIndex(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === 0 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === 0 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center' as const }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>🏈 {currentWeek}</div>
          <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>{safeIdx + 1} of {weeks.length}</div>
        </div>
        <button type="button" onClick={() => setWeekIndex(i => Math.min(weeks.length - 1, i + 1))} disabled={safeIdx === weeks.length - 1}
          style={{ width: 36, height: 36, border: '1px solid #ddd', background: 'white', cursor: safeIdx === weeks.length - 1 ? 'default' : 'pointer', fontSize: '16px', color: safeIdx === weeks.length - 1 ? '#ddd' : '#333', fontFamily: 'inherit' }}>
          ›
        </button>
      </div>

      {/* Games for this week */}
      {weekGames.map(game => {
        const locked = isGameLocked(game)
        const btnStyle = (active: boolean): React.CSSProperties => ({
          flex: 1, padding: '8px 4px', fontSize: '11px', border: '1px solid',
          cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit',
          borderColor: active ? '#C8102E' : '#ddd',
          background: active ? '#C8102E' : locked ? '#fafafa' : 'white',
          color: active ? 'white' : '#555',
        })

        return (
          <div key={game.id} style={{ marginBottom: 20, border: '1px solid #e0e0db', background: 'white' }}>
            <div style={{ background: '#111', color: 'white', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: 4 }}>{fmt(game.date)}{locked ? ' · locked' : ''}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '13px' }}>
                  {game.away_logo && <img src={game.away_logo} alt="" width={20} height={20} style={{ objectFit: 'contain' as const }} />}
                  {game.away_team}
                </span>
                <span style={{ color: '#555', fontSize: '11px' }}>@</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '13px' }}>
                  {game.home_team}
                  {game.home_logo && <img src={game.home_logo} alt="" width={20} height={20} style={{ objectFit: 'contain' as const }} />}
                </span>
              </div>
              {game.status === 'FT' && (
                <div style={{ textAlign: 'center' as const, marginTop: 6, fontWeight: 700, fontSize: '15px' }}>
                  {game.away_score} – {game.home_score}
                </div>
              )}
            </div>

            <div style={{ padding: '10px 12px' }}>
              {enabledRules.length === 0 && (
                <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center' as const, padding: 8 }}>no predictions configured for this pool</div>
              )}
              {enabledRules.map(rule => {
                const key = `${game.id}:${rule.category_id}`
                const pick = preds[key]
                const isHt = rule.category_id.startsWith('nfl_ht_')
                const spreadLine = isHt ? game.line_ht_asian_handicap_home : game.line_asian_handicap_home
                const totalLine = isHt ? game.line_ht_total_points : game.line_total_goals

                return (
                  <div key={rule.category_id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{rule.name}</span>
                      <span style={{ color: '#C8102E' }}>{rule.points} pt{rule.points > 1 ? 's' : ''}</span>
                    </div>

                    {rule.input_type === 'wld' && (rule.category_id === 'nfl_spread' || rule.category_id === 'nfl_ht_spread') && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button style={{ ...btnStyle(pick?.value_wld === 'away'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'away' })}>
                          {game.away_team}{spreadLine != null ? ` (${spreadLine > 0 ? '+' : ''}${-spreadLine})` : ''}
                        </button>
                        <button style={{ ...btnStyle(pick?.value_wld === 'draw'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'draw' })}>
                          push
                        </button>
                        <button style={btnStyle(pick?.value_wld === 'home')} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'home' })}>
                          {game.home_team}{spreadLine != null ? ` (${spreadLine > 0 ? '+' : ''}${spreadLine})` : ''}
                        </button>
                      </div>
                    )}

                    {rule.input_type === 'wld' && rule.category_id !== 'nfl_spread' && rule.category_id !== 'nfl_ht_spread' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button style={{ ...btnStyle(pick?.value_wld === 'away'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'away' })}>
                          {game.away_team}
                        </button>
                        <button style={{ ...btnStyle(pick?.value_wld === 'draw'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'draw' })}>
                          tie
                        </button>
                        <button style={btnStyle(pick?.value_wld === 'home')} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_wld: 'home' })}>
                          {game.home_team}
                        </button>
                      </div>
                    )}

                    {rule.input_type === 'ou' && (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button style={{ ...btnStyle(pick?.value_ou === 'over'), borderRight: 'none' }} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_ou: 'over' })}>
                          over {totalLine ?? '(line TBD)'}
                        </button>
                        <button style={btnStyle(pick?.value_ou === 'under')} disabled={locked}
                          onClick={() => !locked && savePred(game.id, rule.category_id, { value_ou: 'under' })}>
                          under {totalLine ?? '(line TBD)'}
                        </button>
                      </div>
                    )}

                    {pick?.points_earned != null && game.status === 'FT' && (
                      <div style={{ fontSize: '10px', marginTop: 4, color: pick.points_earned > 0 ? '#2d7a2d' : '#aaa' }}>
                        {pick.points_earned > 0 ? `✓ +${pick.points_earned} pts` : '✗ no points'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
