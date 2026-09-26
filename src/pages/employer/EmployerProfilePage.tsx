import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FormState = {
  business_name: string;
  business_type: string;
  business_email: string;
  business_phone: string;
  business_address: string;
  website: string;
};

const initialForm: FormState = {
  business_name: '',
  business_type: '',
  business_email: '',
  business_phone: '',
  business_address: '',
  website: '',
};

export default function EmployerProfilePage() {
  const user = useAuthStore((state) => state.user);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data, error: queryError } = await supabase
        .from('employer_profiles')
        .select('business_name, business_type, business_email, business_phone, business_address, website')
        .eq('user_id', user.id)
        .single();

      if (queryError) {
        setError(queryError.message);
      } else if (data) {
        setForm({
          business_name: data.business_name ?? '',
          business_type: data.business_type ?? '',
          business_email: data.business_email ?? '',
          business_phone: data.business_phone ?? '',
          business_address: data.business_address ?? '',
          website: data.website ?? '',
        });
      }

      setLoading(false);
    }

    void load();
  }, [user?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setSaved(false);
    setError('');

    const { error: updateError } = await supabase
      .from('employer_profiles')
      .update({
        business_name: form.business_name.trim(),
        business_type: form.business_type.trim() || null,
        business_email: form.business_email.trim() || null,
        business_phone: form.business_phone.trim() || null,
        business_address: form.business_address.trim() || null,
        website: form.website.trim() || null,
      })
      .eq('user_id', user.id);

    if (updateError) setError(updateError.message);
    else setSaved(true);

    setSaving(false);
  }

  return (
    <section>
      <PageHeader eyebrow="Company account" title="Company profile" description="Business details used on contracts, invoices and job listings." />
      {error ? <div className="error-message">{error}</div> : null}

      <form className="dashboard-grid two-col" onSubmit={handleSubmit}>
        <div className="content-card">
          <h2>Profile photo</h2>
          <AvatarUpload name={form.business_name || user?.full_name || 'Employer'} />
        </div>

        <div className="content-card">
          <h2>Business details</h2>
          {loading ? <p className="muted">Loading profile...</p> : (
            <div className="form">
              <label>Business name<input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required /></label>
              <label>Business type<input value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} placeholder="Hospitality, retail, services..." /></label>
              <label>Head office address<input value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} /></label>
              <label>Website<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></label>
            </div>
          )}
        </div>

        <div className="content-card">
          <h2>Primary contact</h2>
          <div className="form">
            <label>Business email<input type="email" value={form.business_email} onChange={(e) => setForm({ ...form, business_email: e.target.value })} /></label>
            <label>Business phone<input value={form.business_phone} onChange={(e) => setForm({ ...form, business_phone: e.target.value })} /></label>
            <label>Account email<input value={user?.email ?? ''} readOnly /></label>
          </div>
        </div>

        <div className="content-card span-2">
          {saved ? <p className="success-message"><CheckCircle2 size={15} /> Company profile updated in Supabase.</p> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving...</> : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}
