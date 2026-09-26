import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Download, FileText, Loader2, Send, UserCheck } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';
import { assignDocument, createDocumentResource, type ResourceRow } from '@/lib/documentResources';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type Application = {
  id: string;
  application_number: string;
  applicant_id: string;
  job_id: string;
  status: string;
  cover_letter: string | null;
  availability_date: string | null;
  expected_salary: number | null;
  submitted_at: string;
  admin_notes: string | null;
  status_message: string | null;
};

type Candidate = { full_name: string; email: string; phone: string | null };

type Job = {
  title: string;
  location: string;
  employment_type: string;
  employer_id: string | null;
  establishment_id: string | null;
  salary_min: number | null;
};

type ApplicationDocument = {
  id: string;
  document_kind: string;
  file_path: string;
  original_name: string | null;
  created_at: string;
};

type Interview = {
  id: string;
  scheduled_for: string | null;
  meeting_url: string | null;
  instructions: string | null;
  status: string;
  outcome_notes: string | null;
  mode: string;
  location: string | null;
  duration_minutes: number | null;
};

type Deployment = {
  id: string;
  employer_id: string;
  establishment_id: string;
  role_title: string;
  agreed_salary: number;
  status: string;
  start_date: string | null;
  hr_message: string | null;
};

type EmployerOption = { id: string; business_name: string };
type EstablishmentOption = { id: string; name: string; address: string; is_default: boolean };

type SentDocument = {
  id: string;
  viewed_at: string | null;
  downloaded_at: string | null;
  created_at: string;
  document_resources: { title: string; document_kind: string } | { title: string; document_kind: string }[] | null;
};

type EventRow = { id: string; status: string; message: string | null; created_at: string };

// "employed", "interview_scheduled" and deployment-driven stages are set by their own panels below.
const manualStatuses = [
  'under_review',
  'shortlisted',
  'interview_invited',
  'interview_completed',
  'successful',
  'unsuccessful',
  'selected',
  'rejected',
  'on_hold',
  'closed',
];

const hireReadyStatuses = ['interview_completed', 'successful', 'selected', 'onboarding', 'employed'];

