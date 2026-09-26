import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BriefcaseBusiness, CalendarDays, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';

type InterviewNotice = {
  id: string;
  scheduled_for: string | null;
  status: string;
  mode: string | null;
  location: string | null;
  meeting_url: string | null;
  instructions: string | null;
  job_applications: unknown;
};

type DocumentNotice = {
  id: string;
  created_at: string;
  document_resources: { title: string } | { title: string }[] | null;
};

type DeploymentNotice = {
  id: string;
  role_title: string;
  status: string;
  start_date: string | null;
  employer_profiles: { business_name: string } | { business_name: string }[] | null;
  establishments: { name: string } | { name: string }[] | null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * "Notice board" for the employee dashboard (in the spirit of a student portal):
 * upcoming interview details, documents to download, employment status and latest alerts.
 */
export default function EmployeeNoticeBoard() {
  const user = useAuthStore((state) => state.user);
  const { items: notifications } = useNotifications(user?.id, 10);
  const [interviews, setInterviews] = useState<InterviewNotice[]>([]);
  const [documents, setDocuments] = useState<DocumentNotice[]>([]);
  const [deployment, setDeployment] = useState<DeploymentNotice | null>(null);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const [interviewRes, documentRes, deploymentRes] = await Promise.all([
        supabase
          .from('interviews')
          .select('id, scheduled_for, status, mode, location, meeting_url, instructions, job_applications:application_id (applicant_id, job_openings:job_id (title))')
          .in('status', ['invited', 'scheduled', 'rescheduled'])
          .order('scheduled_for', { ascending: true }),
        supabase
          .from('document_assignments')
          .select('id, created_at, document_resources (title)')
          .eq('profile_id', user.id)
          .is('downloaded_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('deployments')
          .select('id, role_title, status, start_date, employer_profiles:employer_id (business_name), establishments:establishment_id (name)')
          .eq('employee_id', user.id)
          .in('status', ['selected', 'onboarding', 'pending_start', 'active', 'on_leave', 'suspended'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setInterviews(
        ((interviewRes.data ?? []) as InterviewNotice[]).filter((item) => {
          const application = one(item.job_applications as { applicant_id: string } | { applicant_id: string }[] | null);
          return !application || application.applicant_id === user.id;
        }),
      );
      setDocuments((documentRes.data ?? []) as unknown as DocumentNotice[]);
      setDeployment((deploymentRes.data ?? null) as unknown as DeploymentNotice | null);
    }
    void load();
  }, [user?.id]);

  const unread = notifications.filter((item) => !item.is_read).slice(0, 4);
  const hasAnything = interviews.length > 0 || documents.length > 0 || deployment || unread.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="content-card" style={{ marginBottom: 20 }}>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Notice board</span>
          <h2>What needs your attention</h2>
        </div>
        <Link to="/employee/notifications">All notifications</Link>
      </div>

      <div className="notice-board" style={{ marginTop: 16 }}>
        {deployment ? (
          <div className="notice-card">
            <h3>
              <BriefcaseBusiness size={16} style={{ verticalAlign: '-2px' }} />{' '}
              {deployment.status === 'active' ? 'You are employed' : 'Placement confirmed'}
            </h3>
            <p>
              {deployment.role_title} at {one(deployment.establishments)?.name ?? 'your establishment'} (
              {one(deployment.employer_profiles)?.business_name ?? 'employer'}) · status:{' '}
              {deployment.status.replace(/_/g, ' ')}
              {deployment.start_date ? ` · start ${new Date(deployment.start_date).toLocaleDateString('en-NG')}` : ''}
            </p>
            <div className="notice-actions">
              <Link className="btn btn-secondary btn-sm" to="/employee/employment">
                Employment details
              </Link>
            </div>
          </div>
        ) : null}

        {interviews.map((item) => {
          const application = one(item.job_applications as { job_openings: { title: string } | { title: string }[] | null } | { job_openings: { title: string } | { title: string }[] | null }[] | null);
          const title = one(application?.job_openings)?.title ?? 'your application';
          return (
            <div className="notice-card warn" key={item.id}>
              <h3>
                <CalendarDays size={16} style={{ verticalAlign: '-2px' }} /> Interview: {title}
              </h3>
              <p>
                <strong>
                  {item.scheduled_for
                    ? new Date(item.scheduled_for).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                    : 'Date to be confirmed'}
                </strong>
                {' · '}
                {item.mode === 'in_person' ? `In person${item.location ? ` - ${item.location}` : ''}` : item.mode === 'phone' ? 'Phone call' : 'Online'}
              </p>
              {item.instructions ? <p>{item.instructions}</p> : null}
              <div className="notice-actions">
                {item.meeting_url ? (
                  <a className="btn btn-primary btn-sm" href={item.meeting_url} target="_blank" rel="noreferrer">
                    Join interview
                  </a>
                ) : null}
                <Link className="btn btn-secondary btn-sm" to="/employee/interviews">
                  Full details
                </Link>
              </div>
            </div>
          );
        })}

        {documents.length > 0 ? (
          <div className="notice-card">
            <h3>
              <FileText size={16} style={{ verticalAlign: '-2px' }} /> {documents.length} document{documents.length === 1 ? '' : 's'} waiting for you
            </h3>
            <p>{documents.map((item) => one(item.document_resources)?.title ?? 'Document').join(', ')}</p>
            <div className="notice-actions">
              <Link className="btn btn-secondary btn-sm" to="/employee/documents">
                Download documents
              </Link>
            </div>
          </div>
        ) : null}

        {unread.map((item) => (
          <div className="notice-card" key={item.id}>
            <h3>
              <Bell size={16} style={{ verticalAlign: '-2px' }} /> {item.title}
            </h3>
            <p>{item.message.length > 220 ? `${item.message.slice(0, 220)}...` : item.message}</p>
            <p className="muted small">{new Date(item.created_at).toLocaleString('en-NG')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
