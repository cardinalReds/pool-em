'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'

const PAYOUT_TEMPLATES = [
  { id: 'winner', label: 'Winner takes all', description: '1st place gets the full pot' },
  { id: 'top2', label: 'Top 2 split', description: '1st: 70% · 2nd: 30%' },
  { id: 'top3', label: 'Top 3 split', description: '1st: 60% · 2nd: 25% · 3rd: 15%' },
  { id: 'top3_equal', label: 'Top 3 equal', description: '1st, 2nd, 3rd split evenly' },
  { id: 'custom', label: 'Custom', description: 'Write your own payout rules' },
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
  const [buyIn, setBuyIn] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [zelleHandle, setZelleHandle] = useState('')
  const [payoutTemplate, setPayoutTemplate] = useState('winner')
  const [customPayout, setCustomPayout] = useState('')
  const [adminFeeEnabled, setAdminFeeEnabled] = useState(false)
  const [adminFeePercent, setAdminFeePercent] = useState('5')
  const [rulePoints, setRulePoints] = useState<Record<string, { points: number; bonus_points: number }>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: poolData } = await supabase.from('pools').select('*').eq('id', poolId).single()
      if (!poolData || poolData.admin_id !== user.id) { router.push('/dashboard'); return }

      // Block editing once the tournament has ended (per-pool, not a fixed global date)
      if (poolData.tournament_id) {
        const { data: tournament } = await supabase.from('tournaments').select('end_date').eq('id', poolData.tournament_id).maybeSingle()
        if (tournament?.end_date && new Date() >= new Date(tournament.end_date)) { router.push(`/pool/${poolId}`); return }
      }

      setPool(poolData)
      setName(poolData.name || '')
      setBuyIn(poolData.buy_in_amount?.toString() || '')
      setVenmoHandle(poolData.venmo_handle || '')
      setZelleHandle(poolData.zelle_handle || '')
      setAdminFeeEnabled(!!poolData.admin_fee_percent)
      setAdminFeePercent(poolData.admin_fee_percent?.toString() || '5')

      // Detect existing payout template
      const matchedTemplate = PAYOUT_TEMPLATES.find(t => t.description === poolData.payout_structure)
      if (matchedTemplate) {
        setPayoutTemplate(matchedTemplate.id)
      } else if (poolData.payout_structure) {
        setPayoutTemplate('custom')
        setCustomPayout(poolData.payout_structure)
      }

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
    const newBuyIn = buyIn ? parseFloat(buyIn) : null
    if (newBuyIn !== pool.buy_in_amount) changes.buy_in_amount = { from: pool.buy_in_amount, to: newBuyIn }
    const cleanVenmo = venmoHandle.replace('@', '').trim() || null
    if (cleanVenmo !== pool.venmo_handle) changes.venmo_handle = { from: pool.venmo_handle, to: cleanVenmo }
    const cleanZelle = zelleHandle.trim() || null
    if (cleanZelle !== pool.zelle_handle) changes.zelle_handle = { from: pool.zelle_handle, to: cleanZelle }
    const newPayout = buyIn && parseFloat(buyIn) > 0
      ? (payoutTemplate === 'custom' ? customPayout.trim() : PAYOUT_TEMPLATES.find(t => t.id === payoutTemplate)?.description || null)
      : null
    if (newPayout !== pool.payout_structure) changes.payout_structure = { from: pool.payout_structure, to: newPayout }
    const newAdminFee = adminFeeEnabled && adminFeePercent ? parseFloat(adminFeePercent) : null
    if (newAdminFee !== pool.admin_fee_percent) changes.admin_fee_percent = { from: pool.admin_fee_percent, to: newAdminFee }

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
      buy_in_amount: newBuyIn,
      venmo_handle: cleanVenmo,
      zelle_handle: cleanZelle,
      payout_structure: newPayout,
      admin_fee_percent: newAdminFee,
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', padding: 0 }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 20 }}>edit pool</h1>
      </div>

      {error && <div style={{ background: '#fff5f5', border: '1px solid #f0d0d0', padding: 12, marginBottom: 16, fontSize: 13, color: '#C8102E' }}>{error}</div>}

      {/* Pool name */}
      <section style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>pool name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', border: '1px solid #ddd', padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' as const, minHeight: 44 }} />
      </section>

      {/* Buy-in */}
      <section style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>buy-in <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></label>
        <p style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>players will be prompted to pay before the first match kicks off.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16, color: '#555' }}>$</span>
          <input type="number" min="0" step="1" value={buyIn} onChange={e => setBuyIn(e.target.value)}
            style={{ border: '1px solid #ddd', padding: '8px 10px', fontSize: 16, width: 100, fontFamily: 'inherit', minHeight: 44 }} />
          <span style={{ fontSize: 13, color: '#888' }}>per person</span>
        </div>

        {buyIn && parseFloat(buyIn) > 0 && (<>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>venmo handle <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#555', fontSize: 14 }}>@</span>
              <input type="text" placeholder="yourhandle" value={venmoHandle} onChange={e => setVenmoHandle(e.target.value.replace('@', ''))}
                style={{ border: '1px solid #ddd', padding: '8px 10px', fontSize: 15, flex: 1, fontFamily: 'inherit', minHeight: 44 }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>zelle phone or email <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></label>
            <input type="text" placeholder="phone or email" value={zelleHandle} onChange={e => setZelleHandle(e.target.value)}
              style={{ border: '1px solid #ddd', padding: '8px 10px', fontSize: 15, width: '100%', fontFamily: 'inherit', minHeight: 44, boxSizing: 'border-box' as const }} />
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>payout structure</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {PAYOUT_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setPayoutTemplate(t.id)}
                  style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                    borderColor: payoutTemplate === t.id ? '#C8102E' : '#e0e0db',
                    background: payoutTemplate === t.id ? '#fff5f5' : 'white' }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: payoutTemplate === t.id ? '#C8102E' : '#111' }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{t.description}</span>
                </button>
              ))}
            </div>
            {payoutTemplate === 'custom' && (
              <textarea value={customPayout} onChange={e => setCustomPayout(e.target.value)}
                placeholder="describe how the pot gets paid out..."
                style={{ width: '100%', border: '1px solid #ddd', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', minHeight: 80, boxSizing: 'border-box' as const }} />
            )}
          </div>

          <div style={{ marginTop: 16, padding: 14, border: '1px solid', borderColor: adminFeeEnabled ? '#C8102E' : '#e0e0db', background: adminFeeEnabled ? '#fff5f5' : 'white' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: adminFeeEnabled ? 10 : 0 }}>
              <input type="checkbox" checked={adminFeeEnabled} onChange={e => setAdminFeeEnabled(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>admin fee <span style={{ fontWeight: 400, color: '#aaa' }}>(optional)</span></div>
                <div style={{ fontSize: 11, color: '#aaa' }}>take a cut off the top of both pots — shown to members so it's never a surprise at payout</div>
              </div>
            </label>
            {adminFeeEnabled && (
              <div style={{ marginLeft: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min="0" max="100" step="1" value={adminFeePercent}
                  onChange={e => setAdminFeePercent(e.target.value)}
                  style={{ width: 70, border: '1px solid #ddd', padding: 8, fontSize: 16, fontFamily: 'inherit', textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: '#888' }}>% of the season pot and weekly pot</span>
              </div>
            )}
          </div>
        </>)}
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
