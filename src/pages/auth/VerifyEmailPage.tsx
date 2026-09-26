import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

export default function VerifyEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Link to="/" className="logo">
          <span className="logo-mark">E</span>Enigtee<span className="logo-accent">World</span>
        </Link>
      </div>

      <div className="auth-card">
        <div className="icon-box">
          <MailCheck />
        </div>
        <span className="eyebrow">One more step</span>
        <h1>Verify your email</h1>
        <p>
          We sent a verification link{email ? ` to ${email}` : ''}. Open it to activate your account, then sign in to
          reach your workspace.
        </p>

        <p className="muted demo-note">
          Didn't receive it? Check your spam folder, or try registering again with a different address.
        </p>

        <div className="auth-links">
          <Link to="/login">Go to sign in</Link>
          <Link to="/">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
