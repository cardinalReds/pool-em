export default function TermsPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 680, margin: '0 auto', padding: '60px 24px', fontSize: '14px', lineHeight: 1.8, color: '#333' }}>
      <a href="/" style={{ fontSize: '13px', fontWeight: 700, color: '#111', textDecoration: 'none' }}>pool'em</a>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>Terms & Conditions</h1>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '40px' }}>Last updated: July 22, 2026</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>1. Acceptance of Terms</h2>
      <p>By creating an account or using pool'em ("the Service"), you agree to these Terms & Conditions. If you do not agree, do not use the Service.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>2. Description of Service</h2>
      <p>pool'em is a sports prediction platform that allows users to create and join prediction pools for soccer tournaments. Users make predictions on match outcomes and earn points based on accuracy.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>3. Accounts</h2>
      <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account and all activity that occurs under it. Notify us immediately at <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a> if you believe your account has been compromised.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>4. Text Message Program</h2>
      <p><strong>Program name</strong>: pool'em Notifications</p>
      <p><strong>Description</strong>: Match kickoff reminders and pool invite notifications for users who opt in.</p>
      <p><strong>Message frequency</strong>: Varies based on your pool activity. Typically 1-3 messages per match day.</p>
      <p><strong>Message & data rates</strong>: Standard message and data rates may apply depending on your carrier plan.</p>
      <p><strong>Opt-out</strong>: Reply <strong>STOP</strong> to any message to unsubscribe. You will receive a confirmation and no further messages will be sent.</p>
      <p><strong>Help</strong>: Reply <strong>HELP</strong> for help or contact us at <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>.</p>
      <p>Supported carriers include but are not limited to: AT&T, Verizon, T-Mobile, Sprint, and other major US carriers.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>5. User Conduct</h2>
      <p>You agree not to use the Service to:</p>
      <ul style={{ paddingLeft: '20px' }}>
        <li>Violate any applicable laws or regulations</li>
        <li>Impersonate another person</li>
        <li>Interfere with or disrupt the Service</li>
        <li>Attempt to gain unauthorized access to any part of the Service</li>
      </ul>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>6. Disclaimers</h2>
      <p>The Service is provided "as is" without warranties of any kind. We do not guarantee the accuracy of match scores, predictions, or points calculations. We are not responsible for any losses arising from your use of the Service.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>7. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, pool'em and Cardinal Reds LLC shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>8. Changes to Terms</h2>
      <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>9. Contact</h2>
      <p>Questions about these terms? Contact us at <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>.</p>

      <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #eee', fontSize: '12px', color: '#aaa' }}>
        <a href="/privacy" style={{ color: '#aaa' }}>Privacy Policy</a> · <a href="/" style={{ color: '#aaa' }}>pool'em</a>
      </div>
    </div>
  )
}
