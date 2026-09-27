import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, UserRound } from 'lucide-react';
import { isSupabaseConfigured, signUp } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole } from '@/routes/routeConfig';
import type { UserRole } from '@/types';
import { Logo } from '@/components/layouts/PublicLayout';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [role, setRole] = useState<UserRole>(params.get('type') === 'employer' ? 'employer' : 'employee');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add the EnigteeWorld environment variables before creating an account.');
      return;
      navigate(role === 'employee' ? '/employee/onboarding' : homeForRole(role), { replace: true });
      return;
    }

    setBusy(true);
    const { error: signUpError } = await signUp(email, password, { full_name: fullName, role });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    navigate('/verify-email', { replace: true, state: { email } });
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <Logo />
        <p>Recruitment and workforce management.</p>
      </div>

      <div className="auth-card">
        <span className="eyebrow">Create your account</span>
        <h1>Join EnigteeWorld</h1>
        <p>Choose the account that matches what you want to do.</p>

        <div className="account-choice">
          <button
            type="button"
            className={role === 'employee' ? 'selected' : ''}
            onClick={() => setRole('employee')}
          >
            <UserRound size={18} />
            <strong>Job seeker</strong>
            <span>Find opportunities and manage your applications.</span>
          </button>
          <button
            type="button"
            className={role === 'employer' ? 'selected' : ''}
            onClick={() => setRole('employer')}
          >
            <Building2 size={18} />
            <strong>Employer</strong>
            <span>Find people and manage your workforce.</span>
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            {role === 'employer' ? 'Business representative' : 'Full name'}
            <input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your name"
            />
          </label>
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
              autoComplete="new-password"
              minLength={8}
              required={isSupabaseConfigured}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'} <ArrowRight size={16} />
          </button>
        </form>

        <div className="auth-bottom">
          <span className="muted">Already registered?</span>
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
