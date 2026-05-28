'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RULE_PACKAGES, type PackageId } from '@/types'

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
}

interface Prediction {
  fixture_id: number
  predicted_result: string | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  predicted_first_scorer_name: string | null
  points_earned: number | null
}

function formatPT(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' PT'
}

export default function FixturesList({
  poolId,
  userId,
  packageId,
  deadlineType,
}: {
  poolId: string
  userId: string
  packageId: string
  deadlineType: string
  scope: string
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [view, setView] = useState<'group' | 'kickoff'>('group')

  const pkg = RULE_PACKAGES[packageId as PackageId]

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const fixturesRes = await fetch('/api/fixtures')
      const fixturesData = await fixturesRes.json()
      setFixtures(fixturesData.fixtures || [])

      const { data: preds } = await supabase
        .from('predictions')
        .select('*')
        .eq('pool_id', poolId)
        .eq('user_id', userId)

      const predsMap: Record<number, Prediction> = {}
      preds?.forEach((p: Prediction) => { predsMap[p.fixture_id] = p })
      setPredictions(predsMap)
      setLoading(false)
    }
    load()
  }, [poolId, userId])

  async function savePrediction(fixtureId: number, update: Partial<Prediction>) {
    setSaving(fixtureId)
    const supabase = createClient()
    const current = predictions[fixtureId] || {}
    const merged: any = { ...current, ...update, fixture_id: fixtureId }

    const pkg2 = RULE_PACKAGES[packageId as PackageId]
    if (pkg2?.requires.exact_score && merged.predicted_home_score != null && merged.predicted_away_score != null) {
      if (merged.predicted_home_score > merged.predicted_away_score) merged.predicted_result = 'home'
      else if (merged.predicted_home_score < merged.predicted_away_score) merged.predicted_result = 'away'
      else merged.predicted_result = 'draw'
    }

    setPredictions(prev => ({ ...prev, [fixtureId]: merged }))

    await supabase.from('predictions').upsert({
      pool_id: poolId,
      user_id: userId,
      fixture_id: fixtureId,
      predicted_result: merged.predicted_result ?? null,
      predicted_home_score: merged.predicted_home_score ?? null,
      predicted_away_score: merged.predicted_away_score ?? null,
      predicted_first_scorer_name: merged.predicted_first_scorer_name ?? null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'pool_id,user_id,fixture_id' })

    setSaving(null)
  }

  function isLocked(fixture: Fixture) {
    if (deadlineType === 'before_tournament') return false
    return new Date(fixture.date) <= new Date()
  }

  // Group by round
  const byRound: Record<string, Fixture[]> = {}
  fixtures.forEach(f => {
    if (!byRound[f.round]) byRound[f.round] = []
    byRound[f.round].push(f)
  })

  // Sort by kickoff
  const byKickoff = [...fixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Group kickoff view by date
  const byDate: Record<string, Fixture[]> = {}
  byKickoff.forEach(f => {
    const day = new Date(f.date).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(f)
  })

  if (loading) return (
    <div className="card flex items-center justify-center h-40">
      <span className="font-display text-turf-400 tracking-widest animate-pulse">LOADING FIXTURES...</span>
    </div>
  )

  const sections = view === 'group'
    ? Object.entries(byRound)
    : Object.entries(byDate)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl text-chalk tracking-wider">FIXTURES & PICKS</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setView('group')}
            className="px-3 py-1 text-xs font-display tracking-widest border transition-all"
            style={{
              background: view === 'group' ? 'rgba(34,197,94,0.15)' : 'transparent',
              borderColor: view === 'group' ? 'var(--turf)' : 'rgba(245,240,232,0.2)',
              color: view === 'group' ? 'var(--turf-bright)' : 'var(--chalk-dim)',
            }}
          >
            BY GROUP
          </button>
          <button
            onClick={() => setView('kickoff')}
            className="px-3 py-1 text-xs font-display tracking-widest border transition-all"
            style={{
              background: view === 'kickoff' ? 'rgba(34,197,94,0.15)' : 'transparent',
              borderColor: view === 'kickoff' ? 'var(--turf)' : 'rgba(245,240,232,0.2)',
              color: view === 'kickoff' ? 'var(--turf-bright)' : 'var(--chalk-dim)',
            }}
          >
            BY DATE
          </button>
        </div>
      </div>

      {sections.map(([label, sectionFixtures]) => (
        <div key={label} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-display text-sm tracking-widest" style={{color: 'var(--chalk-dim)'}}>{label.toUpperCase()}</span>
            <div className="flex-1 h-px" style={{background: 'rgba(245,240,232,0.1)'}} />
          </div>

          <div className="flex flex-col gap-3">
            {sectionFixtures.map(fixture => {
              const pred = predictions[fixture.id]
              const locked = isLocked(fixture)
              const finished = fixture.status === 'FT'

              return (
                <div key={fixture.id} className="card" style={{borderColor: pred?.points_earned ? 'rgba(34,197,94,0.3)' : undefined}}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs" style={{color: 'var(--chalk-dim)'}}>
                      {formatPT(fixture.date)}
                      {view === 'group' && <span className="ml-2 opacity-50">{fixture.city}</span>}
                      {view === 'kickoff' && <span className="ml-2 opacity-50">{fixture.round} · {fixture.city}</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      {finished && <span className="badge text-xs" style={{color: 'var(--chalk-dim)'}}>FINAL</span>}
                      {locked && !finished && <span className="badge text-amber-400 text-xs">LOCKED</span>}
                      {pred?.points_earned != null && <span className="font-display text-turf-400">+{pred.points_earned} pts</span>}
                      {saving === fixture.id && <span className="text-xs text-turf-400 animate-pulse">saving...</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="font-display text-lg tracking-wide text-chalk flex-1">{fixture.home_team}</span>
                    <div className="mx-4">
                      {finished
                        ? <div className="font-display text-3xl text-chalk tracking-wider">{fixture.home_score} – {fixture.away_score}</div>
                        : <div className="font-display text-lg" style={{color: 'var(--chalk-dim)'}}>VS</div>
                      }
                    </div>
                    <span className="font-display text-lg tracking-wide text-chalk flex-1 text-right">{fixture.away_team}</span>
                  </div>

                  {!locked && !finished && (
                    <div className="pt-3 border-t" style={{borderColor: 'rgba(245,240,232,0.1)'}}>
                      {(pkg?.requires.result || !pkg?.requires.exact_score) && (
                        <div className="flex gap-2 mb-3">
                          {(['home', 'draw', 'away'] as const).map(result => (
                            <button
                              key={result}
                              onClick={() => savePrediction(fixture.id, { predicted_result: result })}
                              className="flex-1 py-2 border text-xs font-display tracking-widest transition-all"
                              style={{
                                background: pred?.predicted_result === result ? 'rgba(34,197,94,0.15)' : 'transparent',
                                borderColor: pred?.predicted_result === result ? 'var(--turf)' : 'rgba(245,240,232,0.15)',
                                color: pred?.predicted_result === result ? 'var(--turf-bright)' : 'var(--chalk-dim)',
                              }}
                            >
                              {result === 'home' ? fixture.home_team.toUpperCase() : result === 'away' ? fixture.away_team.toUpperCase() : 'DRAW'}
                            </button>
                          ))}
                        </div>
                      )}

                      {pkg?.requires.exact_score && (
                        <div className="flex items-center gap-3 mb-3">
                          <input type="number" min="0" max="20" className="input-chalk text-center w-16 font-display text-xl" placeholder="0"
                            value={pred?.predicted_home_score ?? ''}
                            onChange={e => savePrediction(fixture.id, { predicted_home_score: parseInt(e.target.value) || 0 })} />
                          <span className="font-display" style={{color: 'var(--chalk-dim)'}}>–</span>
                          <input type="number" min="0" max="20" className="input-chalk text-center w-16 font-display text-xl" placeholder="0"
                            value={pred?.predicted_away_score ?? ''}
                            onChange={e => savePrediction(fixture.id, { predicted_away_score: parseInt(e.target.value) || 0 })} />
                        </div>
                      )}

                      {pkg?.requires.first_scorer && (
                        <input className="input-chalk text-sm" placeholder="First goalscorer name..."
                          value={pred?.predicted_first_scorer_name || ''}
                          onChange={e => savePrediction(fixture.id, { predicted_first_scorer_name: e.target.value })} />
                      )}
                    </div>
                  )}

                  {(locked || finished) && pred && (
                    <div className="pt-3 border-t text-sm" style={{borderColor: 'rgba(245,240,232,0.1)', color: 'var(--chalk-dim)'}}>
                      <span>Your pick: </span>
                      {pred.predicted_result && (
                        <span className="text-chalk">
                          {pred.predicted_result === 'home' ? fixture.home_team : pred.predicted_result === 'away' ? fixture.away_team : 'Draw'}
                        </span>
                      )}
                      {pred.predicted_first_scorer_name && <span className="text-chalk ml-2">· {pred.predicted_first_scorer_name}</span>}
                    </div>
                  )}

                  {locked && !pred && (
                    <div className="pt-3 border-t text-sm" style={{borderColor: 'rgba(245,240,232,0.1)', color: 'var(--chalk-dim)'}}>No pick submitted</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
