import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  CalendarDays,
  Building2,
  Send,
  MapPin,
  BriefcaseBusiness,
  Wallet,
  Clock3,
  AlertCircle,
  ShieldCheck,
  Download,
  ChevronRight,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';

type Application = {
  id: string;
  application_number: string | null;
  job_id: string;
  status: string;
  cover_letter: string | null;
  availability_date: string | null;
  expected_salary: number | null;
  submitted_at: string | null;
  created_at: string;
  status_message: string | null;
};

type Job = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  employer_id: string | null;
};

type Employer = {
  id: string;
  business_name: string | null;
};

type ApplicationDocument = {
  id: string;
  document_kind: string;
  original_name: string | null;
  file_path: string;
  mime_type: string | null;
  created_at: string;
};

type Interview = {
  id: string;
  scheduled_for: string | null;
  meeting_url: string | null;
  instructions: string | null;
  status: string;
  outcome_notes: string | null;
  mode: string | null;
  location: string | null;
  duration_minutes: number | null;
};

type Deployment = {
  id: string;
  role_title: string | null;
  agreed_salary: number | null;
  status: string | null;
  start_date: string | null;
};

const stages = [
  { key: 'submitted', label: 'Application submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_invited', label: 'Interview invited' },
  { key: 'interview_scheduled', label: 'Interview scheduled' },
  { key: 'interview_completed', label: 'Interview completed' },
  { key: 'selected', label: 'Selected' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'employed', label: 'Employed' },
];

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatMoney = (value: number | null) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDocumentKind = (value: string) => {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

async function openDocument(filePath: string) {
  const { data, error } = await getApplicationDocumentUrl(filePath);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Unable to create a secure document link.');
  }

  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export default function EmployeeApplicationDetailsPage() {
  const { id } = useParams();

  const [application, setApplication] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadApplication = async () => {
      if (!id) {
        if (mounted) {
          setError('Application reference is missing.');
          setLoading(false);
        }

        return;
      }

      setLoading(true);
      setError('');

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error('You must be signed in to view this application.');
        }

        /*
         * applicant_id is included deliberately.
         * This means an employee cannot use another employee's application
         * UUID in the URL to retrieve their application.
         */
        const { data: applicationData, error: applicationError } =
          await supabase
            .from('job_applications')
            .select(
              `
                id,
                application_number,
                job_id,
                status,
                cover_letter,
                availability_date,
                expected_salary,
                submitted_at,
                created_at,
                status_message
              `,
            )
            .eq('id', id)
            .eq('applicant_id', user.id)
            .maybeSingle();

        if (applicationError) {
          throw applicationError;
        }

        if (!applicationData) {
          if (mounted) {
            setApplication(null);
          }

          return;
        }

        if (mounted) {
          setApplication(applicationData);
        }

        const { data: jobData, error: jobError } = await supabase
          .from('job_openings')
          .select(
            `
              id,
              title,
              description,
              location,
              employment_type,
              salary_min,
              salary_max,
              employer_id
            `,
          )
          .eq('id', applicationData.job_id)
          .maybeSingle();

        if (jobError) {
          throw jobError;
        }

        if (mounted) {
          setJob(jobData);
        }

        if (jobData?.employer_id) {
          const { data: employerData, error: employerError } = await supabase
            .from('employer_profiles')
            .select('id, business_name')
            .eq('id', jobData.employer_id)
            .maybeSingle();

          if (employerError) {
            /*
             * The current schema's employer_profiles RLS may prevent an
             * employee from reading another employer's profile.
             * The rest of the application should still load.
             */
            console.warn(
              'Unable to load employer profile:',
              employerError.message,
            );
          } else if (mounted) {
            setEmployer(employerData);
          }
        }

        const { data: documentData, error: documentError } = await supabase
          .from('application_documents')
          .select(
            `
              id,
              document_kind,
              original_name,
              file_path,
              mime_type,
              created_at
            `,
          )
          .eq('application_id', applicationData.id)
          .order('created_at', { ascending: false });

        if (documentError) {
          console.warn(
            'Unable to load application documents:',
            documentError.message,
          );
        } else if (mounted) {
          setDocuments(documentData ?? []);
        }

        const { data: interviewData, error: interviewError } = await supabase
          .from('interviews')
          .select(
            `
              id,
              scheduled_for,
              meeting_url,
              instructions,
              status,
              outcome_notes,
              mode,
              location,
              duration_minutes
            `,
          )
          .eq('application_id', applicationData.id)
          .order('scheduled_for', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (interviewError) {
          console.warn(
            'Unable to load interview:',
            interviewError.message,
          );
        } else if (mounted) {
          setInterview(interviewData);
        }

        const { data: deploymentData, error: deploymentError } =
          await supabase
            .from('deployments')
            .select(
              `
                id,
                role_title,
                agreed_salary,
                status,
                start_date
              `,
            )
            .eq('application_id', applicationData.id)
            .limit(1)
            .maybeSingle();

        if (deploymentError) {
          console.warn(
            'Unable to load deployment:',
            deploymentError.message,
          );
        } else if (mounted) {
          setDeployment(deploymentData);
        }
      } catch (err) {
        console.error('Error loading application details:', err);

        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load this application.',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadApplication();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <section>
        <div className="content-card">
          <p className="muted">Loading application...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <div className="content-card empty-centered">
          <AlertCircle size={36} />
          <h2>Unable to load application</h2>
          <p>{error}</p>
          <Link className="btn btn-secondary" to="/employee/applications">
            <ArrowLeft size={15} /> Back to applications
          </Link>
        </div>
      </section>
    );
  }

  if (!application) {
    return (
      <EmptyState
        title="Application not found"
        description="This application does not exist or does not belong to your account."
        action={
          <Link className="btn btn-primary" to="/employee/applications">
            Back to applications
          </Link>
        }
      />
    );
  }

  const currentStageIndex = stages.findIndex(
    (stage) => stage.key === application.status,
  );

  const isRejected = [
    'rejected',
    'unsuccessful',
    'withdrawn',
    'closed',
  ].includes(application.status);

  const isSuccessful = [
    'successful',
    'selected',
    'onboarding',
    'employed',
  ].includes(application.status);

  const isDraft = application.status === 'draft';

  const progressPercent =
    currentStageIndex >= 0
      ? Math.round(((currentStageIndex + 1) / stages.length) * 100)
      : 0;

  const submitDraftApplication = async () => {
    if (!application || submitting) return;

    setSubmitting(true);
    setError('');
    setSubmitMessage('');

    try {
      const documentKinds = new Set(documents.map((document) => document.document_kind));
      const missingDocuments = ['cv', 'application_letter'].filter(
        (kind) => !documentKinds.has(kind),
      );

      if (missingDocuments.length > 0) {
        throw new Error(
          `Before submitting, upload your ${missingDocuments
            .map((kind) => formatDocumentKind(kind).toLowerCase())
            .join(' and ')} from the application form.`,
        );
      }

      const { data, error: updateError } = await supabase
        .from('job_applications')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', application.id)
        .eq('status', 'draft')
        .select('status, submitted_at')
        .maybeSingle();

      if (updateError) throw updateError;
      if (!data) {
        throw new Error('This draft could not be submitted. Refresh the page and try again.');
      }

      setApplication((current) =>
        current
          ? { ...current, status: data.status, submitted_at: data.submitted_at }
          : current,
      );
      setSubmitMessage('Your application has been submitted successfully.');
      flushEmailOutbox();
    } catch (err) {
      setError(errorMessage(err, 'Unable to submit this application.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <Link to="/employee/applications" className="back-link">
        <ArrowLeft size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        All applications
      </Link>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="detail-card" style={{ marginBottom: 20 }}>
        <p className="eyebrow">Application reference</p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <h1 style={{ margin: '12px 0 0', flex: 1, minWidth: 260 }}>
            {job?.title || 'Application'}
          </h1>
          <StatusBadge status={application.status} />
        </div>

        <div className="detail-meta" style={{ marginBottom: 0 }}>
          <span className="tag">
            <ShieldCheck size={12} style={{ marginRight: 5 }} />
            {application.application_number || application.id}
          </span>
          <span className="tag">
            <Building2 size={12} style={{ marginRight: 5 }} />
            {employer?.business_name || 'EnigteeWorld'}
          </span>
          <span className="tag">
            <CalendarDays size={12} style={{ marginRight: 5 }} />
            {isDraft
              ? `Saved ${formatDate(application.created_at)}`
              : `Submitted ${formatDate(application.submitted_at)}`}
          </span>
          {job?.location && (
            <span className="tag">
              <MapPin size={12} style={{ marginRight: 5 }} />
              {job.location}
            </span>
          )}
        </div>

        {isDraft && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              marginTop: 20,
              padding: '14px 16px',
              background: 'var(--mint)',
              border: '1px solid #cbded1',
              borderRadius: 12,
            }}
          >
            <AlertCircle size={18} color="var(--orange)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ fontSize: '0.9rem' }}>
                Your application is saved as a draft.
              </strong>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.83rem' }}>
                You can return later to finish your documents and submit when ready.
              </p>
            </div>
          </div>
        )}
        {submitMessage && (
          <p className="success" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <CheckCircle2 size={15} /> {submitMessage}
          </p>
        )}
      </div>

      {/* ── Progress + job details ───────────────────────── */}
      <div className="dashboard-grid">
        <div className="content-card application-progress-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Recruitment timeline</p>
              <h2 style={{ marginTop: 6 }}>Application progress</h2>
            </div>
            <span className="tag">
              {currentStageIndex >= 0
                ? `${currentStageIndex + 1} of ${stages.length}`
                : 'Draft'}
            </span>
          </div>

          {!isRejected && currentStageIndex >= 0 && (
            <div
              className="progress-line"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              style={{ margin: '18px 0 6px' }}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          {isRejected ? (
            <div className="steps vertical">
              <div className="list-row">
                <AlertCircle size={18} className="muted" />
                <div>
                  <strong>Application closed</strong>
                  <p>
                    This application is currently marked as{' '}
                    {application.status.replace(/_/g, ' ')}.
                  </p>
                </div>
                <span className="status-badge status-danger">
                  {application.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ) : (
            <div className="steps vertical">
              {stages.map((stage, index) => {
                const completed =
                  currentStageIndex >= 0 && index <= currentStageIndex;

                const current =
                  currentStageIndex >= 0 && index === currentStageIndex;

                return (
                  <div className="list-row" key={stage.key}>
                    {completed ? (
                      <CheckCircle2 size={18} className="success" style={{ color: 'var(--green)' }} />
                    ) : (
                      <Clock3 size={18} className="muted" />
                    )}
                    <div>
                      <strong>{stage.label}</strong>
                      <p>
                        {current
                          ? 'Current stage'
                          : completed
                            ? 'Completed'
                            : 'Not started'}
                      </p>
                    </div>
                    {current && <span className="tag">Current stage</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">The role</p>
              <h2 style={{ marginTop: 6 }}>Job details</h2>
            </div>
          </div>

          <div className="list-row">
            <Building2 size={18} style={{ color: 'var(--green)' }} />
            <div>
              <strong>{employer?.business_name || 'EnigteeWorld'}</strong>
              <p>Employer</p>
            </div>
          </div>

          <div className="list-row">
            <CalendarDays size={18} style={{ color: 'var(--green)' }} />
            <div>
              <strong>{formatDate(application.submitted_at)}</strong>
              <p>Submitted</p>
            </div>
          </div>

          {job?.location && (
            <div className="list-row">
              <MapPin size={18} style={{ color: 'var(--green)' }} />
              <div>
                <strong>{job.location}</strong>
                <p>Location</p>
              </div>
            </div>
          )}

          {job?.employment_type && (
            <div className="list-row">
              <BriefcaseBusiness size={18} style={{ color: 'var(--green)' }} />
              <div>
                <strong>{job.employment_type}</strong>
                <p>Employment type</p>
              </div>
            </div>
          )}

          {(job?.salary_min !== null || job?.salary_max !== null) && (
            <div className="list-row">
              <Wallet size={18} style={{ color: 'var(--green)' }} />
              <div>
                <strong>
                  {formatMoney(job?.salary_min ?? null)}
                  {' — '}
                  {formatMoney(job?.salary_max ?? null)}
                </strong>
                <p>Salary range</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cover letter ─────────────────────────────────── */}
      {application.cover_letter && (
        <div className="content-card">
          <p className="eyebrow">Personal statement</p>
          <h2 style={{ margin: '6px 0 12px' }}>Application letter / cover letter</h2>
          <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {application.cover_letter}
          </p>
        </div>
      )}

      {/* ── Application information ──────────────────────── */}
      {(application.availability_date || application.expected_salary) && (
        <div className="content-card">
          <p className="eyebrow">Your preferences</p>
          <h2 style={{ margin: '6px 0 18px' }}>Application information</h2>

          <div
            className="stat-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 0 }}
          >
            {application.availability_date && (
              <div className="stat-card">
                <CalendarDays size={20} />
                <strong>{formatDate(application.availability_date)}</strong>
                <span>Availability date</span>
              </div>
            )}
            {application.expected_salary !== null && (
              <div className="stat-card">
                <Wallet size={20} />
                <strong>{formatMoney(application.expected_salary)}</strong>
                <span>Expected salary</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Documents ────────────────────────────────────── */}
      {documents.length > 0 && (
        <div className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Attachments</p>
              <h2 style={{ marginTop: 6 }}>Documents submitted</h2>
            </div>
            <span className="tag">{documents.length}</span>
          </div>

          <div className="steps vertical">
            {documents.map((document) => (
              <div className="list-row" key={document.id}>
                <FileText size={18} style={{ color: 'var(--green)' }} />
                <div>
                  <strong>
                    {document.original_name ||
                      formatDocumentKind(document.document_kind)}
                  </strong>
                  <p>
                    {formatDocumentKind(document.document_kind)} · Uploaded{' '}
                    {formatDate(document.created_at)}
                  </p>
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    void openDocument(document.file_path).catch((err) =>
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Unable to open document.',
                      ),
                    )
                  }
                >
                  <Download size={14} /> Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {application.status_message && (
        <div className="notice-card" style={{ margin: '20px 0' }}>
          <h3>Message from HR</h3>
          <p>{application.status_message}</p>
        </div>
      )}

      {/* ── Interview ────────────────────────────────────── */}
      {interview && (
        <div className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Next step</p>
              <h2 style={{ marginTop: 6 }}>Interview</h2>
            </div>
            <span className="status-badge status-info">
              {interview.status.replace(/_/g, ' ')}
            </span>
          </div>

          {interview.scheduled_for && (
            <div className="list-row">
              <CalendarDays size={18} style={{ color: 'var(--green)' }} />
              <div>
                <strong>{formatDateTime(interview.scheduled_for)}</strong>
                <p>Scheduled for</p>
              </div>
            </div>
          )}

          <div className="list-row">
            <div>
              <strong style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Format
              </strong>
              <p style={{ fontSize: '0.85rem' }}>
                {interview.mode === 'in_person'
                  ? `In person${interview.location ? ` - ${interview.location}` : ''}`
                  : interview.mode === 'phone'
                    ? 'Phone call'
                    : 'Online (video call)'}
                {interview.duration_minutes
                  ? ` · about ${interview.duration_minutes} minutes`
                  : ''}
              </p>
            </div>
          </div>

          {interview.instructions && (
            <div className="list-row">
              <div>
                <strong style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Interview details from HR
                </strong>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.7 }}>
                  {interview.instructions}
                </p>
              </div>
            </div>
          )}

          {interview.meeting_url && (
            <div style={{ marginTop: 16 }}>
              <a
                className="btn btn-primary"
                href={interview.meeting_url}
                target="_blank"
                rel="noreferrer"
              >
                Join interview
              </a>
            </div>
          )}

          {interview.outcome_notes && (
            <div className="list-row">
              <div>
                <strong style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Outcome
                </strong>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.7 }}>
                  {interview.outcome_notes}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Deployment ───────────────────────────────────── */}
      {deployment && (
        <div className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Offer</p>
              <h2 style={{ marginTop: 6 }}>Employment / deployment</h2>
            </div>
            {deployment.status && (
              <span className="status-badge status-success">
                {deployment.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <div
            className="stat-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 0 }}
          >
            <div className="stat-card">
              <BriefcaseBusiness size={20} />
              <strong style={{ fontSize: '1.15rem' }}>
                {deployment.role_title || job?.title || '—'}
              </strong>
              <span>Role</span>
            </div>
            <div className="stat-card">
              <Wallet size={20} />
              <strong>{formatMoney(deployment.agreed_salary)}</strong>
              <span>Monthly salary</span>
            </div>
            <div className="stat-card">
              <CalendarDays size={20} />
              <strong>{formatDate(deployment.start_date)}</strong>
              <span>Start date</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft CTA ────────────────────────────────────── */}
      {isDraft && (
        <div
          className="content-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p className="eyebrow">Ready when you are</p>
            <h2 style={{ margin: '6px 0 4px' }}>Continue your application</h2>
            <p className="muted" style={{ margin: 0 }}>
              Update your cover letter or documents, then submit when everything is ready.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              className="btn btn-secondary"
              to={`/employee/applications/job/${application.job_id}`}
            >
              Edit draft
            </Link>
            <button
              className="btn btn-primary"
              type="button"
              disabled={submitting}
              onClick={() => void submitDraftApplication()}
            >
              <Send size={16} /> {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </div>
      )}

      {/* ── What happens next ────────────────────────────── */}
      <div className="content-card">
        <p className="eyebrow">Good to know</p>
        <h2 style={{ margin: '6px 0 10px' }}>What happens next</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {isRejected
            ? 'This application is no longer active. You can continue applying for other open roles.'
            : isSuccessful
              ? 'Your application has progressed successfully. Keep your profile and required documents up to date while EnigteeWorld completes the next steps.'
              : 'EnigteeWorld will update your application as it moves through the recruitment process. Keep your profile and documents up to date to avoid delays.'}
        </p>
        <Link className="text-link" to="/employee/documents">
          Review my documents <ChevronRight size={14} />
        </Link>
      </div>
    </section>
  );
}