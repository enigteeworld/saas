import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, resetPassword } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setMessage('Demo mode: a reset link would be sent to this address once email is configured.');
      return;
    }

    setBusy(true);
    const { error } = await resetPassword(email);
    setBusy(false);
    setMessage(error ? error.message : 'If an account exists for this email, a reset link has been sent.');
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Link to="/" className="logo">
          <span className="logo-mark">E</span>Enigtee<span className="logo-accent">World</span>
        </Link>
      </div>

      <div className="auth-card">
        <span className="eyebrow">Account recovery</span>
        <h1>Reset your password</h1>
        <p>Enter the email address linked to your account and we will help you regain access.</p>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
          </label>
          {message ? <p className="muted demo-note">{message}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
          <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
