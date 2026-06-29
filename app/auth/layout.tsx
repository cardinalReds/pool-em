export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column'}}>
      <div style={{borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem'}}>
        <a href="/"><img src="/logo.svg" alt="pool'em" style={{height: 28}} /></a>
      </div>
      <div style={{flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', paddingTop: '3rem'}}>
        <div style={{width: '100%', maxWidth: 380}}>
          {children}
        </div>
      </div>
    </div>
  )
}
