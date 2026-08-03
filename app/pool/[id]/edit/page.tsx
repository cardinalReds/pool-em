'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'

const VISIBILITY_OPTIONS: { id: 'admin_only' | 'member_invites' | 'public'; title: string; desc: string }[] = [
  { id: 'admin_only', title: 'only I can invite', desc: 'you share the invite link — that\'s the only way in' },
  { id: 'member_invites', title: 'anyone in the pool can invite', desc: 'members can share the invite link with others too' },
  { id: 'public', title: 'public', desc: 'anyone can find and join it from the browse page — no invite link needed' },
]

export default function EditPoolPage() {
  const params = useParams()
  const router = useRouter()
  const poolId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pool, setPool] = useState<any>(null)
  const [rules, setRules] = useState<any[]>([])

  // Editable fields
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'admin_only' | 'member_invites' | 'public'>('admin_only')
  const [rulePoints, setRulePoints] = useState<Record<string, { points: number; bonus_points: number }>>({})

  const hasBuyIn = !!pool && pool.buy_in_amount != null && parseFloat(pool.buy_in_amount) > 0

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Explicit column list, not select('*') — the admin check right below happens
      // client-side after this fetch resolves, so a non-admin who navigates here would
      // briefly receive the full row over the network before the redirect; bank fields
      // (unused on this page — bank details are set once at creation, not edited here)
      // must never be part of that response.
      const { data: poolData } = await supabase.from('pools').select('admin_fee_percent, admin_id, allow_member_invites, archived, buy_in_amount, created_at, deadline_type, id, invite_code, is_active, is_public, name, package_id, payout_structure, pick_mode, pl_best_weeks, pl_best5_admin_override, pl_game_mode, prize_season, prize_weekly, season_buy_in, season_props_enabled, sport, tournament_id, tournament_scope, updated_at, venmo_handle, weekly_buy_in, weekly_payout_structure, zelle_handle').eq('id', poolId).single()
      if (!poolData || poolData.admin_id !== user.id) { router.push('/dashboard'); return }

      // Block editing once the tournament has ended (per-pool, not a fixed global date)
      if (poolData.tournament_id) {
        const { data: tournament } = await supabase.from('tournaments').select('end_date').eq('id', poolData.tournament_id).maybeSingle()
        if (tournament?.end_date && new Date() >= new Date(tournament.end_date)) { router.push(`/pool/${poolId}`); return }
      }

      setPool(poolData)
      setName(poolData.name || '')
      setVisibility(poolData.is_public ? 'public' : poolData.allow_member_invites ? 'member_invites' : 'admin_only')

      // Load scoring rules
      const { data: rulesData } = await supabase
        .from('pool_rules')
        .select('id, category_id, points, bonus_points, ruleset_categories(name)')
        .eq('pool_id', poolId)

      setRules(rulesData || [])
      const pts: Record<string, { points: number; bonus_points: number }> = {}
      ;(rulesData || []).forEach((r: any) => {
        pts[r.category_id] = { points: r.points, bonus_points: r.bonus_points }
      })
      setRulePoints(pts)
      setLoading(false)
    }
    load()
  }, [poolId])

  async function handleSave() {
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Build changelog diff
    const changes: Record<string, { from: any; to: any }> = {}
    if (name !== pool.name) changes.name = { from: pool.name, to: name }
    // Buy-in pools stay invite-only, same rule as pool creation — buy-in itself isn't
    // editable here, but if this pool already has one, visibility can't move off admin_only.
    const newIsPublic = hasBuyIn ? false : visibility === 'public'
    const newAllowMemberInvites = hasBuyIn ? false : visibility === 'member_invites'
    if (newIsPublic !== !!pool.is_public) changes.is_public = { from: !!pool.is_public, to: newIsPublic }
    if (newAllowMemberInvites !== !!pool.allow_member_invites) changes.allow_member_invites = { from: !!pool.allow_member_invites, to: newAllowMemberInvites }

    // Check rule changes
    rules.forEach(r => {
      const newPts = rulePoints[r.category_id]
      if (!newPts) return
      if (newPts.points !== r.points) changes[`${r.ruleset_categories?.name || r.category_id}_points`] = { from: r.points, to: newPts.points }
      if (newPts.bonus_points !== r.bonus_points) changes[`${r.ruleset_categories?.name || r.category_id}_bonus`] = { from: r.bonus_points, to: newPts.bonus_points }
    })

    // Update pool
    const { error: poolError } = await supabase.from('pools').update({
      name,
      is_public: newIsPublic,
      allow_member_invites: newAllowMemberInvites,
      updated_at: new Date().toISOString(),
    }).eq('id', poolId)

    if (poolError) { setError(poolError.message); setSaving(false); return }

    // Update scoring rules
    for (const r of rules) {
      const newPts = rulePoints[r.category_id]
      if (!newPts) continue
      await supabase.from('pool_rules').update({
        points: newPts.points,
        bonus_points: newPts.bonus_points,
      }).eq('id', r.id)
    }

    // Log changes if any
    if (Object.keys(changes).length > 0) {
      await supabase.from('pool_changes').insert({
        pool_id: poolId,
        changed_by: user.id,
        changes,
      })
    }

    router.push(`/pool/${poolId}`)
  }

  if (loading) return <div style={{ padding: '2rem', color: '#aaa', fontSize: '14px' }}>loading...</div>

  const s = { fontFamily: "'Inter', system-ui, sans-serif" }

  return (
    <div style={{ ...s, maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button onClick={() => router.push(`/pool/${poolId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', minWidth: 36, minHeight: 36 }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 20 }}>edit pool</h1>
      </div>

      {error && <div style={{ background: '#fff5f5', border: '1px solid #f0d0d0', padding: 12, marginBottom: 16, fontSize: 13, color: '#C8102E' }}>{error}</div>}

      {/* Pool name */}
      <section style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>pool name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', border: '1px solid #ddd', padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' as const, minHeight: 44 }} />
      </section>

      {/* Who can join */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: hasBuyIn ? 4 : 10 }}>who can join?</div>
        {hasBuyIn ? (
          <p style={{ fontSize: 11, color: '#aaa' }}>this pool has a buy-in, so it stays invite-only — only you can invite people, so payments stay trackable.</p>
        ) : (
          VISIBILITY_OPTIONS.map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
              <input type="radio" name="visibility" checked={visibility === opt.id} onChange={() => setVisibility(opt.id)}
                style={{ width: 18, height: 18, cursor: 'pointer', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.title}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{opt.desc}</div>
              </div>
            </label>
          ))
        )}
      </section>

      {/* Scoring rules */}
      {rules.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>scoring rules</label>
          <p style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>adjust points per category. changes will be visible to all members.</p>
          <div style={{ border: '1px solid #e0e0db', overflow: 'hidden' }}>
            {rules.map((r, i) => {
              const pts = rulePoints[r.category_id] || { points: r.points, bonus_points: r.bonus_points }
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: i < rules.length - 1 ? '1px solid #f0f0f0' : 'none', background: 'white' }}>
                  <span style={{ flex: 1, fontSize: 12 }}>{r.ruleset_categories?.name || r.category_id}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>pts</span>
                    <input type="number" min="0" max="100" value={pts.points}
                      onChange={e => setRulePoints(prev => ({ ...prev, [r.category_id]: { ...pts, points: parseInt(e.target.value) || 0 } }))}
                      style={{ width: 52, border: '1px solid #ddd', padding: '4px 6px', fontSize: 13, textAlign: 'center', fontFamily: 'inherit' }} />
                    {r.bonus_points > 0 && (<>
                      <span style={{ fontSize: 11, color: '#aaa' }}>bonus</span>
                      <input type="number" min="0" max="100" value={pts.bonus_points}
                        onChange={e => setRulePoints(prev => ({ ...prev, [r.category_id]: { ...pts, bonus_points: parseInt(e.target.value) || 0 } }))}
                        style={{ width: 52, border: '1px solid #ddd', padding: '4px 6px', fontSize: 13, textAlign: 'center', fontFamily: 'inherit' }} />
                    </>)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <button onClick={handleSave} disabled={saving || !name.trim()}
        style={{ width: '100%', padding: '14px', fontSize: 14, fontWeight: 700, background: saving ? '#888' : '#111', color: 'white', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 52 }}>
        {saving ? 'saving...' : 'save changes'}
      </button>
    </div>
  )
}