function pretty(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminApplicationDetailsPage() {
  const { id } = useParams();
  const admin = useAuthStore((state) => state.user);

  const [application, setApplication] = useState<Application | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [employer, setEmployer] = useState<EmployerOption | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [sentDocuments, setSentDocuments] = useState<SentDocument[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // stage form
  const [status, setStatus] = useState('');
  const [hrMessage, setHrMessage] = useState('');
  const [notes, setNotes] = useState('');

  // interview form
  const [ivWhen, setIvWhen] = useState('');
  const [ivMode, setIvMode] = useState('online');
  const [ivUrl, setIvUrl] = useState('');
  const [ivLocation, setIvLocation] = useState('');
  const [ivDuration, setIvDuration] = useState('');
  const [ivNotes, setIvNotes] = useState('');
  const [ivOutcome, setIvOutcome] = useState('');

  // document form
  const [docSource, setDocSource] = useState<'upload' | 'existing'>('upload');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docKind, setDocKind] = useState('recruitment_form');
  const [docDescription, setDocDescription] = useState('');
  const [docNote, setDocNote] = useState('');
  const [docResourceId, setDocResourceId] = useState('');

  // deployment form
  const [dpEmployer, setDpEmployer] = useState('');
  const [dpEstablishment, setDpEstablishment] = useState('');
  const [dpRole, setDpRole] = useState('');
  const [dpSalary, setDpSalary] = useState('');
  const [dpStart, setDpStart] = useState('');
  const [dpStatus, setDpStatus] = useState('active');
  const [dpMessage, setDpMessage] = useState('');

  async function loadApplication(showSpinner = true) {
    if (!id) {
      setLoading(false);
      setError('Application reference is missing.');
      return;
    }

    if (showSpinner) setLoading(true);
    setError('');

    try {
      const { data: applicationData, error: applicationError } = await supabase
        .from('job_applications')
        .select('id, application_number, applicant_id, job_id, status, cover_letter, availability_date, expected_salary, submitted_at, admin_notes, status_message')
        .eq('id', id)
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!applicationData) {
        setApplication(null);
        return;
      }

      const [candidateRes, jobRes, docsRes, interviewRes, deploymentRes, sentRes, eventsRes, resourcesRes, employersRes] =
        await Promise.all([
          supabase.from('profiles').select('full_name, email, phone').eq('id', applicationData.applicant_id).maybeSingle(),
          supabase
            .from('job_openings')
            .select('title, location, employment_type, employer_id, establishment_id, salary_min')
            .eq('id', applicationData.job_id)
            .maybeSingle(),
          supabase
            .from('application_documents')
            .select('id, document_kind, file_path, original_name, created_at')
            .eq('application_id', applicationData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('interviews')
            .select('id, scheduled_for, meeting_url, instructions, status, outcome_notes, mode, location, duration_minutes')
            .eq('application_id', applicationData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('deployments')
            .select('id, employer_id, establishment_id, role_title, agreed_salary, status, start_date, hr_message')
            .eq('application_id', applicationData.id)
            .maybeSingle(),
          supabase
            .from('document_assignments')
            .select('id, viewed_at, downloaded_at, created_at, document_resources (title, document_kind)')
            .eq('application_id', applicationData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('application_events')
            .select('id, status, message, created_at')
            .eq('application_id', applicationData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('document_resources')
            .select('id, title, description, document_kind, file_path, created_at')
            .order('created_at', { ascending: false }),
          supabase.from('employer_profiles').select('id, business_name').order('business_name'),
        ]);

      const jobData = jobRes.data as Job | null;
      const employerList = (employersRes.data ?? []) as EmployerOption[];
      const interviewData = interviewRes.data as Interview | null;
      const deploymentData = deploymentRes.data as Deployment | null;

      setApplication(applicationData as Application);
      setCandidate(candidateRes.data as Candidate | null);
      setJob(jobData);
      setEmployers(employerList);
      setEmployer(employerList.find((item) => item.id === jobData?.employer_id) ?? null);
      setDocuments((docsRes.data ?? []) as ApplicationDocument[]);
      setInterview(interviewData);
      setDeployment(deploymentData);
      setSentDocuments((sentRes.data ?? []) as SentDocument[]);
      setEvents((eventsRes.data ?? []) as EventRow[]);
      setResources((resourcesRes.data ?? []) as ResourceRow[]);

      setStatus(
        manualStatuses.includes(applicationData.status)
          ? applicationData.status
          : manualStatuses[0],
      );
      setNotes(applicationData.admin_notes ?? '');
      setHrMessage('');

      if (interviewData) {
        setIvWhen(toLocalInput(interviewData.scheduled_for));
        setIvMode(interviewData.mode || 'online');
        setIvUrl(interviewData.meeting_url ?? '');
        setIvLocation(interviewData.location ?? '');
        setIvDuration(interviewData.duration_minutes ? String(interviewData.duration_minutes) : '');
        setIvNotes(interviewData.instructions ?? '');
        setIvOutcome(interviewData.outcome_notes ?? '');
      }

      // Deployment form defaults: existing placement, else the job's own employer/establishment.
      setDpEmployer(deploymentData?.employer_id ?? jobData?.employer_id ?? '');
      setDpRole(deploymentData?.role_title ?? jobData?.title ?? '');
      setDpSalary(
        String(deploymentData?.agreed_salary ?? applicationData.expected_salary ?? jobData?.salary_min ?? ''),
      );
      setDpStart(deploymentData?.start_date ?? applicationData.availability_date ?? '');
      setDpStatus(deploymentData?.status && ['active', 'pending_start', 'onboarding', 'selected'].includes(deploymentData.status) ? deploymentData.status : 'active');
      setDpMessage(deploymentData?.hr_message ?? '');
    } catch (err) {
      console.error('Unable to load application:', err);
      setError(errorMessage(err, 'Unable to load application.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Establishments follow the selected employer; default one is preselected.
  useEffect(() => {
    async function loadEstablishments() {
      if (!dpEmployer) {
        setEstablishments([]);
        setDpEstablishment('');
        return;
      }
      const { data } = await supabase
        .from('establishments')
        .select('id, name, address, is_default')
        .eq('employer_id', dpEmployer)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');
      const list = (data ?? []) as EstablishmentOption[];
      setEstablishments(list);
      setDpEstablishment((current) => {
        if (current && list.some((item) => item.id === current)) return current;
        if (deployment && deployment.employer_id === dpEmployer && list.some((item) => item.id === deployment.establishment_id)) {
          return deployment.establishment_id;
        }
        if (job?.employer_id === dpEmployer && job.establishment_id && list.some((item) => item.id === job.establishment_id)) {
          return job.establishment_id;
        }
        return list[0]?.id ?? '';
      });
    }
    void loadEstablishments();
  }, [dpEmployer, deployment, job]);

  function done(message: string) {
    setNotice(message);
    flushEmailOutbox();
    void loadApplication(false);
  }

  async function saveStage() {
    if (!application) return;
    setBusy('stage');
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await supabase
        .from('job_applications')
        .update({ status, status_message: hrMessage.trim() || null, admin_notes: notes.trim() || null })
        .eq('id', application.id);
      if (updateError) throw updateError;
      done('Application updated. The candidate has been notified in their dashboard and by email.');
    } catch (err) {
      setError(errorMessage(err, 'Unable to update application.'));
    } finally {
      setBusy(null);
    }
  }

  async function scheduleInterview(event: FormEvent) {
    event.preventDefault();
    if (!application) return;
    setError('');
    setNotice('');

    if (!ivWhen) return setError('Choose the interview date and time.');
    if (!ivNotes.trim()) return setError('Add the interview details note - the candidate sees this on their dashboard and in the email.');
    if (ivMode === 'online' && !ivUrl.trim()) return setError('Add the meeting link for an online interview.');
    if (ivMode === 'in_person' && !ivLocation.trim()) return setError('Add the venue for an in-person interview.');

    setBusy('interview');
    try {
      const scheduledFor = new Date(ivWhen).toISOString();
      const editing = interview && ['invited', 'scheduled', 'rescheduled'].includes(interview.status);
      const payload = {
        scheduled_for: scheduledFor,
        mode: ivMode,
        meeting_url: ivMode === 'online' ? ivUrl.trim() : null,
        location: ivMode === 'in_person' ? ivLocation.trim() : null,
        duration_minutes: ivDuration ? Number(ivDuration) : null,
        instructions: ivNotes.trim(),
      };

      if (editing && interview) {
        const rescheduled = interview.scheduled_for && new Date(interview.scheduled_for).toISOString() !== scheduledFor;
        const { error: updateError } = await supabase
          .from('interviews')
          .update({ ...payload, status: rescheduled ? 'rescheduled' : 'scheduled' })
          .eq('id', interview.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('interviews')
          .insert({ ...payload, application_id: application.id, status: 'scheduled', invited_by: admin?.id ?? null });
        if (insertError) throw insertError;
      }
      done('Interview saved. The candidate can now see the details on their dashboard and has been emailed.');
    } catch (err) {
      setError(errorMessage(err, 'Unable to save the interview.'));
    } finally {
      setBusy(null);
    }
  }

  async function setInterviewOutcome(next: 'completed' | 'successful' | 'unsuccessful' | 'cancelled') {
    if (!interview) return;
    setBusy(`outcome-${next}`);
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await supabase
        .from('interviews')
        .update({
          status: next,
          outcome_notes: ivOutcome.trim() || null,
          completed_at: next === 'cancelled' ? null : new Date().toISOString(),
        })
        .eq('id', interview.id);
      if (updateError) throw updateError;
      done(`Interview marked ${next}. The application stage was updated and the candidate notified.`);
    } catch (err) {
      setError(errorMessage(err, 'Unable to update the interview.'));
    } finally {
      setBusy(null);
    }
  }

  async function sendDocument(event: FormEvent) {
    event.preventDefault();
    if (!application || !admin?.id) return;
    setError('');
    setNotice('');

    if (docSource === 'upload') {
      if (!docFile) return setError('Choose the file to send.');
      if (!docTitle.trim()) return setError('Give the document a title.');
    } else if (!docResourceId) {
      return setError('Choose a document to send.');
    }

    setBusy('document');
    try {
      let resourceId = docResourceId;
      if (docSource === 'upload' && docFile) {
        const created = await createDocumentResource({
          adminId: admin.id,
          file: docFile,
          title: docTitle,
          description: docDescription,
          kind: docKind as never,
        });
        if (created.error || !created.resource) throw new Error(created.error ?? 'Upload failed.');
        resourceId = created.resource.id;
      }

      const assigned = await assignDocument({
        resourceId,
        profileIds: [application.applicant_id],
        applicationId: application.id,
        note: docNote,
        adminId: admin.id,
      });
      if (assigned.error) throw new Error(assigned.error);

      setDocFile(null);
      setDocTitle('');
      setDocDescription('');
      setDocNote('');
      setDocResourceId('');
      done('Document sent. It now appears on the candidate’s Documents page and they have been emailed.');
    } catch (err) {
      setError(errorMessage(err, 'Unable to send the document.'));
    } finally {
      setBusy(null);
    }
  }

  async function assignPlacement(event: FormEvent) {
    event.preventDefault();
    if (!application) return;
    setError('');
    setNotice('');
    if (!dpEmployer) return setError('Select the employer.');
    if (!dpEstablishment) return setError('This employer has no establishment yet. Add one under Establishments first.');
    if (!dpRole.trim()) return setError('Enter the role title.');

    setBusy('deploy');
    try {
      const { error: rpcError } = await supabase.rpc('admin_assign_deployment', {
        p_application_id: application.id,
        p_employer_id: dpEmployer,
        p_establishment_id: dpEstablishment,
        p_role_title: dpRole.trim(),
        p_agreed_salary: dpSalary ? Number(dpSalary) : 0,
        p_start_date: dpStart || null,
        p_status: dpStatus,
        p_message: dpMessage.trim() || null,
      });
      if (rpcError) throw rpcError;
      done(
        dpStatus === 'active'
          ? 'Candidate employed. They now appear as active staff in the employer portal and the employee has been notified.'
          : 'Placement saved. The employee and employer have been notified.',
      );
    } catch (err) {
      setError(errorMessage(err, 'Unable to assign the candidate to the employer.'));
    } finally {
      setBusy(null);
    }
  }

  async function changeDeploymentStatus(next: string) {
    if (!deployment) return;
    setBusy(`dep-${next}`);
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await supabase.from('deployments').update({ status: next }).eq('id', deployment.id);
      if (updateError) throw updateError;
      done(`Employment status changed to ${next.replace(/_/g, ' ')}. Employee and employer notified.`);
    } catch (err) {
      setError(errorMessage(err, 'Unable to update employment status.'));
    } finally {
      setBusy(null);
    }
  }

  async function downloadDocument(document: ApplicationDocument) {
    setBusy(document.id);
    try {
      const { data, error: signedUrlError } = await getApplicationDocumentUrl(document.file_path);
      if (signedUrlError || !data?.signedUrl) throw signedUrlError ?? new Error('Unable to create secure download link.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(errorMessage(err, 'Unable to download document.'));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section>
        <div className="content-card">
          <Loader2 size={20} className="spin" />
          <span className="muted"> Loading application...</span>
        </div>
      </section>
    );
  }

  if (!application) {
    return (
      <EmptyState
        title="Application not found"
        description="This application does not exist or is no longer available."
        action={
          <Link className="btn btn-primary" to="/admin/applications">
            Back to applications
          </Link>
        }
      />
    );
  }

  const canHire = hireReadyStatuses.includes(application.status) || Boolean(deployment);
  const interviewOpen = interview && ['invited', 'scheduled', 'rescheduled'].includes(interview.status);
  const interviewAwaitingDecision = interview && ['scheduled', 'rescheduled', 'completed'].includes(interview.status);

  return (
    <section>
      <Link to="/admin/applications" className="back-link">
        <ArrowLeft size={15} /> All applications
      </Link>

      <PageHeader
        eyebrow={`Reference ${application.application_number}`}
        title={candidate?.full_name || 'Candidate'}
        description={`${job?.title || 'Application'} · ${employer?.business_name || 'EnigteeWorld'}`}
        actions={<StatusBadge status={application.status} />}
      />

      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="stat-grid">
        <StatCard label="Role" value={job?.title || '—'} hint="Applied for" />
        <StatCard label="Employer" value={employer?.business_name || '—'} hint="Hiring organisation" />
        <StatCard label="Expected salary" value={formatMoney(application.expected_salary)} hint="Candidate expectation" />
        <StatCard label="Stage" value={pretty(application.status)} hint="Current status" />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <h2>Candidate documents</h2>
          <p className="hint">{candidate?.email}{candidate?.phone ? ` · ${candidate.phone}` : ''}</p>
          {documents.length === 0 ? (
            <EmptyState icon={FileText} title="No documents" description="This candidate has not submitted application documents." />
          ) : (
            documents.map((document) => (
              <div className="list-row" key={document.id}>
                <FileText size={18} />
                <div>
                  <strong>{document.original_name || pretty(document.document_kind)}</strong>
                  <p>{pretty(document.document_kind)}</p>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={busy === document.id}
                  onClick={() => void downloadDocument(document)}
                >
                  {busy === document.id ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                  Download
                </button>
              </div>
            ))
          )}
        </div>

        <div className="content-card">
          <h2>Application stage</h2>
          <p className="hint">Every stage change emails the candidate and posts to their dashboard.</p>
          <div className="form">
            <label>
              Move to stage
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {manualStatuses.map((item) => (
                  <option value={item} key={item}>
                    {pretty(item)}
                    {item === application.status ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Message to candidate (optional - shown in their dashboard and email)
              <textarea
                rows={3}
                value={hrMessage}
                onChange={(event) => setHrMessage(event.target.value)}
                placeholder="e.g. Please keep your phone reachable this week."
              />
            </label>
            <label>
              Internal note (never shown to the candidate)
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a recruitment note." />
            </label>
            <button className="btn btn-primary" type="button" disabled={busy === 'stage'} onClick={() => void saveStage()}>
              {busy === 'stage' ? 'Updating...' : 'Update application'}
            </button>
            <p className="hint">Use the panels below to schedule an interview or to hire and deploy - those steps set their own stages.</p>
          </div>
        </div>
      </div>

      {/* ---------------- Interview ---------------- */}
      <div className="content-card section-gap">
        <div className="card-heading">
          <h2>
            <CalendarDays size={20} style={{ verticalAlign: '-3px' }} />{' '}
            {interviewOpen ? 'Interview (edit / reschedule)' : 'Schedule interview'}
          </h2>
          {interview ? <StatusBadge status={interview.status} /> : null}
        </div>

        {interview && interview.scheduled_for ? (
          <dl className="detail-grid">
            <div>
              <dt>Scheduled for</dt>
              <dd>{formatDateTime(interview.scheduled_for)}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{pretty(interview.mode)}</dd>
            </div>
          </dl>
        ) : null}

        <form className="form" onSubmit={scheduleInterview}>
          <div className="row-2">
            <label>
              Date and time
              <input type="datetime-local" value={ivWhen} onChange={(event) => setIvWhen(event.target.value)} required />
            </label>
            <label>
              Format
              <select value={ivMode} onChange={(event) => setIvMode(event.target.value)}>
                <option value="online">Online (video call)</option>
                <option value="in_person">In person</option>
                <option value="phone">Phone call</option>
              </select>
            </label>
          </div>
          <div className="row-2">
            {ivMode === 'online' ? (
              <label>
                Meeting link
                <input type="url" value={ivUrl} onChange={(event) => setIvUrl(event.target.value)} placeholder="https://meet.google.com/..." />
              </label>
            ) : null}
            {ivMode === 'in_person' ? (
              <label>
                Venue
                <input value={ivLocation} onChange={(event) => setIvLocation(event.target.value)} placeholder="Office address and floor" />
              </label>
            ) : null}
            <label>
              Duration (minutes)
              <input type="number" min={5} value={ivDuration} onChange={(event) => setIvDuration(event.target.value)} placeholder="30" />
            </label>
          </div>
          <label>
            Interview details for the candidate
            <textarea
              rows={4}
              value={ivNotes}
              onChange={(event) => setIvNotes(event.target.value)}
              placeholder="What to bring, who will interview them, how to prepare, dress code..."
              required
            />
          </label>
          <div className="inline-actions">
            <button className="btn btn-primary" type="submit" disabled={busy === 'interview'}>
              {busy === 'interview' ? 'Saving...' : interviewOpen ? 'Save & notify candidate' : 'Schedule & notify candidate'}
            </button>
          </div>
        </form>

        {interviewAwaitingDecision && interview ? (
          <div className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
            <strong>Interview outcome</strong>
            <label>
              Outcome feedback (the candidate can see this)
              <textarea rows={2} value={ivOutcome} onChange={(event) => setIvOutcome(event.target.value)} />
            </label>
            <div className="inline-actions">
              {interview.status !== 'completed' ? (
                <button className="btn btn-secondary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void setInterviewOutcome('completed')}>
                  Mark interview completed
                </button>
              ) : null}
              <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void setInterviewOutcome('successful')}>
                Candidate successful
              </button>
              <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void setInterviewOutcome('unsuccessful')}>
                Not successful
              </button>
              <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void setInterviewOutcome('cancelled')}>
                Cancel interview
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------------- Documents to candidate ---------------- */}
      <div className="dashboard-grid section-gap">
        <div className="content-card">
          <h2>
            <Send size={19} style={{ verticalAlign: '-3px' }} /> Send a document to the candidate
          </h2>
          <p className="hint">
            The candidate sees it on their Documents page, is notified in the dashboard and by email, and can download it.
          </p>
          <form className="form" onSubmit={sendDocument}>
            <label>
              Source
              <select value={docSource} onChange={(event) => setDocSource(event.target.value as 'upload' | 'existing')}>
                <option value="upload">Upload a new file</option>
                <option value="existing" disabled={resources.length === 0}>
                  Reuse a document I already uploaded
                </option>
              </select>
            </label>

            {docSource === 'upload' ? (
              <>
                <label>
                  File (PDF, DOC, DOCX, JPG or PNG - max 5 MB)
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="row-2">
                  <label>
                    Title
                    <input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Recruitment form" />
                  </label>
                  <label>
                    Type
                    <select value={docKind} onChange={(event) => setDocKind(event.target.value)}>
                      <option value="recruitment_form">Recruitment form</option>
                      <option value="onboarding_form">Onboarding form</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
                <label>
                  Description (optional)
                  <input value={docDescription} onChange={(event) => setDocDescription(event.target.value)} />
                </label>
              </>
            ) : (
              <label>
                Document
                <select value={docResourceId} onChange={(event) => setDocResourceId(event.target.value)}>
                  <option value="">Select a document</option>
                  {resources.map((resource) => (
                    <option value={resource.id} key={resource.id}>
                      {resource.title} ({pretty(resource.document_kind)})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Note to candidate (optional)
              <textarea
                rows={2}
                value={docNote}
                onChange={(event) => setDocNote(event.target.value)}
                placeholder="Fill, sign and upload the completed form by Friday."
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy === 'document'}>
              {busy === 'document' ? 'Sending...' : 'Send document'}
            </button>
          </form>
        </div>

        <div className="content-card">
          <h2>Documents sent</h2>
          {sentDocuments.length === 0 ? (
            <p className="muted">Nothing sent to this candidate yet.</p>
          ) : (
            sentDocuments.map((item) => {
              const resource = one(item.document_resources);
              return (
                <div className="list-row" key={item.id}>
                  <FileText size={18} />
                  <div>
                    <strong>{resource?.title ?? 'Document'}</strong>
                    <p>
                      {resource ? pretty(resource.document_kind) : ''} · sent {formatDateTime(item.created_at)}
                    </p>
                  </div>
                  <span className="tag">
                    {item.downloaded_at ? 'Downloaded' : item.viewed_at ? 'Viewed' : 'Not opened'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ---------------- Hire / deploy ---------------- */}
      <div className="content-card section-gap">
        <div className="card-heading">
          <h2>
            <UserCheck size={20} style={{ verticalAlign: '-3px' }} /> Employment & deployment
          </h2>
          {deployment ? <StatusBadge status={deployment.status} /> : null}
        </div>

        {!canHire ? (
          <p className="muted">
            Available once the candidate has finished the interview stage (Interview completed, Successful or Selected).
          </p>
        ) : (
          <>
            <p className="hint">
              Assigning the candidate creates the deployment, moves the application to Employed (when activated), notifies the
              employee, and lists them under the employer’s Employees so workforce management can begin.
            </p>
            <form className="form" onSubmit={assignPlacement}>
              <div className="row-2">
                <label>
                  Employer
                  <select
                    value={dpEmployer}
                    onChange={(event) => {
                      setDpEmployer(event.target.value);
                      setDpEstablishment('');
                    }}
                    required
                  >
                    <option value="">Select employer</option>
                    {employers.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.business_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Establishment
                  <select value={dpEstablishment} onChange={(event) => setDpEstablishment(event.target.value)} required>
                    <option value="">{dpEmployer ? 'Select establishment' : 'Select employer first'}</option>
                    {establishments.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                        {item.is_default ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row-2">
                <label>
                  Role title
                  <input value={dpRole} onChange={(event) => setDpRole(event.target.value)} required />
                </label>
                <label>
                  Agreed monthly salary (NGN)
                  <input type="number" min={0} value={dpSalary} onChange={(event) => setDpSalary(event.target.value)} />
                </label>
              </div>
              <div className="row-2">
                <label>
                  Start date
                  <input type="date" value={dpStart} onChange={(event) => setDpStart(event.target.value)} />
                </label>
                <label>
                  Employment status
                  <select value={dpStatus} onChange={(event) => setDpStatus(event.target.value)}>
                    <option value="active">Employed - active now</option>
                    <option value="pending_start">Confirmed - starts on the start date</option>
                    <option value="onboarding">Onboarding first</option>
                    <option value="selected">Selected - placement to be confirmed</option>
                  </select>
                </label>
              </div>
              <label>
                Message to the employee (optional)
                <textarea rows={2} value={dpMessage} onChange={(event) => setDpMessage(event.target.value)} placeholder="Report to the front desk at 8am on your first day." />
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy === 'deploy'}>
                {busy === 'deploy' ? 'Saving...' : deployment ? 'Update placement' : 'Employ & assign to employer'}
              </button>
            </form>

            {deployment ? (
              <div className="inline-actions" style={{ marginTop: 18 }}>
                <span className="muted small">Change employment status:</span>
                {deployment.status !== 'active' ? (
                  <button className="btn btn-secondary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void changeDeploymentStatus('active')}>
                    Activate
                  </button>
                ) : null}
                <button className="btn btn-secondary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void changeDeploymentStatus('on_leave')}>
                  On leave
                </button>
                <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void changeDeploymentStatus('suspended')}>
                  Suspend
                </button>
                <button className="btn btn-secondary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void changeDeploymentStatus('completed')}>
                  Complete
                </button>
                <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void changeDeploymentStatus('terminated')}>
                  Terminate
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {application.cover_letter ? (
        <div className="content-card section-gap">
          <h2>Cover letter</h2>
          <p className="muted">{application.cover_letter}</p>
        </div>
      ) : null}

      <div className="content-card section-gap">
        <h2>Stage history</h2>
        {events.length === 0 ? (
          <p className="muted">History appears here after the workflow patch is installed and the next status change is made.</p>
        ) : (
          <ul className="timeline">
            {events.map((item) => (
              <li key={item.id}>
                <strong>{pretty(item.status)}</strong>
                <p>
                  {formatDateTime(item.created_at)}
                  {item.message ? `\n${item.message}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
