import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Nav */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)' }}>pool'em</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/auth/login"><button className="btn-ghost" style={{ minHeight: 40, padding: '0 14px' }}>log in</button></Link>
          <Link href="/auth/signup"><button className="btn-primary" style={{ minHeight: 40, padding: '0 14px' }}>sign up</button></Link>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '56px 1.25rem 3rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.25rem)', fontWeight: 700, marginBottom: '0.75rem', lineHeight: 1.2 }}>
          Your group chat's prediction pool.
        </h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '1rem', lineHeight: 1.7, maxWidth: 480 }}>
          Set your own rules, invite your crew, score live. World Cup, F1, and more — all in one place. Free, no ads, no nonsense.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '3.5rem', flexWrap: 'wrap' }}>
          <Link href="/auth/signup">
            <button className="btn-primary" style={{ padding: '12px 28px', fontSize: '1rem', minHeight: 48 }}>create a pool</button>
          </Link>
          <Link href="/auth/login">
            <button className="btn-secondary" style={{ padding: '12px 28px', fontSize: '1rem', minHeight: 48 }}>join a pool</button>
          </Link>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { title: 'your rules', desc: 'Exact scores, first scorer, podium order, team to advance — pick what matters to your group.' },
            { title: 'invite only', desc: 'One link. Private pool. No strangers, no noise.' },
            { title: 'live scoring', desc: 'Results come in, points update automatically. Leaderboard don\'t lie.' },
          ].map(f => (
            <div key={f.title}>
              <div style={{ fontWeight: 600, marginBottom: '0.3rem', color: 'var(--red)' }}>{f.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', marginBottom: '1rem' }}>available now</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { emoji: '🏆', name: 'FIFA World Cup 2026', live: true },
              { emoji: '🏎️', name: 'Formula 1 2026', live: true },
              { emoji: '🥊', name: 'MMA', live: true },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{s.emoji}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{s.name}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#2d7a2d', background: '#f0faf0', padding: '2px 8px', borderRadius: 4 }}>live</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', marginBottom: '1rem', marginTop: '1.5rem' }}>coming soon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { emoji: '⚽', name: 'Premier League' },
              { emoji: '⚾', name: 'MLB Playoffs' },
              { emoji: '🏈', name: 'NCAA Football' },
              { emoji: '🏈', name: 'NFL' },
              { emoji: '🚴', name: 'Tour de France' },
              { emoji: '🎾', name: 'Tennis' },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{s.emoji}</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{s.name}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#aaa', background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>coming</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '1.1rem' }}>➕</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                Don't see your sport?{' '}
                <a href="mailto:fred@pool-em.com?subject=Competition request" style={{ color: 'var(--red)', textDecoration: 'none' }}>
                  request it here
                </a>
              </span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Free forever · No ads · No spam</span>
          <a href={`https://venmo.com/fred-krynen?txn=pay&note=${encodeURIComponent("Support pool'em")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button style={{ fontSize: '0.75rem', fontWeight: 600, padding: '6px 14px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer', borderRadius: 6 }}>
              💛 donate
            </button>
          </a>
        </div>
      </div>
    </div>
  )
}
