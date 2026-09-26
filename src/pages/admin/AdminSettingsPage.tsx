import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FormState = {
  full_name: string;
  email: string;
  phone: string;
};

export default function AdminSettingsPage() {
  const user = useAuthStore((state) => state.user);
  const [form, setForm] = useState<FormState>({
    full_name: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', user.id)
        .single();

      if (queryError) setError(queryError.message);
      else if (data) setForm(data);

      setLoading(false);
    }

    void load();
  }, [user?.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setSaved(false);
    setError('');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
      })
      .eq('id', user.id);

    if (updateError) setError(updateError.message);
    else setSaved(true);

    setSaving(false);
  }

  return (
    <section>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Manage the administrator profile used by the EnigteeWorld platform."
      />

      {error ? <div className="error-message">{error}</div> : null}

      <form className="dashboard-grid two-col" onSubmit={save}>
        <div className="content-card">
          <h2>Profile photo</h2>
          <AvatarUpload name={form.full_name || user?.full_name || 'Administrator'} />
        </div>

        <div className="content-card">
          <h2>Administrator profile</h2>
          {loading ? <p className="muted">Loading profile...</p> : (
            <div className="form">
              <label>
                Full name
                <input
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input value={form.email} readOnly />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </label>
            </div>
          )}
        </div>

        <div className="content-card">
          <h2>Access</h2>
          <p className="muted">
            Your role and active status are controlled by the Supabase profile
            record. This page does not create local settings that can drift
            from the database.
          </p>
          <div className="list-row">
            <div>
              <strong>Role</strong>
              <p>Administrator</p>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>Account</strong>
              <p>Authenticated through Supabase Auth</p>
            </div>
          </div>
        </div>

        <div className="content-card span-2">
          {saved ? (
            <p className="success-message">
              <CheckCircle2 size={15} /> Profile saved to Supabase.
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving...</> : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}
