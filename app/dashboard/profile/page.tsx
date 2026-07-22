'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const SPORT_ORDER = ['soccer', 'nfl', 'f1', 'mma']
const SPORT_META: Record<string, { emoji: string; label: string }> = {
  soccer: { emoji: '⚽', label: 'Premier League' },
  nfl: { emoji: '🏈', label: 'NFL' },
  f1: { emoji: '🏎', label: 'Formula 1' },
  mma: { emoji: '🥊', label: 'MMA' },
}

// Points-per-component scoring means a pick can earn points_earned > 0 without being
// fully correct — soccer's exact-score categories award home/away digits independently,
// and F1's podium-order categories award bonus points for close-but-wrong order. Flagged
// to the user via a footnote rather than re-deriving a stricter "fully correct" signal.
const PARTIAL_CREDIT_CATEGORIES = new Set([
  'soccer_exact_score', 'soccer_ht_exact_score',
  'f1_podium_order_1', 'f1_podium_order_2', 'f1_podium_order_3',
])

interface CategoryStat {
  categoryId: string
  name: string
  sortOrder: number
  hits: number
  total: number
}

interface SportStat {
  sport: string
  hits: number
  total: number
  categories: CategoryStat[]
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [sportStats, setSportStats] = useState<SportStat[]>([])
  const [hasPartialCredit, setHasPartialCredit] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [{ data: adminPools }, { data: memberRows }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', user.id),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
      ])
      const poolIds = [...new Set([
        ...(adminPools || []).map(p => p.id),
        ...(memberRows || []).map(m => m.pool_id),
      ])]

      if (poolIds.length === 0) { setLoading(false); return }

      const [{ data: preds }, { data: categories }] = await Promise.all([
        supabase.from('predictions_v2')
          .select('category_id, points_earned, is_correct')
          .eq('user_id', user.id)
          .in('pool_id', poolIds)
          .not('points_earned', 'is', null),
        supabase.from('ruleset_categories').select('id, sport, name, sort_order'),
      ])

      const categoryMap = new Map((categories || []).map(c => [c.id, c]))
      const bySport: Record<string, Record<string, CategoryStat>> = {}
      let sawPartialCredit = false

      for (const p of preds || []) {
        const cat = categoryMap.get(p.category_id)
        if (!cat) continue
        if (PARTIAL_CREDIT_CATEGORIES.has(p.category_id)) sawPartialCredit = true

        bySport[cat.sport] ??= {}
        bySport[cat.sport][p.category_id] ??= { categoryId: p.category_id, name: cat.name, sortOrder: cat.sort_order ?? 0, hits: 0, total: 0 }
        const stat = bySport[cat.sport][p.category_id]
        stat.total += 1
        if (p.is_correct) stat.hits += 1
      }

      const sports: SportStat[] = Object.entries(bySport).map(([sport, cats]) => {
        const categoryList = Object.values(cats).sort((a, b) => a.sortOrder - b.sortOrder)
        const hits = categoryList.reduce((sum, c) => sum + c.hits, 0)
        const total = categoryList.reduce((sum, c) => sum + c.total, 0)
        return { sport, hits, total, categories: categoryList }
      }).sort((a, b) => {
        const ai = SPORT_ORDER.indexOf(a.sport), bi = SPORT_ORDER.indexOf(b.sport)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })

      setSportStats(sports)
      setHasPartialCredit(sawPartialCredit)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>

  const totalPicks = sportStats.reduce((sum, s) => sum + s.total, 0)

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>your record</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>your prediction accuracy across every pool you've played, broken down by sport and prop.</p>
      </div>

      {totalPicks === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          no scored picks yet — check back once games kick off.
        </div>
      ) : (
        <>
          {sportStats.map(s => {
            const meta = SPORT_META[s.sport] || { emoji: '🏆', label: s.sport }
            const pct = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 0
            return (
              <section key={s.sport} style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{meta.label}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{pct}% · {s.hits}/{s.total}</span>
                  <div style={{ flex: 1, borderTop: '1px solid var(--border-light)' }} />
                </div>
                <div style={{ background: 'white', border: '1px solid var(--border)' }}>
                  {s.categories.map((c, i) => {
                    const catPct = c.total > 0 ? Math.round((c.hits / c.total) * 100) : 0
                    return (
                      <div key={c.categoryId} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.85rem', fontSize: '0.85rem',
                        borderTop: i === 0 ? 'none' : '1px solid var(--border-light)',
                      }}>
                        <span>{c.name}</span>
                        <span style={{ fontWeight: 600, color: catPct >= 50 ? '#2d7a2d' : 'var(--text-dim)' }}>{catPct}% <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({c.hits}/{c.total})</span></span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {hasPartialCredit && (
            <p style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '1rem' }}>
              exact-score and podium-order picks award partial credit, so a "hit" there can mean partially right, not exactly right.
            </p>
          )}
        </>
      )}
    </div>
  )
}
