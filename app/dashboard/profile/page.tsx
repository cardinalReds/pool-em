'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COMMON_IDS, CATEGORY_GROUPS, ROUND_SPECIALS, groupKeyFor } from '@/lib/categoryGroups'

const SPORT_ORDER = ['soccer', 'nfl', 'f1', 'mma']
const SPORT_META: Record<string, { emoji: string; label: string }> = {
  soccer: { emoji: '⚽', label: 'Soccer' },
  nfl: { emoji: '🏈', label: 'NFL' },
  f1: { emoji: '🏎', label: 'Formula 1' },
  mma: { emoji: '🥊', label: 'MMA' },
}

// Points-per-component scoring means points_earned > 0 (is_correct) isn't the same as
// "fully correct" — soccer's exact-score categories award home/away digits independently
// plus a bonus for getting both, and F1's podium-order categories award bonus points for
// picking a driver who's on the podium but in the wrong position. For these, "hit" is
// recomputed below as points_earned === the pool's full-credit value for that category,
// using each pool's own pool_rules (points/bonus_points), not just the is_correct flag.
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
  groups: { label: string; categories: CategoryStat[] }[]
}

function groupCategoriesForSport(categoryList: CategoryStat[]) {
  const used = new Set<string>()
  const byId = new Map(categoryList.map(c => [c.categoryId, c]))
  const groups: { label: string; categories: CategoryStat[] }[] = []

  const common = COMMON_IDS.map(id => byId.get(id)).filter(Boolean) as CategoryStat[]
  if (common.length > 0) {
    groups.push({ label: 'Common Picks', categories: common })
    common.forEach(c => used.add(c.categoryId))
  }

  for (const group of CATEGORY_GROUPS) {
    const cats = categoryList.filter(c => !used.has(c.categoryId) && group.ids.includes(groupKeyFor(c.categoryId)))
    if (cats.length === 0) continue
    groups.push({ label: group.label, categories: cats })
    cats.forEach(c => used.add(c.categoryId))
  }

  const roundSpecials = categoryList.filter(c => !used.has(c.categoryId) && ROUND_SPECIALS.includes(c.categoryId))
  if (roundSpecials.length > 0) {
    groups.push({ label: 'Round Specials', categories: roundSpecials })
    roundSpecials.forEach(c => used.add(c.categoryId))
  }

  const rest = categoryList.filter(c => !used.has(c.categoryId))
  if (rest.length > 0) groups.push({ label: 'Other', categories: rest })

  return groups
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

      const [{ data: preds }, { data: categories }, { data: poolRules }] = await Promise.all([
        supabase.from('predictions_v2')
          .select('pool_id, category_id, points_earned, is_correct')
          .eq('user_id', user.id)
          .in('pool_id', poolIds)
          .not('points_earned', 'is', null),
        supabase.from('ruleset_categories').select('id, sport, name, sort_order'),
        supabase.from('pool_rules').select('pool_id, category_id, points, bonus_points').in('pool_id', poolIds),
      ])

      const categoryMap = new Map((categories || []).map(c => [c.id, c]))

      // f1_podium_order_1/_2/_3 are scored individually but configured as one pool_rules
      // row under the base 'f1_podium_order' id — mirrors the ruleMap remap in
      // app/api/f1/score/route.ts so lookups by the prediction's actual category_id work.
      const ruleLookup = new Map<string, { points: number; bonus_points: number }>()
      for (const r of poolRules || []) {
        const entry = { points: r.points, bonus_points: r.bonus_points || 0 }
        ruleLookup.set(`${r.pool_id}:${r.category_id}`, entry)
        if (r.category_id === 'f1_podium_order') {
          ruleLookup.set(`${r.pool_id}:f1_podium_order_1`, entry)
          ruleLookup.set(`${r.pool_id}:f1_podium_order_2`, entry)
          ruleLookup.set(`${r.pool_id}:f1_podium_order_3`, entry)
        }
      }

      function isFullyCorrect(p: { pool_id: string; category_id: string; points_earned: number | null; is_correct: boolean | null }): boolean {
        if (!PARTIAL_CREDIT_CATEGORIES.has(p.category_id)) return !!p.is_correct
        const rule = ruleLookup.get(`${p.pool_id}:${p.category_id}`)
        if (!rule || !rule.points) return !!p.is_correct // couldn't find the rule — fall back rather than guess
        const fullCredit = p.category_id.startsWith('f1_podium_order_')
          ? rule.points
          : rule.points * 2 + rule.bonus_points // soccer_exact_score / soccer_ht_exact_score: both digits + bonus
        return p.points_earned === fullCredit
      }

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
        if (isFullyCorrect(p)) stat.hits += 1
      }

      const sports: SportStat[] = Object.entries(bySport).map(([sport, cats]) => {
        const categoryList = Object.values(cats).sort((a, b) => a.sortOrder - b.sortOrder)
        const hits = categoryList.reduce((sum, c) => sum + c.hits, 0)
        const total = categoryList.reduce((sum, c) => sum + c.total, 0)
        return { sport, hits, total, groups: groupCategoriesForSport(categoryList) }
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

                {s.groups.map(group => (
                  <div key={group.label} style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.35rem' }}>{group.label}</div>
                    <div style={{ background: 'white', border: '1px solid var(--border)' }}>
                      {group.categories.map((c, i) => {
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
                  </div>
                ))}
              </section>
            )
          })}

          {hasPartialCredit && (
            <p style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '1rem' }}>
              exact-score and podium-order picks award partial credit toward your pool total even when not fully right — a "hit" here only counts the fully-correct ones, so it can read lower than your points in those pools.
            </p>
          )}
        </>
      )}
    </div>
  )
}
