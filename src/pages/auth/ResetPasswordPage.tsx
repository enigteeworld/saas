import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { Logo } from '@/components/layouts/PublicLayout';

/**
 * Landing page for the link in the "reset your password" email. Supabase's
 * client (detectSessionInUrl: true) reads the recovery token from the URL
 * hash automatically and opens a temporary session - this page just needs to
 * collect a new password and call updateUser, then send them to sign in.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Give the client a moment to parse the recovery token out of the URL
    // hash and open the temporary session before we let the form submit.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const timer = window.setTimeout(() => setReady(true), 2500);

    return () => {
      subscription.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(errorMessage(updateError, 'Unable to reset your password. The link may have expired - request a new one.'));
      return;
    }

    setDone(true);
    window.setTimeout(() => navigate('/login'), 1800);
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Logo />
      </div>

      <div className="auth-card">
        <span className="eyebrow">Account recovery</span>
        <h1>Set a new password</h1>
        <p>Choose a new password for your account. You'll be asked to sign in again with it.</p>

        {!ready ? (
          <p className="muted demo-note">Opening your reset link...</p>
        ) : done ? (
          <p className="success-message">Password updated. Taking you to sign in...</p>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <label>
              New password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Re-enter your new password"
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save new password'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
