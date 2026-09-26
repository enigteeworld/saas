import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { supabase } from '@/lib/supabase';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type EmployerProfile = {
  id: string;
  business_name: string;
};

type EstablishmentOption = {
  id: string;
  name: string;
  address: string;
  is_default: boolean;
};

type JobFormData = {
  title: string;
  employer_id: string;
  establishment_id: string;
  location: string;
  employment_type: string;
  positions_available: string;
  salary_min: string;
  salary_max: string;
  description: string;
  responsibilities: string;
  requirements: string;
  qualifications: string;
  deadline: string;
};

const emptyForm: JobFormData = {
  title: '',
  employer_id: '',
  establishment_id: '',
  location: '',
  employment_type: 'full-time',
  positions_available: '1',
  salary_min: '',
  salary_max: '',
  description: '',
  responsibilities: '',
  requirements: '',
  qualifications: '',
  deadline: '',
};

export default function AdminCreateJobPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [employers, setEmployers] = useState<EmployerProfile[]>([]);
  const [loadingEmployers, setLoadingEmployers] = useState(true);
  const [loadingJob, setLoadingJob] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [fromEmployer, setFromEmployer] = useState(false);

  const [formData, setFormData] = useState<JobFormData>(emptyForm);
  const [establishments, setEstablishments] = useState<EstablishmentOption[]>([]);

  useEffect(() => {
    loadEmployers();
  }, []);

  // Editing an existing job (typically an employer's staffing request): load it in full.
  useEffect(() => {
    async function loadJob() {
      if (!id) return;
      setLoadingJob(true);
      setError('');

      const { data, error: loadError } = await supabase
        .from('job_openings')
        .select('title, employer_id, establishment_id, location, employment_type, positions_available, salary_min, salary_max, description, responsibilities, requirements, qualifications, deadline, status, created_by, profiles:created_by (role)')
        .eq('id', id)
        .maybeSingle();

      if (loadError) {
        setError(errorMessage(loadError, 'Unable to load this job opening.'));
        setLoadingJob(false);
        return;
      }
      if (!data) {
        setError('This job opening could not be found.');
        setLoadingJob(false);
        return;
      }

      const creator = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
      setFromEmployer(creator?.role === 'employer');
      setExistingStatus(data.status);
      setFormData({
        title: data.title ?? '',
        employer_id: data.employer_id ?? '',
        establishment_id: data.establishment_id ?? '',
        location: data.location ?? '',
        employment_type: data.employment_type ?? 'full-time',
        positions_available: String(data.positions_available ?? 1),
        salary_min: data.salary_min !== null ? String(data.salary_min) : '',
        salary_max: data.salary_max !== null ? String(data.salary_max) : '',
        description: data.description ?? '',
        responsibilities: data.responsibilities ?? '',
        requirements: data.requirements ?? '',
        qualifications: data.qualifications ?? '',
        deadline: data.deadline ?? '',
      });
      setLoadingJob(false);
    }

    void loadJob();
  }, [id]);

  // When an employer is chosen, load its establishments and preselect the default one (create mode only).
  useEffect(() => {
    async function loadEstablishments() {
      if (!formData.employer_id) {
        setEstablishments([]);
        return;
      }

      const { data } = await supabase
        .from('establishments')
        .select('id, name, address, is_default')
        .eq('employer_id', formData.employer_id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      const list = (data ?? []) as EstablishmentOption[];
      setEstablishments(list);

      if (!isEditing) {
        const first = list[0];
        setFormData((current) => ({
          ...current,
          establishment_id: first ? first.id : '',
          location: current.location.trim() ? current.location : first?.address ?? '',
        }));
      }
    }

    void loadEstablishments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.employer_id]);

  async function loadEmployers() {
    setLoadingEmployers(true);
    setError('');

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        setError('You must be logged in as an admin to create a job opening.');
        return;
      }

      const { data, error: employersError } = await supabase
        .from('employer_profiles')
        .select('id, business_name')
        .order('business_name', { ascending: true });

      if (employersError) throw employersError;

      setEmployers(data ?? []);
    } catch (err) {
      console.error('Error loading employers:', err);
      setError(errorMessage(err, 'Unable to load employers from Supabase.'));
    } finally {
      setLoadingEmployers(false);
    }
  }

  function updateField(field: keyof JobFormData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
    if (error) setError('');
    if (saved) setSaved(false);
  }

  function parseSalary(value: string): number | null {
    const cleaned = value.replace(/[₦,\s]/g, '').trim();
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  async function saveJob(status: 'draft' | 'published') {
    setSaving(true);
    setSaved(false);
    setError('');

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error('You must be logged in to save a job opening.');

      const title = formData.title.trim();
      const location = formData.location.trim();
      const description = formData.description.trim();

      if (!title) throw new Error('Job title is required.');
      if (!location) throw new Error('Location is required.');
      if (!description) throw new Error('Role summary is required.');

      const salaryMin = parseSalary(formData.salary_min);
      const salaryMax = parseSalary(formData.salary_max);
      if (formData.salary_min.trim() && salaryMin === null) throw new Error('Please enter a valid minimum salary.');
      if (formData.salary_max.trim() && salaryMax === null) throw new Error('Please enter a valid maximum salary.');
      if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
        throw new Error('Maximum salary cannot be lower than minimum salary.');
      }

      const positions = Number(formData.positions_available) || 1;
      if (positions < 1) throw new Error('Number of positions must be at least 1.');

      const payload = {
        title,
        description,
        responsibilities: formData.responsibilities.trim() || null,
        requirements: formData.requirements.trim() || null,
        qualifications: formData.qualifications.trim() || null,
        employment_type: formData.employment_type,
        positions_available: positions,
        salary_min: salaryMin,
        salary_max: salaryMax,
        location,
        employer_id: formData.employer_id || null,
        establishment_id: formData.establishment_id || null,
        deadline: formData.deadline || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      };

      if (isEditing && id) {
        const { error: updateError } = await supabase.from('job_openings').update(payload).eq('id', id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('job_openings').insert({ ...payload, created_by: user.id }).select().single();
        if (insertError) throw insertError;
      }

      flushEmailOutbox();
      setSaved(true);

      if (status === 'published') {
        setTimeout(() => navigate('/admin/jobs'), 800);
      }
    } catch (err) {
      console.error('Error saving job:', err);
      setError(errorMessage(err, 'Unable to save the job opening.'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveJob('published');
  }

  async function handleSaveDraft() {
    await saveJob('draft');
  }

  if (loadingJob) {
    return (
      <section>
        <div className="content-card">
          <Loader2 size={18} className="spin" /> <span className="muted">Loading job opening...</span>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link to="/admin/jobs" className="back-link">
        <ArrowLeft size={15} /> All job openings
      </Link>

      <PageHeader
        eyebrow="Recruitment"
        title={isEditing ? 'Review job opening' : 'Create a job opening'}
        description={
          fromEmployer
            ? 'Submitted by an employer as a staffing request. Review, complete any missing fields, then publish it to the careers page.'
            : 'Publish a role to the public careers page and start receiving applications.'
        }
      />

      {fromEmployer && existingStatus === 'draft' ? (
        <div className="notice-card warn" style={{ marginBottom: 18 }}>
          <h3>Awaiting HR review</h3>
          <p>This staffing request was submitted by the employer and has not been published yet.</p>
        </div>
      ) : null}

      {error ? <div className="error-message">{error}</div> : null}

      <form className="dashboard-grid two-col" onSubmit={handlePublish}>
        <div className="content-card">
          <h2>Role details</h2>

          <div className="form">
            <label>
              Job title
              <input required value={formData.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Administrative Assistant" />
            </label>

            <label>
              Employer
              <select value={formData.employer_id} onChange={(event) => updateField('employer_id', event.target.value)} disabled={loadingEmployers}>
                <option value="">{loadingEmployers ? 'Loading employers...' : 'Select employer'}</option>
                {employers.map((employer) => (
                  <option key={employer.id} value={employer.id}>
                    {employer.business_name}
                  </option>
                ))}
              </select>
            </label>

            {formData.employer_id ? (
              <label>
                Establishment
                <select
                  value={formData.establishment_id}
                  onChange={(event) => {
                    const chosen = establishments.find((item) => item.id === event.target.value);
                    setFormData((current) => ({
                      ...current,
                      establishment_id: event.target.value,
                      location: chosen?.address ?? current.location,
                    }));
                  }}
                >
                  {establishments.length === 0 ? <option value="">No establishment yet - add one under Establishments</option> : null}
                  {establishments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Location
              <input required value={formData.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Benin City, Edo" />
            </label>

            <div className="row-2">
              <label>
                Employment type
                <select value={formData.employment_type} onChange={(event) => updateField('employment_type', event.target.value)}>
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="internship">Internship</option>
                </select>
              </label>
              <label>
                Positions available
                <input type="number" min={1} value={formData.positions_available} onChange={(event) => updateField('positions_available', event.target.value)} />
              </label>
            </div>

            <div className="row-2">
              <label>
                Minimum salary
                <input type="text" inputMode="decimal" value={formData.salary_min} onChange={(event) => updateField('salary_min', event.target.value)} placeholder="150,000" />
              </label>
              <label>
                Maximum salary
                <input type="text" inputMode="decimal" value={formData.salary_max} onChange={(event) => updateField('salary_max', event.target.value)} placeholder="200,000" />
              </label>
            </div>

            <label>
              Application deadline (optional)
              <input type="date" value={formData.deadline} onChange={(event) => updateField('deadline', event.target.value)} />
            </label>
          </div>
        </div>

        <div className="content-card">
          <h2>Description</h2>

          <div className="form">
            <label>
              Role summary
              <textarea rows={4} required value={formData.description} onChange={(event) => updateField('description', event.target.value)} placeholder="What this role involves day to day." />
            </label>

            <label>
              Responsibilities (one per line)
              <textarea rows={4} value={formData.responsibilities} onChange={(event) => updateField('responsibilities', event.target.value)} placeholder={'Maintain records\nCoordinate schedules\nSupport daily administration'} />
            </label>

            <label>
              Requirements (one per line)
              <textarea rows={4} value={formData.requirements} onChange={(event) => updateField('requirements', event.target.value)} placeholder={'Strong communication\nComputer literacy\nRelevant work experience'} />
            </label>

            <label>
              Qualifications (one per line)
              <textarea rows={3} value={formData.qualifications} onChange={(event) => updateField('qualifications', event.target.value)} placeholder={'OND/HND\n1+ years experience'} />
            </label>
          </div>
        </div>

        <div className="content-card span-2">
          {saved ? (
            <p className="success-message">
              <CheckCircle2 size={15} /> Job opening saved successfully.
            </p>
          ) : null}

          <div className="hero-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><Loader2 size={15} className="spin" /> Publishing...</> : 'Publish opening'}
            </button>

            <button className="btn btn-secondary" type="button" onClick={handleSaveDraft} disabled={saving}>
              {saving ? <><Loader2 size={15} className="spin" /> Saving...</> : 'Save as draft'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
