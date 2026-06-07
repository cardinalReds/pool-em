'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function JoinPoolPage({ params }: { params: { code: string } }) {
  const [pool, setPool] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      localStorage.setItem('pending_invite', params.code)
      const { data: pool, error } = await supabase
        .from('pools')
        .select('*')
        .eq('invite_code', params.code)
        .maybeSingle()
      if (error) { console.error('pool lookup error:', error); setNotFound(true); setLoading(false); return }
      if (!pool) { setNotFound(true); setLoading(false); return }
      setPool(pool)
      if (session?.user) {
        setUser(session.user)
        const { data: existing } = await supabase.from('pool_members').select('id').eq('pool_id', pool.id).eq('user_id', session.user.id).maybeSingle()
        if (existing) { localStorage.removeItem('pending_invite'); window.location.href = `/pool/${pool.id}`; return }
      }
      setLoading(false)
    }
    load()
  }, [params.code])

  async function handleJoin() {
    if (!user) { window.location.href = `/auth/signup?invite=${params.code}`; return }
    setJoining(true)
    const supabase = createClient()
    await supabase.from('pool_members').insert({
      pool_id: pool.id, user_id: user.id,
      display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Player',
    })
    localStorage.removeItem('pending_invite')
    window.location.href = `/pool/${pool.id}`
  }

  if (loading) return <div style={{minHeight:'100vh',background:'#f7f7f5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',color:'#888'}}>loading...</div>

  if (notFound) return (
    <div style={{minHeight:'100vh',background:'#f7f7f5',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'white',border:'1px solid #e0e0db',padding:'24px',maxWidth:360,textAlign:'center',fontSize:'13px'}}>
        <p style={{fontWeight:600,marginBottom:'6px'}}>invite link not found</p>
        <p style={{color:'#888'}}>double-check the link or ask the pool admin to resend it.</p>
      </div>
    </div>
  )

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0]
  const buyInAmount = pool?.buy_in_amount
  const venmoHandle = pool?.venmo_handle
  const hasBuyIn = !!(buyInAmount && venmoHandle)
  const venmoWebLink = hasBuyIn
    ? `https://venmo.com/${venmoHandle}?txn=pay&amount=${buyInAmount}&note=${encodeURIComponent(pool.name + ' buy-in')}`
    : null

  return (
    <div style={{minHeight:'100vh',background:'#f7f7f5',fontFamily:"'Inter', system-ui, sans-serif",fontSize:'13px'}}>
      <div style={{background:'#111',color:'white',padding:'10px 20px'}}>
        <span style={{fontWeight:700,fontSize:'13px'}}>pool'em</span>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'60px 24px'}}>
        <div style={{width:400}}>
          <div style={{background:'white',border:'1px solid #e0e0db',padding:'20px',marginBottom:'12px'}}>
            <p style={{fontSize:'10px',fontWeight:600,color:'#C8102E',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'6px'}}>you've been invited</p>
            <h2 style={{fontWeight:700,fontSize:'18px',marginBottom:'4px'}}>{pool.name}</h2>
            <p style={{color:'#888',fontSize:'11px'}}>{pool.tournament_scope?.replace('_',' ')} · {pool.package_id?.replace('_',' ')}</p>
          </div>

          {hasBuyIn && (
            <div style={{background:'#fffbf0',border:'1px solid #f0e0a0',padding:'16px',marginBottom:'12px'}}>
              <p style={{fontWeight:600,marginBottom:'4px'}}>💰 this pool has a ${buyInAmount} buy-in</p>
              <p style={{fontSize:'11px',color:'#666',marginBottom:'12px'}}>
                send payment to <strong>@{venmoHandle}</strong> on venmo. the admin will confirm your payment.
              </p>
              <a href={venmoWebLink || '#'} target="_blank" rel="noopener noreferrer">
                <button style={{width:'100%',padding:'10px',fontSize:'13px',fontWeight:600,background:'#3D95CE',color:'white',border:'none',cursor:'pointer',fontFamily:'inherit',marginBottom:'6px'}}>
                  pay ${buyInAmount} via venmo →
                </button>
              </a>
              <p style={{fontSize:'10px',color:'#aaa',textAlign:'center'}}>
                you can still join without paying — but the admin may remove you
              </p>
            </div>
          )}

          <div style={{background:'white',border:'1px solid #e0e0db',padding:'20px'}}>
            {user ? (
              <div>
                <p style={{marginBottom:'12px',color:'#555'}}>joining as <strong style={{color:'#111'}}>{displayName}</strong></p>
                <button onClick={handleJoin} disabled={joining}
                  style={{width:'100%',padding:'10px',fontSize:'13px',fontWeight:600,background:'#111',color:'white',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                  {joining ? 'joining...' : 'join pool →'}
                </button>
              </div>
            ) : (
              <div>
                <p style={{marginBottom:'12px',color:'#555'}}>create an account or log in to join.</p>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  <a href={`/auth/signup?invite=${params.code}`}>
                    <button style={{width:'100%',padding:'10px',fontSize:'13px',fontWeight:600,background:'#111',color:'white',border:'none',cursor:'pointer',fontFamily:'inherit'}}>create account</button>
                  </a>
                  <a href={`/auth/login?invite=${params.code}`}>
                    <button style={{width:'100%',padding:'10px',fontSize:'13px',background:'white',color:'#111',border:'1px solid #ddd',cursor:'pointer',fontFamily:'inherit'}}>log in</button>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
