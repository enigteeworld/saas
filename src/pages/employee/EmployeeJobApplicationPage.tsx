import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { replaceApplicationDocument } from '@/lib/applicationDocuments';
import { useAuthStore } from '@/stores/authStore';

type Job = {
  id: string;
  job_number: string;
  title: string;
  description: string;
  location: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  deadline: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
};

type StaffProfile = {
  address: string | null;
  state: string | null;
  lga: string | null;
  highest_qualification: string | null;
  field_of_study: string | null;
  professional_summary: string | null;
  skills: string[] | null;
  years_experience: number | null;
  profile_completed: boolean;
};

type ExistingApplication = {
  id: string;
  status: string;
  cover_letter: string | null;
  availability_date: string | null;
  expected_salary: number | null;
};

type FormState = {
  coverLetter: string;
  availabilityDate: string;
  expectedSalary: string;
};

const initialForm: FormState = {
  coverLetter: '',
  availabilityDate: '',
  expectedSalary: '',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const DOCUMENT_BUCKET = 'employee-documents';

function formatSalary(
  minimum: number | null,
  maximum: number | null,
  currency: string,
) {
  const symbol = currency === 'USD' ? '$' : '₦';
  const formatter = new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0,
  });

  if (minimum !== null && maximum !== null) {
    return `${symbol}${formatter.format(minimum)} - ${symbol}${formatter.format(maximum)}`;
  }

  if (minimum !== null) return `From ${symbol}${formatter.format(minimum)}`;
  if (maximum !== null) return `Up to ${symbol}${formatter.format(maximum)}`;
  return 'Salary not specified';
}

