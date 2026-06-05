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
    hour: 'numeric', minute: '2-digit',
  }) + ' PT'
}

function formatDatePT(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function FixturesList({ poolId, userId, packageId, deadlineType }: {
  poolId: string, userId: string, packageId: string, deadlineType: string, scope: string
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<'date' | 'group'>('date')
  const [viewMode, setViewMode] = useState<'pages' | 'list'>('pages')
  const [currentPage, setCurrentPage] = useState(0)

  const pkg = RULE_PACKAGES[packageId as PackageId]

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const res = await fetch('/api/fixtures')
      const data = await res.json()
      setFixtures(data.fixtures || [])

      const { data: preds } = await supabase
        .from('predictions').select('*')
        .eq('pool_id', poolId).eq('user_id', userId)

      const map: Record<number, Prediction> = {}
      preds?.forEach((p: Prediction) => { map[p.fixture_id] = p })
      setPredictions(map)
      setLoading(false)
    }
    load()
  }, [poolId, userId])

  async function savePrediction(fixtureId: number, update: Partial<Prediction>) {
    setSaving(fixtureId)
    const supabase = createClient()
    const merged: any = { ...(predictions[fixtureId] || {}), ...update, fixture_id: fixtureId }

    const pkg2 = RULE_PACKAGES[packageId as PackageId]
    if (pkg2?.requires.exact_score && merged.predicted_home_score != null && merged.predicted_away_score != null) {
      if (merged.predicted_home_score > merged.predicted_away_score) merged.predicted_result = 'home'
      else if (merged.predicted_home_score < merged.predicted_away_score) merged.predicted_result = 'away'
      else merged.predicted_result = 'draw'
    }

    setPredictions(prev => ({ ...prev, [fixtureId]: merged }))
    await supabase.from('predictions').upsert({
      pool_id: poolId, user_id: userId, fixture_id: fixtureId,
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

  const sorted = [...fixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Build pages
  const dateMap: Record<string, Fixture[]> = {}
  const groupMap: Record<string, Fixture[]> = {}
  sorted.forEach(f => {
    const day = formatDatePT(f.date)
    if (!dateMap[day]) dateMap[day] = []
    dateMap[day].push(f)
    if (!groupMap[f.round]) groupMap[f.round] = []
    groupMap[f.round].push(f)
  })

  const pages = sortMode === 'date'
    ? Object.entries(dateMap).map(([label, fixtures]) => ({ label, sub: `${fixtures.length} game${fixtures.length > 1 ? 's' : ''}`, fixtures }))
    : Object.entries(groupMap).map(([label, fixtures]) => ({
        label,
        sub: [...new Set(fixtures.flatMap(f => [f.home_team, f.away_team]))].slice(0, 4).join(' · '),
        fixtures
      }))

  const totalPages = pages.length
  const safePage = Math.min(currentPage, totalPages - 1)

  function handleSortChange(mode: 'date' | 'group') {
    setSortMode(mode)
    setCurrentPage(0)
  }

  if (loading) return <div style={{color: 'var(--text-dim)', fontSize: '0.875rem'}}>loading fixtures...</div>

  const renderFixture = (fixture: Fixture) => {
    const pred = predictions[fixture.id]
    const locked = isLocked(fixture)
    const finished = fixture.status === 'FT'
    const hasPick = pred?.predicted_result || pred?.predicted_home_score != null

    return (
      <div key={fixture.id} style={{
        background: 'white', border: '1px solid #e0e0db',
        borderLeft: hasPick ? '3px solid #C8102E' : '1px solid #e0e0db',
        padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <div style={{fontSize: '10px', color: '#aaa', minWidth: 85, lineHeight: 1.4}}>
          {formatPT(fixture.date)}<br />
          <span style={{color: '#ccc'}}>{fixture.city}</span>
        </div>
        <span style={{fontWeight: 600, fontSize: '12px', flex: 1}}>{fixture.home_team}</span>

        {finished ? (
          <span style={{fontWeight: 700, fontSize: '13px', padding: '0 6px'}}>{fixture.home_score}–{fixture.away_score}</span>
        ) : locked ? (
          <span style={{fontSize: '11px', color: '#aaa', padding: '0 6px'}}>locked</span>
        ) : (
          <div style={{display: 'flex', gap: 3}}>
            {(pkg?.requires.result || !pkg?.requires.exact_score) && (['home', 'draw', 'away'] as const).map(result => {
              const active = pred?.predicted_result === result
              const label = result === 'home'
                ? fixture.home_team.split(' ')[0].substring(0, 3).toUpperCase()
                : result === 'away'
                ? fixture.away_team.split(' ')[0].substring(0, 3).toUpperCase()
                : 'D'
              return (
                <button key={result} onClick={() => savePrediction(fixture.id, { predicted_result: result })}
                  style={{
                    padding: '2px 6px', fontSize: '10px', cursor: 'pointer',
                    border: `1px solid ${active ? '#C8102E' : '#ddd'}`,
                    background: active ? '#C8102E' : 'white',
                    color: active ? 'white' : '#888',
                    fontWeight: active ? 600 : 400,
                  }}>
                  {label}{active ? ' ✓' : ''}
                </button>
              )
            })}
            {pkg?.requires.exact_score && (
              <>
                <input type="number" min="0" max="20" style={{width: 36, textAlign: 'center', border: '1px solid #ddd', padding: '2px 4px', fontSize: '11px'}}
                  placeholder="0" value={pred?.predicted_home_score ?? ''}
                  onChange={e => savePrediction(fixture.id, { predicted_home_score: parseInt(e.target.value) || 0 })} />
                <span style={{color: '#aaa', fontSize: '11px'}}>–</span>
                <input type="number" min="0" max="20" style={{width: 36, textAlign: 'center', border: '1px solid #ddd', padding: '2px 4px', fontSize: '11px'}}
                  placeholder="0" value={pred?.predicted_away_score ?? ''}
                  onChange={e => savePrediction(fixture.id, { predicted_away_score: parseInt(e.target.value) || 0 })} />
              </>
            )}
            {pkg?.requires.first_scorer && (
              <input style={{border: '1px solid #ddd', padding: '2px 6px', fontSize: '10px', width: 120}}
                placeholder="first scorer..."
                value={pred?.predicted_first_scorer_name || ''}
                onChange={e => savePrediction(fixture.id, { predicted_first_scorer_name: e.target.value })} />
            )}
          </div>
        )}

        <span style={{fontWeight: 600, fontSize: '12px', flex: 1, textAlign: 'right'}}>{fixture.away_team}</span>

        <div style={{minWidth: 30, textAlign: 'right'}}>
          {saving === fixture.id && <span style={{fontSize: '10px', color: '#aaa'}}>...</span>}
          {pred?.points_earned != null && <span style={{fontSize: '11px', fontWeight: 600, color: '#C8102E'}}>+{pred.points_earned}</span>}
        </div>
      </div>
    )
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      {/* Controls */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3}}>
          {(['date', 'group'] as const).map((mode, i) => (
            <button key={mode} onClick={() => handleSortChange(mode)}
              style={{
                padding: '4px 10px', fontSize: '11px', cursor: 'pointer', border: 'none',
                borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit',
                background: sortMode === mode ? '#111' : 'white',
                color: sortMode === mode ? 'white' : '#888',
              }}>
              by {mode}
            </button>
          ))}
        </div>
        <div style={{display: 'flex', border: '1px solid #ddd', overflow: 'hidden', borderRadius: 3}}>
          {(['pages', 'list'] as const).map((mode, i) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{
                padding: '4px 10px', fontSize: '11px', cursor: 'pointer', border: 'none',
                borderLeft: i > 0 ? '1px solid #ddd' : 'none', fontFamily: 'inherit',
                background: viewMode === mode ? '#111' : 'white',
                color: viewMode === mode ? 'white' : '#888',
              }}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Pager */}
      {viewMode === 'pages' && pages.length > 0 && (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e0e0db', padding: '8px 14px', borderRadius: 3}}>
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={{background: 'none', border: '1px solid #ddd', padding: '2px 10px', cursor: safePage === 0 ? 'default' : 'pointer', fontSize: '14px', color: safePage === 0 ? '#ddd' : '#555', borderRadius: 2}}>
            ‹
          </button>
          <div style={{textAlign: 'center'}}>
            <div style={{fontWeight: 600, fontSize: '13px'}}>{pages[safePage]?.label}</div>
            <div style={{fontSize: '10px', color: '#aaa', marginTop: 2}}>{safePage + 1} of {totalPages} · {pages[safePage]?.sub}</div>
          </div>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            style={{background: 'none', border: '1px solid #ddd', padding: '2px 10px', cursor: safePage === totalPages - 1 ? 'default' : 'pointer', fontSize: '14px', color: safePage === totalPages - 1 ? '#ddd' : '#555', borderRadius: 2}}>
            ›
          </button>
        </div>
      )}

      {/* Fixtures */}
      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
        {viewMode === 'pages'
          ? pages[safePage]?.fixtures.map(renderFixture)
          : pages.map(page => (
              <div key={page.label}>
                <div style={{fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', padding: '8px 0 4px', borderBottom: '1px solid #e8e8e4', marginBottom: 4}}>
                  {page.label} <span style={{fontWeight: 400, textTransform: 'none', color: '#ccc'}}>{page.sub}</span>
                </div>
                {page.fixtures.map(renderFixture)}
                <div style={{marginBottom: 10}} />
              </div>
            ))
        }
      </div>
    </div>
  )
}
