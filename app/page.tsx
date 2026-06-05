import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <span style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)'}}>pool'em</span>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <Link href="/auth/login"><button className="btn-ghost">log in</button></Link>
          <Link href="/auth/signup"><button className="btn-primary">sign up</button></Link>
        </div>
      </div>

      <div style={{maxWidth: 600, margin: '80px auto', padding: '0 1.5rem'}}>
        <h1 style={{fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem'}}>
          Private prediction pools for the World Cup.
        </h1>
        <p style={{color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '1rem', lineHeight: 1.6}}>
          Create a pool, set your rules, invite your friends. Picks lock at kickoff. 
          Leaderboard updates as goals go in. Free, no ads, no nonsense.
        </p>

        <div style={{display: 'flex', gap: '0.75rem', marginBottom: '3rem'}}>
          <Link href="/auth/signup"><button className="btn-primary" style={{padding: '0.6rem 1.5rem', fontSize: '0.95rem'}}>create a pool</button></Link>
          <Link href="/auth/login"><button className="btn-secondary" style={{padding: '0.6rem 1.5rem', fontSize: '0.95rem'}}>join a pool</button></Link>
        </div>

        <div style={{borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem'}}>
          {[
            { title: 'pick your rules', desc: 'Win/loss/draw, exact scores, first scorer — or build your own.' },
            { title: 'invite only', desc: 'Share a link. No spam, no public pools.' },
            { title: 'auto-scoring', desc: 'Results pulled from API. Points update live.' },
          ].map(f => (
            <div key={f.title}>
              <div style={{fontWeight: 600, marginBottom: '0.3rem', color: 'var(--red)'}}>{f.title}</div>
              <div style={{color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.5}}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{borderTop: '1px solid var(--border)', marginTop: '2rem', paddingTop: '1rem'}}>
          <span style={{fontSize: '0.75rem', color: 'var(--text-faint)'}}>FIFA World Cup 2026 · June 11 – July 19</span>
        </div>
      </div>
    </div>
  )
}