function validateFile(file: File | null, label: string) {
  if (!file) return `${label} is required.`;

  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!allowed.includes(file.type)) {
    return `${label} must be a PDF, DOC or DOCX file.`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${label} must be 5 MB or smaller.`;
  }

  return null;
}

export default function EmployeeJobApplicationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [job, setJob] = useState<Job | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [existingApplication, setExistingApplication] =
    useState<ExistingApplication | null>(null);
  const [hasCv, setHasCv] = useState(false);
  const [hasApplicationLetter, setHasApplicationLetter] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [selectedCv, setSelectedCv] = useState<File | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id || !user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [
          { data: jobData, error: jobError },
          { data: profileData, error: profileError },
          { data: staffData, error: staffError },
          { data: applicationData, error: applicationError },
        ] = await Promise.all([
          supabase
            .from('job_openings')
            .select(
              'id, job_number, title, description, location, employment_type, salary_min, salary_max, salary_currency, deadline',
            )
            .eq('id', id)
            .eq('status', 'published')
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('id, full_name, email, phone')
            .eq('id', user.id)
            .single(),
          supabase
            .from('staff_profiles')
            .select(
              'address, state, lga, highest_qualification, field_of_study, professional_summary, skills, years_experience, profile_completed',
            )
            .eq('user_id', user.id)
            .single(),
          supabase
            .from('job_applications')
            .select(
              'id, status, cover_letter, availability_date, expected_salary',
            )
            .eq('job_id', id)
            .eq('applicant_id', user.id)
            .maybeSingle(),
        ]);

        if (jobError) throw jobError;
        if (profileError) throw profileError;
        if (staffError) throw staffError;
        if (applicationError) throw applicationError;
        if (!jobData) throw new Error('This job is no longer available.');

        if (applicationData && applicationData.status !== 'draft') {
          navigate(`/employee/applications/${applicationData.id}`, {
            replace: true,
          });
          return;
        }

        let documents: { document_kind: string }[] = [];

        if (applicationData) {
          const { data, error: documentsError } = await supabase
            .from('application_documents')
            .select('document_kind')
            .eq('application_id', applicationData.id);

          if (documentsError) throw documentsError;
          documents = data ?? [];
        }

        if (!mounted) return;

        setJob(jobData);
        setProfile(profileData);
        setStaffProfile(staffData);
        setExistingApplication(applicationData);
        setForm({
          coverLetter: applicationData?.cover_letter ?? '',
          availabilityDate: applicationData?.availability_date ?? '',
          expectedSalary:
            applicationData?.expected_salary?.toString() ?? '',
        });
        setHasCv(documents.some((item) => item.document_kind === 'cv'));
        setHasApplicationLetter(
          documents.some(
            (item) => item.document_kind === 'application_letter',
          ),
        );
      } catch (err) {
        console.error('Unable to load application form:', err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load this application.',
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [id, navigate, user?.id]);

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
  ) {
    setter(event.target.files?.[0] ?? null);
    setError('');
    setMessage('');
  }

  function snapshot() {
    if (!profile || !staffProfile || !job) return null;

    return {
      captured_at: new Date().toISOString(),
      profile: {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
      },
      staff_profile: {
        address: staffProfile.address,
        state: staffProfile.state,
        lga: staffProfile.lga,
        highest_qualification: staffProfile.highest_qualification,
        field_of_study: staffProfile.field_of_study,
        professional_summary: staffProfile.professional_summary,
        skills: staffProfile.skills ?? [],
        years_experience: staffProfile.years_experience,
      },
      job: {
        id: job.id,
        job_number: job.job_number,
        title: job.title,
        location: job.location,
        employment_type: job.employment_type,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
      },
    };
  }

  async function saveApplication(submit: boolean) {
    if (!id || !user?.id || !job || !profile || !staffProfile) {
      setError('Your session or application information is incomplete.');
      return;
    }

    if (!staffProfile.profile_completed) {
      setError('Complete your employee profile before saving or submitting.');
      return;
    }

    if (submit) {
      const cvError = selectedCv ? validateFile(selectedCv, 'CV') : null;
      const letterError = selectedLetter
        ? validateFile(selectedLetter, 'Application letter')
        : null;

      if (cvError || letterError) {
        setError(cvError ?? letterError ?? 'Check your selected files.');
        return;
      }

      if (!hasCv && !selectedCv) {
        setError('Upload a CV before submitting your application.');
        return;
      }

      if (!hasApplicationLetter && !selectedLetter) {
        setError(
          'Upload an application letter before submitting your application.',
        );
        return;
      }
    }

    setError('');
    setMessage('');
    submit ? setSubmitting(true) : setSaving(true);

    try {
      const payload = {
        cover_letter: form.coverLetter.trim() || null,
        availability_date: form.availabilityDate || null,
        expected_salary: form.expectedSalary
          ? Number(form.expectedSalary)
          : null,
        application_snapshot: snapshot(),
      };

      let applicationId = existingApplication?.id;

      if (applicationId) {
        const { data, error: updateError } = await supabase
          .from('job_applications')
          .update({
            ...payload,
            ...(submit
              ? {
                  status: 'submitted',
                  submitted_at: new Date().toISOString(),
                }
              : {}),
          })
          .eq('id', applicationId)
          .eq('applicant_id', user.id)
          .eq('status', 'draft')
          .select(
            'id, status, cover_letter, availability_date, expected_salary',
          )
          .single();

        if (updateError) throw updateError;
        if (data) setExistingApplication(data);
      } else {
        const { data, error: insertError } = await supabase
          .from('job_applications')
          .insert({
            job_id: job.id,
            applicant_id: user.id,
            source: 'website',
            status: 'draft',
            ...payload,
          })
          .select(
            'id, status, cover_letter, availability_date, expected_salary',
          )
          .single();

        if (insertError) throw insertError;
        if (!data) throw new Error('Unable to create your application.');

        applicationId = data.id;
        setExistingApplication(data);
      }

      if (!applicationId) {
        throw new Error('The application ID could not be determined.');
      }

      if (selectedCv) {
        const result = await replaceApplicationDocument(
          user.id,
          applicationId,
          'cv',
          selectedCv,
        );

        if (result.error || !result.data) {
          throw result.error ?? new Error('Unable to upload CV.');
        }

        setHasCv(true);
        setSelectedCv(null);
      }

      if (selectedLetter) {
        const result = await replaceApplicationDocument(
          user.id,
          applicationId,
          'application_letter',
          selectedLetter,
        );

        if (result.error || !result.data) {
          throw (
            result.error ?? new Error('Unable to upload application letter.')
          );
        }

        setHasApplicationLetter(true);
        setSelectedLetter(null);
      }

      if (submit) {
        const { error: submitError } = await supabase
          .from('job_applications')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', applicationId)
          .eq('applicant_id', user.id)
          .eq('status', 'draft');

        if (submitError) throw submitError;

        // Confirmation email to the applicant + alert to HR are queued by the database.
        flushEmailOutbox();

        navigate(`/employee/applications/${applicationId}`, {
          replace: true,
        });
      } else {
        setMessage(
          'Draft saved successfully. You can return later to continue.',
        );
      }
    } catch (err) {
      console.error('Unable to save application:', err);
      setError(errorMessage(err, 'Unable to save your application.'));
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveApplication(true);
  }

  if (loading) {
    return (
      <section>
        <div className="content-card">
          <Loader2 size={20} className="spin" />
          <span className="muted">Loading application form...</span>
        </div>
      </section>
    );
  }

  if (error && !job) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Unable to load application"
        description={error}
        action={
          <Link className="btn btn-primary" to="/jobs">
            Back to jobs
          </Link>
        }
      />
    );
  }

  if (!job || !profile || !staffProfile) {
    return (
      <EmptyState
        title="Application unavailable"
        description="The job or your employee profile could not be loaded."
      />
    );
  }

  if (!staffProfile.profile_completed) {
    return (
      <section>
        <PageHeader
          eyebrow="Application"
          title={`Apply for ${job.title}`}
          description="Complete your employee profile before continuing."
        />
        <div className="content-card">
          <p className="muted">
            Complete your onboarding information first, then return to this
            application.
          </p>
          <Link className="btn btn-primary" to="/employee/onboarding">
            Complete profile
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link to={`/jobs/${job.id}`} className="back-link">
        <ArrowLeft size={15} />
        Back to job
      </Link>

      <PageHeader
        eyebrow={`Application ${job.job_number}`}
        title={`Apply for ${job.title}`}
        description={`${job.location} · ${job.employment_type} · ${formatSalary(
          job.salary_min,
          job.salary_max,
          job.salary_currency,
        )}`}
      />

      <div className="content-card">
        <div className="list-row">
          <div>
            <strong>
              {existingApplication ? 'Draft application' : 'New application'}
            </strong>
            <p className="muted small">
              Save your progress and return whenever you are ready. Submission
              requires both a CV and an application letter.
            </p>
          </div>
          <span className="badge">
            {existingApplication ? 'Draft saved' : 'Not started'}
          </span>
        </div>
      </div>

      {error ? (
        <div className="content-card form-message error-message">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="content-card form-message success-message">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      ) : null}

      <form className="dashboard-grid two-col" onSubmit={handleSubmit}>
        <div className="content-card">
          <h2>Your profile</h2>
          <div className="list-row">
            <div>
              <strong>{profile.full_name}</strong>
              <p>{profile.email}</p>
              <p>{profile.phone || 'No phone number saved'}</p>
            </div>
          </div>

          <div className="list-row">
            <div>
              <strong>Qualification</strong>
              <p>
                {staffProfile.highest_qualification || 'Not provided'}
                {staffProfile.field_of_study
                  ? ` · ${staffProfile.field_of_study}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="list-row">
            <div>
              <strong>Experience</strong>
              <p>{staffProfile.years_experience ?? 0} years</p>
            </div>
          </div>

          <p className="muted small">
            Your profile information is captured in the application snapshot.
          </p>
        </div>

        <div className="content-card">
          <h2>Application details</h2>
          <div className="form">
            <label>
              Cover letter
              <textarea
                rows={7}
                value={form.coverLetter}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    coverLetter: event.target.value,
                  }))
                }
                placeholder="Explain why you are a good fit for this role."
              />
            </label>

            <label>
              Availability date
              <input
                type="date"
                value={form.availabilityDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    availabilityDate: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Expected salary
              <input
                type="number"
                min="0"
                step="1000"
                value={form.expectedSalary}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expectedSalary: event.target.value,
                  }))
                }
                placeholder="e.g. 250000"
              />
            </label>
          </div>
        </div>

        <div className="content-card span-2">
          <h2>Documents for this application</h2>
          <p className="muted">
            You can upload documents now or save the draft and upload them
            later. Existing documents are retained until you replace them.
          </p>

          <div className="dashboard-grid two-col">
            <label className="file-upload">
              <FileText size={18} />
              <strong>CV</strong>
              <span className="muted small">
                PDF, DOC or DOCX · max 5 MB
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) =>
                  handleFileChange(event, setSelectedCv)
                }
              />
              {selectedCv ? (
                <span className="small">{selectedCv.name}</span>
              ) : hasCv ? (
                <span className="small">Existing CV saved</span>
              ) : (
                <span className="btn btn-secondary">
                  <Upload size={15} /> Choose CV
                </span>
              )}
            </label>

            <label className="file-upload">
              <FileText size={18} />
              <strong>Application letter</strong>
              <span className="muted small">
                PDF, DOC or DOCX · max 5 MB
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) =>
                  handleFileChange(event, setSelectedLetter)
                }
              />
              {selectedLetter ? (
                <span className="small">{selectedLetter.name}</span>
              ) : hasApplicationLetter ? (
                <span className="small">Existing application letter saved</span>
              ) : (
                <span className="btn btn-secondary">
                  <Upload size={15} /> Choose letter
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="span-2">
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={saving || submitting}
              onClick={() => void saveApplication(false)}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="spin" /> Saving...
                </>
              ) : (
                <>
                  <Save size={16} /> Save draft
                </>
              )}
            </button>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" /> Submitting...
                </>
              ) : (
                <>
                  <Send size={16} /> Submit application
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
