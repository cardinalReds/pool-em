export default function AboutPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 680, margin: '0 auto', padding: '60px 24px', fontSize: '14px', lineHeight: 1.8, color: '#333' }}>
      <a href="/" style={{ fontSize: '13px', fontWeight: 700, color: '#111', textDecoration: 'none' }}>pool'em</a>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginTop: '32px', marginBottom: '24px' }}>About</h1>

      <p>pool'em is a platform for hosting private prediction pools with your friends, family, or coworkers. Set your own rules, invite your group with a private link, and follow along as picks score automatically once games kick off.</p>

      <p>We built it because running a pool with a group chat and a spreadsheet always got messy. pool'em is built and run by a couple of Stanford graduates.</p>

      <p style={{ color: '#888', fontSize: '13px', marginTop: '32px' }}>
        Questions or feedback? <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>
      </p>
    </div>
  )
}
