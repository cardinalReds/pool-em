'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SPORT_ORDER, SPORT_META } from '@/lib/sportLabels'

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [notifyPoolInvites, setNotifyPoolInvites] = useState(true)
  const [notifyNewCompetitions, setNotifyNewCompetitions] = useState(true)
  const [sportInterests, setSportInterests] = useState<Set<string>>(new Set())
  const [oddsFormat, setOddsFormat] = useState<'decimal' | 'american' | 'fractional'>('decimal')
  const [loading, setLoading] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      setUserId(user.id)

      const [{ data: profile }, { data: interests }] = await Promise.all([
        supabase.from('profiles').select('display_name, notify_pool_invites, notify_new_competitions, odds_format').eq('id', user.id).single(),
        supabase.from('user_sport_interests').select('sport').eq('user_id', user.id),
      ])

      if (profile) {
        setDisplayName(profile.display_name)
        setNotifyPoolInvites(profile.notify_pool_invites)
        setNotifyNewCompetitions(profile.notify_new_competitions)
        setOddsFormat(profile.odds_format as 'decimal' | 'american' | 'fractional')
      }
      setSportInterests(new Set((interests || []).map(i => i.sport)))
      setLoading(false)
    }
    load()
  }, [])

  async function toggleSportInterest(sport: string, checked: boolean) {
    if (!userId) return
    setSportInterests(prev => {
      const next = new Set(prev)
      if (checked) next.add(sport); else next.delete(sport)
      return next
    })
    const supabase = createClient()
    if (checked) {
      await supabase.from('user_sport_interests').upsert({ user_id: userId, sport, source: 'manual' })
    } else {
      await supabase.from('user_sport_interests').delete().eq('user_id', userId).eq('sport', sport)
    }
  }

  async function saveDisplayName() {
    if (!userId || !displayName.trim()) return
    setNameStatus('saving')
    const supabase = createClient()
    const trimmed = displayName.trim()

    const { error: authError } = await supabase.auth.updateUser({ data: { display_name: trimmed } })
    const { error: profileError } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId)
    const { error: memberError } = await supabase.from('pool_members').update({ display_name: trimmed }).eq('user_id', userId)

    if (authError || profileError || memberError) {
      setNameStatus('error')
      setTimeout(() => setNameStatus('idle'), 3000)
    } else {
      setNameStatus('saved')
      setTimeout(() => setNameStatus('idle'), 3000)
    }
  }

  async function toggleNotifyPoolInvites(checked: boolean) {
    if (!userId) return
    setNotifyPoolInvites(checked)
    await createClient().from('profiles').update({ notify_pool_invites: checked }).eq('id', userId)
  }

  async function toggleNotifyNewCompetitions(checked: boolean) {
    if (!userId) return
    setNotifyNewCompetitions(checked)
    await createClient().from('profiles').update({ notify_new_competitions: checked }).eq('id', userId)
  }

  async function changeOddsFormat(format: 'decimal' | 'american' | 'fractional') {
    if (!userId) return
    setOddsFormat(format)
    await createClient().from('profiles').update({ odds_format: format }).eq('id', userId)
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError('')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setDeleteError(body.error || 'something went wrong — try again')
      setDeleting(false)
      return
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return <div style={{padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem'}}>loading...</div>

  return (
    <div>
      <h1 style={{fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem'}}>settings</h1>

      <section style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
          <span className="section-label">display name</span>
          <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
        </div>
        <div className="card">
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <input className="input" type="text" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              style={{flex: 1, fontSize: '16px', padding: '0.6rem 0.75rem'}} />
            <button onClick={saveDisplayName} disabled={nameStatus === 'saving'}
              style={{
                padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: nameStatus === 'saving' ? 'default' : 'pointer',
                background: nameStatus === 'saved' ? '#2d7a2d' : nameStatus === 'error' ? 'var(--red)' : '#111', color: 'white',
              }}>
              {nameStatus === 'saving' ? 'saving...' : nameStatus === 'saved' ? 'saved ✓' : nameStatus === 'error' ? 'error' : 'save'}
            </button>
          </div>
          <p style={{fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.5rem'}}>
            this updates your name across every pool you're in.
          </p>
        </div>
      </section>

      <section style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
          <span className="section-label">email notifications</span>
          <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
        </div>
        <div className="card" style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer'}}>
            <input type="checkbox" checked={notifyPoolInvites} onChange={e => toggleNotifyPoolInvites(e.target.checked)} />
            email me when I'm invited to a pool
          </label>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer'}}>
            <input type="checkbox" checked={notifyNewCompetitions} onChange={e => toggleNotifyNewCompetitions(e.target.checked)} />
            email me when a new competition goes live
          </label>
          <p style={{fontSize: '0.75rem', color: 'var(--text-faint)'}}>
            per-pool kickoff reminders are set separately, from inside each pool.
          </p>
        </div>
      </section>

      <section style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
          <span className="section-label">sports you follow</span>
          <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
        </div>
        <div className="card" style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          {SPORT_ORDER.map(sport => (
            <label key={sport} style={{display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer'}}>
              <input type="checkbox" checked={sportInterests.has(sport)} onChange={e => toggleSportInterest(sport, e.target.checked)} />
              {SPORT_META[sport].emoji} {SPORT_META[sport].label}
            </label>
          ))}
          <p style={{fontSize: '0.75rem', color: 'var(--text-faint)'}}>
            we check these off automatically when you join a pool for that sport — uncheck any you're not actually into. friends inviting you to a pool will see if it's a sport you don't follow.
          </p>
        </div>
      </section>

      <section style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
          <span className="section-label">odds format</span>
          <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
        </div>
        <div className="card" style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          {([
            { id: 'decimal', label: 'decimal', example: '1.73' },
            { id: 'american', label: 'american', example: '−137 or +137' },
            { id: 'fractional', label: 'fractional', example: '73/100' },
          ] as const).map(opt => (
            <label key={opt.id} style={{display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer'}}>
              <input type="radio" name="odds_format" checked={oddsFormat === opt.id} onChange={() => changeOddsFormat(opt.id)} />
              {opt.label} <span style={{color: 'var(--text-faint)'}}>({opt.example})</span>
            </label>
          ))}
          <p style={{fontSize: '0.75rem', color: 'var(--text-faint)'}}>
            how the blurred odds badge on fixtures is displayed, once revealed. doesn't change the underlying odds, just how they're shown.
          </p>
        </div>
      </section>

      <section>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
          <span className="section-label" style={{color: 'var(--red)'}}>danger zone</span>
          <div style={{flex: 1, borderTop: '1px solid var(--border-light)'}} />
        </div>
        <div className="card">
          {!confirmingDelete ? (
            <button onClick={() => setConfirmingDelete(true)}
              style={{fontSize: '0.85rem', padding: '0.6rem 1rem', background: 'white', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer', fontFamily: 'inherit'}}>
              delete account
            </button>
          ) : (
            <div>
              <p style={{fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem'}}>
                this permanently deletes your account, your picks, and any pools you admin. this can't be undone. are you sure?
              </p>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button onClick={() => setConfirmingDelete(false)}
                  style={{flex: 1, fontSize: '0.85rem', padding: '0.6rem', background: 'white', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit'}}>
                  cancel
                </button>
                <button onClick={handleDeleteAccount} disabled={deleting}
                  style={{flex: 1, fontSize: '0.85rem', padding: '0.6rem', background: 'var(--red)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit'}}>
                  {deleting ? 'deleting...' : 'yes, delete my account'}
                </button>
              </div>
              {deleteError && <p style={{fontSize: '0.75rem', color: 'var(--red)', marginTop: '0.5rem'}}>{deleteError}</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
