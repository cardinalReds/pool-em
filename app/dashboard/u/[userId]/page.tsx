'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import RecordPanel from '@/components/RecordPanel'
import { findOrCreateConversation } from '@/lib/dm'

interface SharedPool { id: string; name: string; sport: string }

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const targetUserId = params.userId as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [sharedPools, setSharedPools] = useState<SharedPool[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [messaging, setMessaging] = useState(false)
  const [messageError, setMessageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isSelf = viewerId === targetUserId

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setViewerId(user.id)

      const { data: profile } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', targetUserId).maybeSingle()
      if (!profile) { setNotFound(true); setLoading(false); return }
      setDisplayName(profile.display_name)
      setAvatarUrl(profile.avatar_url)

      // Shared pools only — the viewer's own pools intersected with the target's. Same
      // privacy boundary as RecordPanel: never surface a pool the viewer isn't in.
      const [{ data: viewerAdmin }, { data: viewerMember }, { data: targetAdmin }, { data: targetMember }] = await Promise.all([
        supabase.from('pools').select('id').eq('admin_id', user.id),
        supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
        supabase.from('pools').select('id').eq('admin_id', targetUserId),
        supabase.from('pool_members').select('pool_id').eq('user_id', targetUserId),
      ])
      const viewerPoolIds = new Set([...(viewerAdmin || []).map(p => p.id), ...(viewerMember || []).map(m => m.pool_id)])
      const targetPoolIds = new Set([...(targetAdmin || []).map(p => p.id), ...(targetMember || []).map(m => m.pool_id)])
      const shared = [...viewerPoolIds].filter(id => targetPoolIds.has(id))

      if (shared.length > 0) {
        const { data: poolsData } = await supabase.from('pools').select('id, name, sport').in('id', shared)
        setSharedPools((poolsData || []).sort((a, b) => a.name.localeCompare(b.name)))
      }

      setLoading(false)
    }
    load()
  }, [targetUserId, router])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !viewerId) return
    if (!file.type.startsWith('image/')) { setUploadError('please choose an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('image must be under 5MB'); return }

    setUploading(true)
    setUploadError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${viewerId}/avatar-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setUploadError(uploadErr.message); setUploading(false); return }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrlData.publicUrl }).eq('id', viewerId)
    if (dbErr) { setUploadError(dbErr.message); setUploading(false); return }

    setAvatarUrl(publicUrlData.publicUrl)
    setUploading(false)
  }

  async function handleMessage() {
    if (!viewerId || messaging) return
    setMessaging(true)
    setMessageError('')
    const supabase = createClient()
    const result = await findOrCreateConversation(supabase, viewerId, targetUserId)
    setMessaging(false)
    if ('error' in result) { setMessageError(result.error); return }
    router.push(`/dashboard/messages/${result.id}`)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>loading...</div>
  if (notFound) return <div style={{ padding: '2rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>no profile found.</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' as const, flexShrink: 0 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#f0f0ed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
              : <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#bbb' }}>{displayName.slice(0, 1).toUpperCase()}</span>}
          </div>
          {isSelf && (
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
          {isSelf && <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />}
        </div>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 2 }}>{displayName}</h1>
          {uploadError && <p style={{ color: '#C8102E', fontSize: '0.75rem' }}>{uploadError}</p>}
          {!isSelf && sharedPools.length > 0 && (
            <>
              <button onClick={handleMessage} disabled={messaging}
                style={{ fontSize: '0.78rem', padding: '4px 10px', border: '1px solid #C8102E', background: 'white', color: '#C8102E', cursor: messaging ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                {messaging ? 'opening…' : 'message'}
              </button>
              {messageError && <p style={{ color: '#C8102E', fontSize: '0.72rem', marginTop: 4 }}>{messageError}</p>}
            </>
          )}
        </div>
      </div>

      {sharedPools.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bbb', marginBottom: '0.4rem' }}>
            {isSelf ? 'your pools' : 'pools you share'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.4rem' }}>
            {sharedPools.map(p => (
              <a key={p.id} href={`/pool/${p.id}`}
                style={{ fontSize: '0.78rem', padding: '4px 10px', border: '1px solid var(--border)', background: 'white', color: '#555', textDecoration: 'none' }}>
                {p.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {sharedPools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', borderTop: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          {isSelf ? "you're not in any pools yet." : "you don't share a pool with this person, so there's nothing to show."}
        </div>
      ) : (
        <RecordPanel targetUserId={targetUserId} poolIds={sharedPools.map(p => p.id)} subjectLabel={isSelf ? 'you' : displayName} />
      )}
    </div>
  )
}
