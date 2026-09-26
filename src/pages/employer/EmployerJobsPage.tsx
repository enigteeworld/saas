import { useEffect, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ensureDefaultEstablishment } from '@/lib/establishments';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import EmptyState from '@/components/shared/EmptyState';

type Job = {
  id: string;
  title: string;
  location: string;
  employment_type: string;
  positions_available: number;
  status: string;
  created_at: string;
};

type Establishment = {
  id: string;
  name: string;
  address: string;
};

type FormState = {
  title: string;
  establishmentId: string;
  employmentType: string;
  positions: string;
  salaryMin: string;
  salaryMax: string;
  description: string;
  responsibilities: string;
  requirements: string;
  qualifications: string;
  deadline: string;
};

const emptyForm: FormState = {
  title: '',
  establishmentId: '',
  employmentType: 'full-time',
  positions: '1',
  salaryMin: '',
  salaryMax: '',
  description: '',
  responsibilities: '',
  requirements: '',
  qualifications: '',
  deadline: '',
};

export default function EmployerJobsPage() {
  const user = useAuthStore((state) => state.user);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data: employer, error: employerError } = await supabase
        .from('employer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (employerError) throw employerError;

      // Every employer always has at least a default establishment.
      await ensureDefaultEstablishment(employer.id);

      const [{ data: jobData, error: jobError }, { data: establishmentData, error: establishmentError }] =
        await Promise.all([
          supabase
            .from('job_openings')
            .select('id, title, location, employment_type, positions_available, status, created_at')
            .eq('employer_id', employer.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('establishments')
            .select('id, name, address')
            .eq('employer_id', employer.id)
            .eq('is_active', true)
            .order('created_at'),
        ]);

      if (jobError) throw jobError;
      if (establishmentError) throw establishmentError;

      setJobs(jobData ?? []);
      setEstablishments(establishmentData ?? []);

      // Preselect the default (first) establishment; keep the user's choice if still valid.
      setForm((current) => ({
        ...current,
        establishmentId:
          current.establishmentId && establishmentData?.some((item) => item.id === current.establishmentId)
            ? current.establishmentId
            : establishmentData?.[0]?.id ?? '',
      }));
    } catch (err) {
      setError(errorMessage(err, 'Unable to load job requests.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function parseSalary(value: string): number | null {
    const cleaned = value.replace(/[₦,\s]/g, '').trim();
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id || !form.title.trim()) return;

    if (!form.establishmentId) {
      setError('Add an establishment first, then choose it for this request.');
      return;
    }
    if (!form.description.trim()) {
      setError('Add a short role summary.');
      return;
    }

    const salaryMin = parseSalary(form.salaryMin);
    const salaryMax = parseSalary(form.salaryMax);
    if (form.salaryMin.trim() && salaryMin === null) return setError('Enter a valid minimum salary.');
    if (form.salaryMax.trim() && salaryMax === null) return setError('Enter a valid maximum salary.');
    if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
      return setError('Maximum salary cannot be lower than minimum salary.');
    }

    setSaving(true);
    setSent(false);
    setError('');

    try {
      const { data: employer, error: employerError } = await supabase
        .from('employer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (employerError) throw employerError;

      const establishment = establishments.find((item) => item.id === form.establishmentId);

      const { error: insertError } = await supabase.from('job_openings').insert({
        title: form.title.trim(),
        description: form.description.trim(),
        responsibilities: form.responsibilities.trim() || null,
        requirements: form.requirements.trim() || null,
        qualifications: form.qualifications.trim() || null,
        employment_type: form.employmentType,
        salary_min: salaryMin,
        salary_max: salaryMax,
        positions_available: Number(form.positions) || 1,
        location: establishment?.address || 'To be confirmed',
        deadline: form.deadline || null,
        employer_id: employer.id,
        establishment_id: form.establishmentId,
        status: 'draft',
        created_by: user.id,
      });

      if (insertError) throw insertError;

      setForm((current) => ({ ...emptyForm, establishmentId: current.establishmentId }));
      setSent(true);
      flushEmailOutbox();
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to submit staffing request.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <PageHeader eyebrow="Staffing" title="Job requests" description="Roles EnigteeWorld is filling for your establishments. New requests carry full role details straight to HR for review and publishing." />

      {error ? <div className="error-message">{error}</div> : null}

      <div className="dashboard-grid">
        <div className="content-card">
          <h2>Active requests</h2>

          {loading ? (
            <p className="muted">Loading requests...</p>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No job requests yet"
              description="Submit a staffing request and it will enter the Admin recruitment queue."
            />
          ) : (
            jobs.map((job) => (
              <div className="list-row" key={job.id}>
                <BriefcaseBusiness size={18} />
                <div>
                  <strong>{job.title}</strong>
                  <p>
                    <MapPin size={12} /> {job.location} · {job.employment_type} · {job.positions_available} position(s)
                  </p>
                </div>
                <span className="tag">{job.status === 'draft' ? 'awaiting HR review' : job.status}</span>
              </div>
            ))
          )}
        </div>

        <div className="content-card">
          <h2>Request more staff</h2>
          <p className="hint">Fill in as much detail as you can - HR reviews and publishes exactly this, so the more complete it is, the faster it goes live.</p>
          <form className="form" onSubmit={submitRequest}>
            <label>
              Role title
              <input value={form.title} onChange={(event) => update('title', event.target.value)} required placeholder="Administrative Assistant" />
            </label>

            <label>
              Establishment
              <select value={form.establishmentId} onChange={(event) => update('establishmentId', event.target.value)} required>
                {establishments.length === 0 ? <option value="">No establishment yet</option> : null}
                {establishments.map((establishment) => (
                  <option value={establishment.id} key={establishment.id}>
                    {establishment.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                Need another location? <Link className="table-link" to="/employer/establishments">Add an establishment</Link>
              </span>
            </label>

            <div className="row-2">
              <label>
                Employment type
                <select value={form.employmentType} onChange={(event) => update('employmentType', event.target.value)}>
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="internship">Internship</option>
                </select>
              </label>
              <label>
                Number of people
                <input type="number" min={1} value={form.positions} onChange={(event) => update('positions', event.target.value)} />
              </label>
            </div>

            <div className="row-2">
              <label>
                Minimum salary (NGN)
                <input type="text" inputMode="decimal" value={form.salaryMin} onChange={(event) => update('salaryMin', event.target.value)} placeholder="150,000" />
              </label>
              <label>
                Maximum salary (NGN)
                <input type="text" inputMode="decimal" value={form.salaryMax} onChange={(event) => update('salaryMax', event.target.value)} placeholder="200,000" />
              </label>
            </div>

            <label>
              Role summary
              <textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="What this role involves day to day." required />
            </label>

            <label>
              Responsibilities (one per line)
              <textarea rows={3} value={form.responsibilities} onChange={(event) => update('responsibilities', event.target.value)} placeholder={'Maintain records\nCoordinate schedules'} />
            </label>

            <label>
              Requirements (one per line)
              <textarea rows={3} value={form.requirements} onChange={(event) => update('requirements', event.target.value)} placeholder={'Strong communication\nComputer literacy'} />
            </label>

            <label>
              Qualifications (one per line)
              <textarea rows={2} value={form.qualifications} onChange={(event) => update('qualifications', event.target.value)} placeholder={'OND/HND\n1+ years experience'} />
            </label>

            <label>
              Application deadline (optional)
              <input type="date" value={form.deadline} onChange={(event) => update('deadline', event.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </label>

            {sent ? (
              <p className="success-message">
                <CheckCircle2 size={15} /> Request submitted to HR administration.
              </p>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><Loader2 size={16} className="spin" /> Submitting...</> : 'Submit request'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
