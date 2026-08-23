'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import RecordPanel from '@/components/RecordPanel'

interface GhostRow {
  id: string
  name: string
  pool_id: string | null
  channel_name: string | null
  channel_url: string | null
  avatar_url: string | null
  source_ghost_entry_id: string | null
}

// A ghost entry's public-facing profile — channel name/link, an avatar, and its
// prediction record, scoped to whichever pool this specific ghost row lives in. A ghost
// added to a matching public pool gets a separate mirror row (source_ghost_entry_id —
// see lib/publicPoolSync.ts) with its own picks, so the *record* below is always this
// row's own pool, but the *profile* fields (name/channel/avatar) always read from and
// write to the original row — editing a mirror edits the same underlying identity.
export default function GhostProfilePage() {
  const params = useParams()
  const router = useRouter()
  const ghostId = params.ghostId as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ghost, setGhost] = useState<GhostRow | null>(null)
  const [canonical, setCanonical] = useState<GhostRow | null>(null)
  const [poolName, setPoolName] = useState('')
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const [channelName, setChannelName] = useState('')
  const [channelUrl, setChannelUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setViewerId(user.id)

      const { data: row } = await supabase.from('ghost_entries')
        .select('id, name, pool_id, channel_name, channel_url, avatar_url, source_ghost_entry_id')
        .eq('id', ghostId).maybeSingle()
      if (!row) { setNotFound(true); setLoading(false); return }
      setGhost(row)

      const canonicalRow = row.source_ghost_entry_id
        ? (await supabase.from('ghost_entries')
            .select('id, name, pool_id, channel_name, channel_url, avatar_url, source_ghost_entry_id')
            .eq('id', row.source_ghost_entry_id).maybeSingle()).data
        : row
      if (!canonicalRow) { setNotFound(true); setLoading(false); return }
      setCanonical(canonicalRow)
      setChannelName(canonicalRow.channel_name || '')
      setChannelUrl(canonicalRow.channel_url || '')

      if (row.pool_id) {
        const { data: pool } = await supabase.from('pools').select('name').eq('id', row.pool_id).maybeSingle()
        setPoolName(pool?.name || '')
      }

      if (canonicalRow.pool_id) {
        const [{ data: adminPool }, { data: memberRow }] = await Promise.all([
          supabase.from('pools').select('id').eq('id', canonicalRow.pool_id).eq('admin_id', user.id).maybeSingle(),
          supabase.from('pool_members').select('can_manage_ghosts').eq('pool_id', canonicalRow.pool_id).eq('user_id', user.id).maybeSingle(),
        ])
        setCanEdit(!!adminPool || !!memberRow?.can_manage_ghosts)
      }

      setLoading(false)
    }
    load()
  }, [ghostId, router])

  async function saveChannelInfo() {
    if (!canonical) return
    setSaving(true)
    setSaveError('')
    const supabase = createClient()
    const { error } = await supabase.from('ghost_entries')
      .update({ channel_name: channelName.trim() || null, channel_url: channelUrl.trim() || null })
      .eq('id', canonical.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setCanonical({ ...canonical, channel_name: channelName.trim() || null, channel_url: channelUrl.trim() || null })
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !canonical || !viewerId) return
    if (!file.type.startsWith('image/')) { setSaveError('please choose an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setSaveError('image must be under 5MB'); return }

    setUploading(true)
    setSaveError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    // Folder must be the uploader's own auth uid — storage policy keys off that, same as
    // real profile avatars — so the filename (not the folder) is what ties this to the
    // ghost.
    const path = `${viewerId}/ghost-${canonical.id}-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setSaveError(uploadErr.message); setUploading(false); return }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: dbErr } = await supabase.from('ghost_entries').update({ avatar_url: publicUrlData.publicUrl }).eq('id', canonical.id)
    if (dbErr) { setSaveError(dbErr.message); setUploading(false); return }

    setCanonical({ ...canonical, avatar_url: publicUrlData.publicUrl })
    setUploading(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>
  if (notFound || !ghost || !canonical) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>no profile found.</div>

  const channelInfoChanged = channelName !== (canonical.channel_name || '') || channelUrl !== (canonical.channel_url || '')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' as const, flexShrink: 0 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#f0f0ed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)',
          }}>
            {canonical.avatar_url
              ? <img src={canonical.avatar_url} alt={ghost.name} style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
              : <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#bbb' }}>{ghost.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          {canEdit && (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              title="change photo"
              style={{
                position: 'absolute' as const, bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%',
                background: '#111', color: 'white', border: '2px solid white', fontSize: '11px', cursor: uploading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
              }}>
              {uploading ? '…' : '✎'}
            </button>
          )}
          {canEdit && <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />}
        </div>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 2 }}>{ghost.name}<span style={{ color: '#bbb', fontWeight: 400 }}>*</span></h1>
          {poolName && <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>plays in {poolName}</p>}
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem', border: '1px solid var(--border)', padding: '0.85rem 1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.6rem' }}>
          channel
        </div>
        {canEdit ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="channel name"
                style={{ fontSize: '0.85rem', padding: '6px 10px', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white', color: '#111' }} />
              <input value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="channel url (youtube.com/@...)"
                style={{ fontSize: '0.85rem', padding: '6px 10px', border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white', color: '#111' }} />
            </div>
            {channelInfoChanged && (
              <button onClick={saveChannelInfo} disabled={saving}
                style={{ marginTop: 8, fontSize: '0.78rem', padding: '5px 12px', border: '1px solid #C8102E', background: '#C8102E', color: 'white', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'saving…' : 'save'}
              </button>
            )}
            {saveError && <p style={{ color: '#C8102E', fontSize: '0.72rem', marginTop: 6 }}>{saveError}</p>}
          </>
        ) : canonical.channel_name || canonical.channel_url ? (
          <div>
            {canonical.channel_name && <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{canonical.channel_name}</div>}
            {canonical.channel_url && (
              <a href={canonical.channel_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#C8102E' }}>
                {canonical.channel_url}
              </a>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#bbb' }}>no channel info added yet.</p>
        )}
      </div>

      <p style={{ fontSize: '0.7rem', color: '#bbb', marginBottom: '1.5rem' }}>
        * predictions are inputted by the admin based on weekly video predictions.
      </p>

      {ghost.pool_id
        ? <RecordPanel targetUserId={ghost.id} poolIds={[ghost.pool_id]} subjectLabel={ghost.name} viewerId={viewerId || ''} />
        : <div style={{ textAlign: 'center', padding: '3rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>no pool found for this entry.</div>}
    </div>
  )
}
