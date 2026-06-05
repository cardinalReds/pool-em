export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 2rem'}}>
        <a href="/" style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)'}}>pool'em</a>
      </div>
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem'}}>
        <div style={{width: '100%', maxWidth: 380}}>
          {children}
        </div>
      </div>
    </div>
  )
}
