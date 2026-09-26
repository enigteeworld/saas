import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { isSupabaseConfigured, signIn } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole } from '@/routes/routeConfig';
import type { UserRole } from '@/types';

const roles: UserRole[] = ['employee', 'employer'];

export default function LoginPage() {
  const navigate = useNavigate();
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  const [role, setRole] = useState<UserRole>('employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add the EnigteeWorld environment variables before signing in.');
      return;
    }

    setBusy(true);
    const { error: signInError } = await signIn(email, password);
    setBusy(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    await initializeAuth();
    const current = useAuthStore.getState().user;
    navigate(homeForRole(current?.role ?? role), { replace: true });
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Link to="/" className="logo">
          <span className="logo-mark">E</span>Enigtee<span className="logo-accent">World</span>
        </Link>
        <p>Recruitment and workforce management.</p>
      </div>

      <div className="auth-card">
        <span className="eyebrow">Welcome back</span>
        <h1>Sign in to your workspace</h1>
        <p>Continue where you left off.</p>

        <div className="role-switch">
          {roles.map((option) => (
            <button
              type="button"
              key={option}
              className={role === option ? 'active' : ''}
              onClick={() => setRole(option)}
            >
              {option === 'employer' ? 'Employer' : 'Job seeker'}
            </button>
          ))}
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required={isSupabaseConfigured}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required={isSupabaseConfigured}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
          </button>
        </form>

        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create an account</Link>
        </div>

        {!isSupabaseConfigured ? <p className="muted demo-note">Supabase configuration is required to sign in.</p> : null}
      </div>
    </div>
  );
}
