export default function PrivacyPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'white', padding: '0.75rem 1.25rem' }}>
        <a href="/" style={{ fontWeight: 700, fontSize: '1.4rem', color: 'var(--red)', textDecoration: 'none' }}>pool'em</a>
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '60px 24px', fontSize: '14px', lineHeight: 1.8, color: '#333' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Privacy Policy</h1>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '40px' }}>Last updated: June 7, 2026</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>1. Information We Collect</h2>
      <p>When you use pool'em, we collect the following information:</p>
      <ul style={{ paddingLeft: '20px' }}>
        <li><strong>Account information</strong>: your email address and display name when you create an account.</li>
        <li><strong>Phone number</strong>: if you opt in to receive text message notifications.</li>
        <li><strong>Prediction data</strong>: your match predictions and scores within pools you join.</li>
        <li><strong>Usage data</strong>: basic analytics about how you use the app (pages visited, actions taken).</li>
      </ul>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul style={{ paddingLeft: '20px' }}>
        <li>Provide and operate the pool'em service</li>
        <li>Send match kickoff reminders via text message (only if you opt in)</li>
        <li>Send pool invite messages when a friend invites you to join their pool</li>
        <li>Calculate and display leaderboard scores</li>
        <li>Improve the app and fix bugs</li>
      </ul>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>3. Text Message Notifications</h2>
      <p>If you provide your phone number and opt in to text notifications, you agree to receive SMS messages from pool'em including match reminders and pool invites. Message and data rates may apply. You can opt out at any time by replying <strong>STOP</strong> to any message. Reply <strong>HELP</strong> for help. Message frequency varies based on your pool activity.</p>
      <p>We use Twilio to send text messages. Your phone number is used solely for sending notifications you have opted into and is not shared with third parties for marketing purposes.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>4. Information Sharing</h2>
      <p>We do not sell your personal information. We share your information only in the following limited circumstances:</p>
      <ul style={{ paddingLeft: '20px' }}>
        <li><strong>With other pool members</strong>: your display name and predictions are visible to other members of pools you join, after match kickoff.</li>
        <li><strong>Service providers</strong>: we use Supabase (database), Twilio (SMS), and Resend (email) to operate the service. These providers process your data only as necessary to provide their services.</li>
        <li><strong>Legal requirements</strong>: if required by law or to protect our rights.</li>
      </ul>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>5. Data Retention</h2>
      <p>We retain your account data for as long as your account is active. You can request deletion of your account and associated data at any time by contacting us.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>6. Security</h2>
      <p>We use industry-standard security practices including encrypted connections (HTTPS) and secure authentication. However, no method of transmission over the internet is 100% secure.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>7. Children's Privacy</h2>
      <p>pool'em is not directed at children under 13. We do not knowingly collect personal information from children under 13.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>8. Changes to This Policy</h2>
      <p>We may update this privacy policy from time to time. We will notify you of significant changes by posting the new policy on this page with an updated date.</p>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginTop: '32px', marginBottom: '8px' }}>9. Contact</h2>
      <p>If you have questions about this privacy policy or your data, contact us at <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>.</p>
      <p style={{ marginTop: '8px' }}>
        Cardinal Reds<br />
        San Luis Obispo, CA<br />
        <a href="mailto:fred@cardinalreds.com" style={{ color: '#C8102E' }}>fred@cardinalreds.com</a>
      </p>

      <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #eee', fontSize: '12px', color: '#aaa' }}>
        <a href="/terms" style={{ color: '#aaa' }}>Terms & Conditions</a> · <a href="/" style={{ color: '#aaa' }}>pool'em</a>
      </div>
      </div>
    </div>
  )
}
