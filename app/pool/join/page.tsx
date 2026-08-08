'use client'

import { useState } from 'react'

export default function JoinByCodePage() {
  const [code, setCode] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    window.location.href = `/pool/join/${encodeURIComponent(trimmed)}`
  }

  return (
    <div style={{minHeight:'100vh',background:'#f7f7f5',fontFamily:"'Inter', system-ui, sans-serif",fontSize:'13px'}}>
      <div style={{background:'white',borderBottom:'1px solid var(--border)',padding:'0.5rem 1.25rem'}}>
        <a href="/dashboard" style={{fontWeight:700,fontSize:'1.4rem',color:'var(--red)',textDecoration:'none'}}>pool'em</a>
      </div>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',minHeight:'calc(100vh - 41px)'}}>
        <div style={{width:'100%',maxWidth:400}}>
          <div style={{background:'white',border:'1px solid #e0e0db',padding:'24px'}}>
            <h2 style={{fontWeight:700,fontSize:'18px',marginBottom:'6px'}}>join a pool</h2>
            <p style={{color:'#888',fontSize:'12px',marginBottom:'16px'}}>
              insert the code from your invite link — it's the letters and numbers right after the last slash.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="insert code, e.g. GN9WAL"
                style={{width:'100%',padding:'12px',fontSize:'16px',border:'1px solid #ddd',fontFamily:'inherit',marginBottom:'12px',boxSizing:'border-box' as const}}
              />
              <button type="submit" disabled={!code.trim()}
                style={{width:'100%',padding:'12px',fontSize:'14px',fontWeight:600,background:code.trim() ? '#111' : '#ccc',minHeight:'48px',color:'white',border:'none',cursor:code.trim() ? 'pointer' : 'default',fontFamily:'inherit'}}>
                find pool →
              </button>
            </form>

            <div style={{display:'flex',alignItems:'center',gap:'10px',margin:'18px 0'}}>
              <div style={{flex:1,borderTop:'1px solid #eee'}} />
              <span style={{fontSize:'11px',color:'#aaa'}}>already have an account?</span>
              <div style={{flex:1,borderTop:'1px solid #eee'}} />
            </div>
            <a href="/auth/login">
              <button style={{width:'100%',padding:'12px',fontSize:'14px',background:'white',minHeight:'48px',color:'#111',border:'1px solid #ddd',cursor:'pointer',fontFamily:'inherit'}}>
                log in
              </button>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
