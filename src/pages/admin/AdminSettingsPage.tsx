import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ImagePlus, Landmark, Loader2, RotateCcw } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import AvatarUpload from '@/components/shared/AvatarUpload';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { applyFavicon, loadBranding, saveBranding, uploadBrandingAsset, type BrandingSettings } from '@/lib/branding';

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

  const [payout, setPayout] = useState({ bank_name: '', account_number: '', account_name: '', instructions: '' });
  const [payoutLoaded, setPayoutLoaded] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingBusy, setBrandingBusy] = useState<'logo' | 'favicon' | 'reset' | null>(null);
  const [brandingError, setBrandingError] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);


  useEffect(() => {
    void loadBranding()
      .then((data) => setBranding(data))
      .catch((err) => setBrandingError(err instanceof Error ? err.message : 'Unable to load branding.'))
      .finally(() => setBrandingLoading(false));
  }, []);

  useEffect(() => {
    async function loadPayout() {
      const { data } = await supabase
        .from('company_payout_settings')
        .select('bank_name, account_number, account_name, instructions')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setPayout({ ...data, instructions: data.instructions ?? '' });
      setPayoutLoaded(true);
    }
    void loadPayout();
  }, []);

  async function handleBrandingFile(kind: 'logo' | 'favicon', file: File | null) {
    if (!file) return;
    setBrandingError('');
    setBrandingSaved(false);
    setBrandingBusy(kind);
    const { url, error: uploadError } = await uploadBrandingAsset(kind, file);
    if (uploadError || !url) {
      setBrandingError(uploadError?.message ?? 'Unable to upload branding image.');
      setBrandingBusy(null);
      return;
    }

    const next = {
      logoUrl: kind === 'logo' ? url : branding?.logo_url ?? null,
      faviconUrl: kind === 'favicon' ? url : branding?.favicon_url ?? null,
    };
    const { data, error: saveError } = await saveBranding(next);
    setBrandingBusy(null);
    if (saveError || !data) {
      setBrandingError(saveError ?? 'Unable to save branding.');
      return;
    }
    setBranding(data);
    setBrandingSaved(true);
    applyFavicon(data.favicon_url || data.logo_url);
  }

  async function resetBranding() {
    setBrandingError('');
    setBrandingSaved(false);
    setBrandingBusy('reset');
    const { data, error: saveError } = await saveBranding({ logoUrl: null, faviconUrl: null });
    setBrandingBusy(null);
    if (saveError || !data) {
      setBrandingError(saveError ?? 'Unable to reset branding.');
      return;
    }
    setBranding(data);
    setBrandingSaved(true);
    applyFavicon(null);
  }

  async function savePayout(event: FormEvent) {
    event.preventDefault();
    setPayoutError('');
    setPayoutSaved(false);

    if (!payout.bank_name.trim() || !payout.account_number.trim() || !payout.account_name.trim()) {
      setPayoutError('Bank name, account number and account name are all required.');
      return;
    }

    setPayoutSaving(true);
    const { error: payoutRpcError } = await supabase.rpc('admin_set_payout_account', {
      p_bank_name: payout.bank_name.trim(),
      p_account_number: payout.account_number.trim(),
      p_account_name: payout.account_name.trim(),
      p_instructions: payout.instructions.trim() || null,
    });
    setPayoutSaving(false);

    if (payoutRpcError) setPayoutError(payoutRpcError.message);
    else setPayoutSaved(true);
  }

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

      <div className="content-card" style={{ marginTop: 20 }}>
        <div className="card-heading">
          <div>
            <h2><ImagePlus size={19} style={{ verticalAlign: '-3px' }} /> Platform branding</h2>
            <p className="hint">Upload the production logo and favicon used across the public site and workspaces.</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void resetBranding()} disabled={Boolean(brandingBusy)}>
            <RotateCcw size={14} /> Use default
          </button>
        </div>

        {brandingLoading ? <p className="muted">Loading branding...</p> : (
          <div className="branding-settings-grid">
            <label className="branding-upload-card">
              <span className="branding-preview branding-preview-logo">
                {branding?.logo_url ? <img src={branding.logo_url} alt="Current EnigteeWorld logo" /> : <span className="logo-mark">E</span>}
              </span>
              <strong>Logo</strong>
              <span className="hint">PNG, JPG, WEBP or SVG · max 3 MB</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void handleBrandingFile('logo', event.target.files?.[0] ?? null); event.target.value = ''; }} />
              <span className="btn btn-secondary btn-sm">{brandingBusy === 'logo' ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} Choose logo</span>
            </label>

            <label className="branding-upload-card">
              <span className="branding-preview branding-preview-favicon">
                {branding?.favicon_url ? <img src={branding.favicon_url} alt="Current EnigteeWorld favicon" /> : <span className="logo-mark">E</span>}
              </span>
              <strong>Favicon</strong>
              <span className="hint">Use a square PNG, JPG, WEBP or SVG · max 3 MB</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void handleBrandingFile('favicon', event.target.files?.[0] ?? null); event.target.value = ''; }} />
              <span className="btn btn-secondary btn-sm">{brandingBusy === 'favicon' ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} Choose favicon</span>
            </label>
          </div>
        )}
        {brandingError ? <p className="error">{brandingError}</p> : null}
        {brandingSaved ? <p className="success-message"><CheckCircle2 size={15} /> Branding saved. Refreshing the site will use the new browser icon as well.</p> : null}
      </div>

      <form className="content-card" onSubmit={savePayout} style={{ marginTop: 20 }}>
        <h2><Landmark size={19} style={{ verticalAlign: '-3px' }} /> Company payout account</h2>
        <p className="hint">
          Shown to employers on their Invoices page so they know exactly where to send payment. Only administrators can see or edit this.
        </p>

        {!payoutLoaded ? (
          <p className="muted">Loading...</p>
        ) : (
          <div className="form">
            <div className="row-2">
              <label>
                Bank name
                <input
                  value={payout.bank_name}
                  onChange={(event) => setPayout((current) => ({ ...current, bank_name: event.target.value }))}
                  placeholder="e.g. GTBank"
                  required
                />
              </label>
              <label>
                Account number
                <input
                  value={payout.account_number}
                  onChange={(event) => setPayout((current) => ({ ...current, account_number: event.target.value }))}
                  placeholder="0123456789"
                  required
                />
              </label>
            </div>
            <label>
              Account name
              <input
                value={payout.account_name}
                onChange={(event) => setPayout((current) => ({ ...current, account_name: event.target.value }))}
                placeholder="EnigteeWorld Limited"
                required
              />
            </label>
            <label>
              Payment instructions (optional)
              <textarea
                rows={2}
                value={payout.instructions}
                onChange={(event) => setPayout((current) => ({ ...current, instructions: event.target.value }))}
                placeholder="e.g. Use the invoice number as your transfer narration."
              />
            </label>

            {payoutError ? <p className="error">{payoutError}</p> : null}
            {payoutSaved ? <p className="success-message"><CheckCircle2 size={15} /> Payout account saved.</p> : null}

            <button className="btn btn-primary" type="submit" disabled={payoutSaving} style={{ width: 'fit-content' }}>
              {payoutSaving ? <><Loader2 size={16} className="spin" /> Saving...</> : 'Save payout account'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
