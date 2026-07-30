import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  // Every sport supports pool creation right now, but "live" only means something once
  // the underlying season has actually kicked off — PL/NFL pools can be set up months
  // before a ball's kicked, while F1 pools are being created mid-season. MMA has no
  // season at all (each tournament row is one card), so instead of a vague "ongoing
  // events" label, name the actual next card — or say plainly that none is scheduled.
  const [
    { data: plStarted }, { data: plEarliest },
    { data: nflStarted }, { data: nflEarliest },
    { data: f1Started }, { data: f1Earliest },
    { data: nextMma },
  ] = await Promise.all([
    supabase.from('fixtures').select('id').eq('tournament_id', 'pl_2026').neq('status', 'NS').limit(1),
    supabase.from('fixtures').select('date').eq('tournament_id', 'pl_2026').order('date', { ascending: true }).limit(1),
    supabase.from('fixtures').select('id').eq('tournament_id', 'nfl_2026').neq('status', 'NS').limit(1),
    supabase.from('fixtures').select('date').eq('tournament_id', 'nfl_2026').order('date', { ascending: true }).limit(1),
    supabase.from('f1_sessions').select('id').eq('tournament_id', 'f1_2026').eq('status', 'Completed').limit(1),
    supabase.from('f1_sessions').select('date').eq('tournament_id', 'f1_2026').order('date', { ascending: true }).limit(1),
    supabase.from('tournaments').select('name, event_date').eq('sport', 'mma').eq('status', 'active').gte('event_date', new Date().toISOString()).order('event_date', { ascending: true }).limit(1),
  ])

  const TAG_STYLE: Record<string, { color: string; bg: string }> = {
    'live': { color: '#2d7a2d', bg: '#f0faf0' },
    'pools open': { color: '#1a56db', bg: '#eef3fe' },
    'next event': { color: '#9a6b00', bg: '#fdf6e3' },
    'no event scheduled': { color: '#aaa', bg: '#f5f5f5' },
  }

  function startTag(started: boolean, earliestDate: string | undefined) {
    if (started) return { kind: 'live', label: 'live' }
    const dateLabel = earliestDate
      ? new Date(earliestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      : null
    return {
      kind: 'pools open',
      label: dateLabel ? `start your pools now, competition starts ${dateLabel}` : 'start your pools now',
    }
  }

  const plTag = startTag(!!plStarted?.length, plEarliest?.[0]?.date)
  const nflTag = startTag(!!nflStarted?.length, nflEarliest?.[0]?.date)
  const f1Tag = startTag(!!f1Started?.length, f1Earliest?.[0]?.date)

  const mmaEvent = nextMma?.[0]
  const mmaTag = mmaEvent
    ? { kind: 'next event', label: `next: ${mmaEvent.name} · ${new Date(mmaEvent.event_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` }
    : { kind: 'no event scheduled', label: 'no event scheduled' }

  const competitions = [
    { emoji: '⚽', name: 'Premier League 2026/27', tag: plTag.kind, label: plTag.label },
    { emoji: '🏎️', name: 'Formula 1 2026', tag: f1Tag.kind, label: f1Tag.label },
    { emoji: '🥊', name: 'UFC', tag: mmaTag.kind, label: mmaTag.label },
    { emoji: '🏈', name: 'NFL 2026/27', tag: nflTag.kind, label: nflTag.label },
  ]

  const paths = [
    { title: 'got invited to a pool?', desc: "log in and it'll be waiting on your dashboard.", cta: 'log in', href: '/auth/login' },
    { title: 'looking for a pool to join?', desc: 'browse open pools anyone can join, no invite needed.', cta: 'browse pools', href: '/auth/signup' },
    { title: 'want to run one for your group?', desc: 'set your own rules, then decide who gets in — invite-only or open to everyone.', cta: 'create a pool', href: '/auth/signup' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontSize: '14px' }}>
      {/* Nav */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--red)' }}>pool'em</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/auth/login"><button className="btn-ghost" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.8rem' }}>log in</button></Link>
          <Link href="/auth/signup"><button className="btn-primary" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.8rem' }}>sign up</button></Link>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 1.25rem 3rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', lineHeight: 1.3 }}>
          Build a pool. Predict with your friends. Keep score.
        </h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2.5rem', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 520 }}>
          A free, non-gambling prediction pool — pick your own rules, invite-only or open to anyone, and every result scores automatically. World Cup, Premier League, F1, UFC, NFL.
        </p>

        <div style={{ marginBottom: '3rem' }}>
          {paths.map((p, i) => (
            <div key={p.title} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const,
              padding: '0.9rem 0', borderTop: i === 0 ? '1px solid var(--border)' : '1px solid var(--border-light)',
              borderBottom: i === paths.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.title}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.15rem' }}>{p.desc}</div>
              </div>
              <Link href={p.href}>
                <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 38, whiteSpace: 'nowrap' as const }}>{p.cta}</button>
              </Link>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '3rem' }}>
          <div className="section-label" style={{ marginBottom: '1rem' }}>available now</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {competitions.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: '1.1rem' }}>{s.emoji}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{s.name}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: TAG_STYLE[s.tag].color, background: TAG_STYLE[s.tag].bg, padding: '2px 8px', borderRadius: 4 }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginBottom: '1rem', marginTop: '1.5rem' }}>coming soon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { emoji: '⚾', name: 'MLB Playoffs' },
              { emoji: '🏈', name: 'NCAA Football' },
              { emoji: '🏀', name: 'NBA Playoffs' },
              { emoji: '⚽', name: 'Champions League 2026/27' },
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

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <a href={`https://venmo.com/fred-krynen?txn=pay&note=${encodeURIComponent("Support pool'em")}`} target="_blank" rel="noopener noreferrer">
            <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '5px 12px', minHeight: 32 }}>donate</button>
          </a>
        </div>
        <div style={{ paddingTop: '0.75rem', display: 'flex', gap: '1rem' }}>
          <Link href="/about" style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>about</Link>
          <Link href="/privacy" style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>privacy</Link>
          <Link href="/terms" style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>terms</Link>
        </div>
      </div>
    </div>
  )
}
