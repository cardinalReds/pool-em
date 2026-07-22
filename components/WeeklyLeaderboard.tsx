'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function parseMatchday(round: string): number | null {
  const m = round.match(/Matchday (\d+)/)
  return m ? parseInt(m[1]) : null
}

export default function WeeklyLeaderboard({ poolId, userId, tournamentId }: {
  poolId: string; userId: string; tournamentId: string
}) {
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  const [matchday, setMatchday] = useState<number | null>(null)
  const [rows, setRows] = useState<{ user_id: string; display_name: string; points: number }[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [membersRes, entriesRes, fixturesRes] = await Promise.all([
        supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId),
        supabase.from('matchday_entries').select('user_id, matchday').eq('pool_id', poolId),
        supabase.from('fixtures').select('id, round, date').eq('tournament_id', tournamentId),
      ])

      const nameByUser: Record<string, string> = {}
      ;(membersRes.data || []).forEach((m: any) => { nameByUser[m.user_id] = m.display_name })

      const byMatchday: Record<number, string[]> = {}
      ;(entriesRes.data || []).forEach((e: any) => {
        if (!byMatchday[e.matchday]) byMatchday[e.matchday] = []
        byMatchday[e.matchday].push(e.user_id)
      })

      const lockTimes: Record<number, number> = {}
      const fixtureIdsByMatchday: Record<number, number[]> = {}
      ;(fixturesRes.data || []).forEach((f: any) => {
        const md = parseMatchday(f.round)
        if (md === null) return
        const t = new Date(f.date).getTime()
        if (!(md in lockTimes) || t < lockTimes[md]) lockTimes[md] = t
        if (!fixtureIdsByMatchday[md]) fixtureIdsByMatchday[md] = []
        fixtureIdsByMatchday[md].push(f.id)
      })

      const now = Date.now()
      const target = Object.entries(lockTimes)
        .filter(([md, t]) => t <= now && (byMatchday[parseInt(md)] || []).length > 0)
        .map(([md]) => parseInt(md))
        .sort((a, b) => b - a)[0] ?? null
      setMatchday(target)

      if (target !== null) {
        const entrantIds = byMatchday[target]
        const fixtureIds = fixtureIdsByMatchday[target] || []
        const { data: preds } = await supabase.from('predictions_v2').select('user_id, points_earned')
          .eq('pool_id', poolId).in('fixture_id', fixtureIds).in('user_id', entrantIds)
        const pointsByUser: Record<string, number> = {}
        entrantIds.forEach(id => { pointsByUser[id] = 0 })
        ;(preds || []).forEach((p: any) => { pointsByUser[p.user_id] = (pointsByUser[p.user_id] || 0) + (p.points_earned || 0) })
        setRows(Object.entries(pointsByUser)
          .map(([user_id, points]) => ({ user_id, display_name: nameByUser[user_id] || 'unknown', points }))
          .sort((a, b) => b.points - a.points))
      } else {
        setRows([])
      }

      setLoading(false)
    }
    load()
  }, [poolId, userId, tournamentId])

  if (loading || matchday === null || rows.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid #eee' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#bbb' }}>weekly leaderboard · matchday {matchday}</span>
        <span style={{ fontSize: '12px', color: '#ccc' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: '14px' }}>
          {rows.map((r, i) => (
            <div key={r.user_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', marginBottom: '1px',
              background: r.user_id === userId ? '#fff5f5' : 'transparent',
              borderLeft: `3px solid ${r.user_id === userId ? '#C8102E' : 'transparent'}`,
            }}>
              <span style={{ fontSize: '13px', fontWeight: r.user_id === userId ? 600 : 400, color: r.user_id === userId ? '#111' : '#555' }}>{i + 1}. {r.display_name}</span>
              <span style={{ fontSize: '13px', fontWeight: r.user_id === userId ? 700 : 400, color: r.user_id === userId ? '#C8102E' : '#888' }}>{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
