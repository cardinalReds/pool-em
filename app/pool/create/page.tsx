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

    // Generate invite code
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data, error } = await supabase
      .from('pools')
      .insert({
        name,
        sport: 'world_cup',
        package_id: packageId,
        tournament_scope: scope,
        deadline_type: deadlineType,
        invite_code: inviteCode,
        admin_id: user.id,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Also add admin as a member
      await supabase.from('pool_members').insert({
        pool_id: data.id,
        user_id: user.id,
        display_name: user.user_metadata?.display_name || 'Admin',
      })
      router.push(`/pool/${data.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-5xl text-chalk tracking-wider mb-1">CREATE A POOL</h1>
        <p style={{color: 'var(--chalk-dim)'}}>FIFA World Cup 2026</p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-10">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className="h-1 flex-1 transition-all"
            style={{background: s <= step ? 'var(--turf)' : 'rgba(245,240,232,0.1)'}}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="card">
          <h2 className="font-display text-2xl text-chalk tracking-wider mb-6">NAME YOUR POOL</h2>
          <input
            className="input-chalk text-xl"
            placeholder="e.g. The Office Sweepstakes"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
          />
          <p className="text-xs mt-2" style={{color: 'var(--chalk-dim)'}}>This is what your crew will see when they join.</p>
          <div className="flex justify-end mt-8">
            <button
              className="btn-turf"
              onClick={() => setStep(2)}
              disabled={!name.trim()}
            >
              NEXT →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2 className="font-display text-2xl text-chalk tracking-wider mb-2">PICK YOUR PACKAGE</h2>
          <p className="text-sm mb-6" style={{color: 'var(--chalk-dim)'}}>This sets the rules everyone plays by.</p>

          <div className="flex flex-col gap-3">
            {Object.values(RULE_PACKAGES).map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setPackageId(pkg.id)}
                className="text-left p-4 border transition-all"
                style={{
                  background: packageId === pkg.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                  borderColor: packageId === pkg.id ? 'var(--turf)' : 'rgba(245,240,232,0.15)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-lg tracking-wider" style={{color: packageId === pkg.id ? 'var(--turf-bright)' : 'var(--chalk)'}}>
                    {pkg.name}
                  </span>
                  <div className="flex gap-2">
                    {pkg.scoring.correct_result > 0 && (
                      <span className="badge text-xs" style={{color: 'var(--chalk-dim)'}}>
                        +{pkg.scoring.correct_result} result
                      </span>
                    )}
                    {pkg.scoring.correct_first_scorer > 0 && (
                      <span className="badge text-xs text-amber-400">
                        +{pkg.scoring.correct_first_scorer} scorer
                      </span>
                    )}
                    {pkg.scoring.correct_exact_score > 0 && (
                      <span className="badge text-xs text-turf-400">
                        +{pkg.scoring.correct_exact_score} exact
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm" style={{color: 'var(--chalk-dim)'}}>{pkg.description}</p>
              </button>
            ))}
          </div>

          <div className="flex justify-between mt-8">
            <button className="btn-ghost" onClick={() => setStep(1)}>← BACK</button>
            <button className="btn-turf" onClick={() => setStep(3)}>NEXT →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2 className="font-display text-2xl text-chalk tracking-wider mb-6">TOURNAMENT SETTINGS</h2>

          <div className="mb-6">
            <label className="block text-xs font-display tracking-widest mb-3" style={{color: 'var(--chalk-dim)'}}>
              TOURNAMENT SCOPE
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'group_stage', label: 'Group Stage', desc: 'Matchday 1–3 only' },
                { id: 'knockout', label: 'Knockouts', desc: 'Round of 32 onwards' },
                { id: 'full', label: 'Full Tournament', desc: 'Start to finish' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setScope(opt.id)}
                  className="p-3 border text-left transition-all"
                  style={{
                    background: scope === opt.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                    borderColor: scope === opt.id ? 'var(--turf)' : 'rgba(245,240,232,0.15)',
                  }}
                >
                  <div className="font-display tracking-wider text-sm" style={{color: scope === opt.id ? 'var(--turf-bright)' : 'var(--chalk)'}}>
                    {opt.label}
                  </div>
                  <div className="text-xs mt-1" style={{color: 'var(--chalk-dim)'}}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-xs font-display tracking-widest mb-3" style={{color: 'var(--chalk-dim)'}}>
              PREDICTION DEADLINE
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'before_each_game', label: 'Before Each Game', desc: 'Picks lock at kickoff' },
                { id: 'before_tournament', label: 'Before Tournament', desc: 'All picks upfront' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDeadlineType(opt.id)}
                  className="p-3 border text-left transition-all"
                  style={{
                    background: deadlineType === opt.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                    borderColor: deadlineType === opt.id ? 'var(--turf)' : 'rgba(245,240,232,0.15)',
                  }}
                >
                  <div className="font-display tracking-wider text-sm" style={{color: deadlineType === opt.id ? 'var(--turf-bright)' : 'var(--chalk)'}}>
                    {opt.label}
                  </div>
                  <div className="text-xs mt-1" style={{color: 'var(--chalk-dim)'}}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 mb-4">{error}</p>
          )}

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(2)}>← BACK</button>
            <button className="btn-turf" onClick={handleCreate} disabled={loading}>
              {loading ? 'CREATING...' : 'CREATE POOL →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
