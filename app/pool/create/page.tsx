'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { RULE_PACKAGES, type PackageId, type TournamentScope, type DeadlineType } from '@/types'

export default function CreatePoolPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [packageId, setPackageId] = useState<PackageId>('WLD')
  const [scope, setScope] = useState<TournamentScope>('full')
  const [deadlineType, setDeadlineType] = useState<DeadlineType>('before_each_game')

  async function handleCreate() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data, error } = await supabase.from('pools').insert({
      name, sport: 'world_cup', package_id: packageId,
      tournament_scope: scope, deadline_type: deadlineType,
      invite_code: inviteCode, admin_id: user.id, is_active: true,
    }).select().single()

    if (error) { setError(error.message); setLoading(false); return }

    await supabase.from('pool_members').insert({
      pool_id: data.id, user_id: user.id,
      display_name: user.user_metadata?.display_name || 'Admin',
    })
    window.location.href = `/pool/${data.id}`
  }

  const stepLabel = ['name', 'rules', 'settings']

  return (
    <div style={{maxWidth: 520, margin: '0 auto'}}>
      <div style={{marginBottom: '1.5rem'}}>
        <h1 style={{fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem'}}>new pool</h1>
        <p style={{color: 'var(--text-dim)', fontSize: '0.8rem'}}>FIFA World Cup 2026</p>
      </div>

      {/* Step indicator */}
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1.5rem'}}>
        {[1,2,3].map(s => (
          <div key={s} style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 600,
              background: s === step ? 'var(--red)' : s < step ? 'var(--text)' : 'transparent',
              color: s <= step ? 'white' : 'var(--text-faint)',
              border: `1px solid ${s <= step ? 'transparent' : 'var(--border)'}`,
            }}>{s}</div>
            <span style={{fontSize: '0.75rem', color: s === step ? 'var(--text)' : 'var(--text-faint)'}}>{stepLabel[s-1]}</span>
            {s < 3 && <span style={{color: 'var(--border)', marginLeft: '0.2rem'}}>→</span>}
          </div>
        ))}
      </div>

      <div className="card">
        {step === 1 && (
          <div>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '0.5rem'}}>what's this pool called?</label>
            <input className="input" placeholder="e.g. The Office World Cup" value={name} onChange={e => setName(e.target.value)} maxLength={50} autoFocus />
            <p style={{fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.4rem'}}>your friends will see this name when they join</p>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem'}}>
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!name.trim()}>next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <label style={{display: 'block', fontWeight: 600, marginBottom: '0.75rem'}}>pick a rule set</label>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
              {Object.values(RULE_PACKAGES).map(pkg => (
                <button key={pkg.id} onClick={() => setPackageId(pkg.id)}
                  style={{
                    textAlign: 'left', padding: '0.75rem', border: '1px solid',
                    borderColor: packageId === pkg.id ? 'var(--red)' : 'var(--border)',
                    background: packageId === pkg.id ? 'var(--red-light)' : 'white',
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem'}}>
                    <span style={{fontWeight: 600, fontSize: '0.875rem', color: packageId === pkg.id ? 'var(--red)' : 'var(--text)'}}>{pkg.name}</span>
                    <div style={{display: 'flex', gap: '0.4rem'}}>
                      {pkg.scoring.correct_result > 0 && <span style={{fontSize: '0.65rem', color: 'var(--text-dim)', border: '1px solid var(--border)', padding: '0.1rem 0.3rem'}}>+{pkg.scoring.correct_result} result</span>}
                      {pkg.scoring.correct_first_scorer > 0 && <span style={{fontSize: '0.65rem', color: 'var(--red)', border: '1px solid var(--red)', padding: '0.1rem 0.3rem'}}>+{pkg.scoring.correct_first_scorer} scorer</span>}
                      {pkg.scoring.correct_exact_score > 0 && <span style={{fontSize: '0.65rem', color: 'var(--text-dim)', border: '1px solid var(--border)', padding: '0.1rem 0.3rem'}}>+{pkg.scoring.correct_exact_score} exact</span>}
                    </div>
                  </div>
                  <p style={{fontSize: '0.75rem', color: 'var(--text-dim)'}}>{pkg.description}</p>
                </button>
              ))}
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem'}}>
              <button className="btn-ghost" onClick={() => setStep(1)}>← back</button>
              <button className="btn-primary" onClick={() => setStep(3)}>next →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{marginBottom: '1.25rem'}}>
              <label style={{display: 'block', fontWeight: 600, marginBottom: '0.6rem'}}>tournament scope</label>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem'}}>
                {([
                  {id: 'group_stage', label: 'group stage', desc: 'matchday 1–3'},
                  {id: 'knockout', label: 'knockouts', desc: 'round of 32+'},
                  {id: 'full', label: 'full tournament', desc: 'start to finish'},
                ] as const).map(opt => (
                  <button key={opt.id} onClick={() => setScope(opt.id)}
                    style={{
                      padding: '0.6rem', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                      borderColor: scope === opt.id ? 'var(--red)' : 'var(--border)',
                      background: scope === opt.id ? 'var(--red-light)' : 'white',
                    }}>
                    <div style={{fontWeight: 600, fontSize: '0.8rem', color: scope === opt.id ? 'var(--red)' : 'var(--text)'}}>{opt.label}</div>
                    <div style={{fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: '0.2rem'}}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom: '1.25rem'}}>
              <label style={{display: 'block', fontWeight: 600, marginBottom: '0.6rem'}}>prediction deadline</label>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem'}}>
                {([
                  {id: 'before_each_game', label: 'before each game', desc: 'picks lock at kickoff'},
                  {id: 'before_tournament', label: 'before tournament', desc: 'all picks upfront'},
                ] as const).map(opt => (
                  <button key={opt.id} onClick={() => setDeadlineType(opt.id)}
                    style={{
                      padding: '0.6rem', border: '1px solid', textAlign: 'left', cursor: 'pointer',
                      borderColor: deadlineType === opt.id ? 'var(--red)' : 'var(--border)',
                      background: deadlineType === opt.id ? 'var(--red-light)' : 'white',
                    }}>
                    <div style={{fontWeight: 600, fontSize: '0.8rem', color: deadlineType === opt.id ? 'var(--red)' : 'var(--text)'}}>{opt.label}</div>
                    <div style={{fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: '0.2rem'}}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && <p style={{fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-light)', padding: '0.5rem', marginBottom: '1rem'}}>{error}</p>}

            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <button className="btn-ghost" onClick={() => setStep(2)}>← back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}>{loading ? 'creating...' : 'create pool →'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
