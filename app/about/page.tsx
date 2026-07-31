export default function AboutPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem' }}>
        <a href="/" style={{ fontWeight: 700, fontSize: '1.4rem', color: 'var(--red)', textDecoration: 'none' }}>pool'em</a>
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '60px 24px', fontSize: '14px', lineHeight: 1.8, color: '#333' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>About</h1>

      <p>pool'em is a platform for hosting prediction pools with your friends, family, or coworkers — think of it as an office pool maker, but built for more than one bracket a year. Set your own rules, invite your group with a private link, and follow along as picks score automatically once games kick off.</p>

      <p>We built it because running a pool with a group chat and a spreadsheet always got messy. pool'em is built and run by a couple of Stanford graduates.</p>

      <h2 style={{ fontSize: '17px', fontWeight: 700, marginTop: '36px', marginBottom: '12px' }}>What kind of pool is this?</h2>
      <p>A free, non-gambling pool — there's no sportsbook, no odds, and pool'em never takes a cut. You're not betting against a house; you're picking against your group, and the leaderboard settles it. If your group wants to add a friendly buy-in on top (like a lot of office pools do), that's between you and them — pool'em just tracks who owes what.</p>

      <h2 style={{ fontSize: '17px', fontWeight: 700, marginTop: '36px', marginBottom: '12px' }}>Who's it for?</h2>
      <p>However your group actually plays. Some pools are invite-only — you join because a friend sent you a link, full stop. Some people build a pool for their whole friend group or family and run it year after year, competition after competition. pool'em doesn't force one shape onto every group.</p>

      <p style={{ color: '#888', fontSize: '13px', marginTop: '32px' }}>
        Questions or feedback? <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>
      </p>
      </div>
    </div>
  )
}
