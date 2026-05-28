import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background pitch lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/5" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/5" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <span className="font-display text-3xl text-turf-400 tracking-widest">POOL'EM</span>
        <div className="flex gap-3">
          <Link href="/auth/login">
            <button className="btn-ghost text-sm py-2 px-5">LOG IN</button>
          </Link>
          <Link href="/auth/signup">
            <button className="btn-turf text-sm py-2 px-5">SIGN UP</button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-block badge text-turf-400 mb-6">
          FIFA WORLD CUP 2026
        </div>

        <h1 className="font-display text-7xl md:text-9xl text-chalk mb-4 leading-none tracking-wide">
          YOUR POOL.<br />
          <span className="text-turf-400">YOUR RULES.</span>
        </h1>

        <p className="text-chalk-dim text-lg md:text-xl max-w-xl mb-12 leading-relaxed" style={{color: 'var(--chalk-dim)'}}>
          Private prediction pools for you and your crew. Pick winners, call scorers, 
          settle debates. No house. No rake. Just bragging rights.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/auth/signup">
            <button className="btn-turf text-lg px-10 py-4">CREATE A POOL</button>
          </Link>
          <Link href="/auth/login">
            <button className="btn-ghost text-lg px-10 py-4">JOIN A POOL</button>
          </Link>
        </div>

        {/* Feature strip */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-px w-full max-w-3xl chalk-line">
          {[
            { label: 'Pick Your Package', desc: 'WLD, exact scores, first scorers — choose your flavor' },
            { label: 'Invite Your Crew', desc: 'Private pools, shareable link, no account spam' },
            { label: 'Live Leaderboard', desc: 'Points update as goals go in. No manual work.' },
          ].map((f) => (
            <div key={f.label} className="card-dark p-8 text-left">
              <div className="font-display text-xl text-turf-400 mb-2 tracking-wider">{f.label}</div>
              <p className="text-sm leading-relaxed" style={{color: 'var(--chalk-dim)'}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs" style={{color: 'var(--chalk-dim)', opacity: 0.4}}>
        POOL'EM · FOR THE BEAUTIFUL GAME
      </footer>
    </main>
  )
}
