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
    { emoji: '🥊', name: 'MMA', tag: mmaTag.kind, label: mmaTag.label },
    { emoji: '🏈', name: 'NFL 2026/27', tag: nflTag.kind, label: nflTag.label },
  ]

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
          A private prediction pool for your friends, family, or coworkers. Set your own rules, invite your group with a link, and watch picks score automatically once games kick off. Premier League, F1, MMA, and more. Free, no ads, no nonsense.
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
            {competitions.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: '1.1rem' }}>{s.emoji}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{s.name}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: TAG_STYLE[s.tag].color, background: TAG_STYLE[s.tag].bg, padding: '2px 8px', borderRadius: 4 }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', marginBottom: '1rem', marginTop: '1.5rem' }}>coming soon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { emoji: '⚾', name: 'MLB Playoffs' },
              { emoji: '🏈', name: 'NCAA Football' },
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

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
          <a href={`https://venmo.com/fred-krynen?txn=pay&note=${encodeURIComponent("Support pool'em")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button style={{ fontSize: '0.75rem', fontWeight: 600, padding: '6px 14px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer', borderRadius: 6 }}>
              💛 donate
            </button>
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
