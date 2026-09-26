import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, CalendarDays, FileText, Users } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';

type Application = {
  id: string;
  candidate: string;
  jobTitle: string;
  employer: string;
  status: string;
};

type Interview = {
  id: string;
  candidate: string;
  jobTitle: string;
  scheduledFor: string;
  status: string;
};

export default function AdminDashboardPage() {
  const [openRoles, setOpenRoles] = useState(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [employees, setEmployees] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobsResult, applicationsResult, interviewsResult, deploymentsResult] = await Promise.all([
        supabase.from('job_openings').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase
          .from('job_applications')
          .select(`
            id,
            status,
            profiles:applicant_id (full_name),
            job_openings:job_id (
              title,
              employer_profiles:employer_id (business_name)
            )
          `)
          .order('submitted_at', { ascending: false })
          .limit(8),
        supabase
          .from('interviews')
          .select(`
            id,
            scheduled_for,
            status,
            job_applications:application_id (
              profiles:applicant_id (full_name),
              job_openings:job_id (title)
            )
          `)
          .not('scheduled_for', 'is', null)
          .order('scheduled_for', { ascending: true })
          .limit(6),
        supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      if (jobsResult.error) console.error(jobsResult.error);
      if (applicationsResult.error) console.error(applicationsResult.error);
      if (interviewsResult.error) console.error(interviewsResult.error);
      if (deploymentsResult.error) console.error(deploymentsResult.error);

      setOpenRoles(jobsResult.count ?? 0);
      setEmployees(deploymentsResult.count ?? 0);

      setApplications((applicationsResult.data ?? []).map((item) => {
        const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const job = Array.isArray(item.job_openings) ? item.job_openings[0] : item.job_openings;
        const employer = job?.employer_profiles
          ? Array.isArray(job.employer_profiles)
            ? job.employer_profiles[0]
            : job.employer_profiles
          : null;
        return {
          id: item.id,
          candidate: profile?.full_name ?? 'Unknown candidate',
          jobTitle: job?.title ?? 'Unknown role',
          employer: employer?.business_name ?? 'EnigteeWorld',
          status: item.status,
        };
      }));

      setInterviews((interviewsResult.data ?? []).map((item) => {
        const application = Array.isArray(item.job_applications) ? item.job_applications[0] : item.job_applications;
        const profile = application?.profiles ? (Array.isArray(application.profiles) ? application.profiles[0] : application.profiles) : null;
        const job = application?.job_openings ? (Array.isArray(application.job_openings) ? application.job_openings[0] : application.job_openings) : null;
        return {
          id: item.id,
          candidate: profile?.full_name ?? 'Unknown candidate',
          jobTitle: job?.title ?? 'Unknown role',
          scheduledFor: item.scheduled_for,
          status: item.status,
        };
      }));

      setLoading(false);
    }

    void load();
  }, []);

  return (
    <section>
      <PageHeader
        eyebrow="HR administration"
        title="Operations overview"
        description="Recruitment, deployment and workforce activity across every employer."
        actions={
          <Link className="btn btn-primary" to="/admin/jobs/new">
            Create job opening <ArrowRight size={16} />
          </Link>
        }
      />

      <div className="stat-grid">
        <StatCard label="Open roles" value={loading ? '—' : openRoles} hint="Published" icon={BriefcaseBusiness} />
        <StatCard label="Applications" value={loading ? '—' : applications.length} hint="Recent submissions" icon={FileText} />
        <StatCard label="Interviews" value={loading ? '—' : interviews.length} hint="Upcoming" icon={CalendarDays} />
        <StatCard label="Employees" value={loading ? '—' : employees} hint="Active deployments" icon={Users} />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <div className="card-heading">
            <h2>Applications needing attention</h2>
            <Link to="/admin/applications">View all</Link>
          </div>
          {applications.map((application) => (
            <div className="application-row" key={application.id}>
              <div>
                <h3>{application.candidate}</h3>
                <p>{application.jobTitle} · {application.employer}</p>
              </div>
              <div className="application-status">
                <StatusBadge status={application.status} />
                <Link to={`/admin/applications/${application.id}`}>Review</Link>
              </div>
            </div>
          ))}
        </div>

        <div className="content-card">
          <div className="card-heading">
            <h2>Upcoming interviews</h2>
            <Link to="/admin/interviews">View all</Link>
          </div>
          {interviews.map((interview) => (
            <div className="list-row" key={interview.id}>
              <CalendarDays size={18} />
              <div>
                <strong>{interview.candidate}</strong>
                <p>{interview.jobTitle} · {new Date(interview.scheduledFor).toLocaleString('en-NG')}</p>
              </div>
              <StatusBadge status={interview.status} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
