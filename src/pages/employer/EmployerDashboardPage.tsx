import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, Building2, Receipt, Users } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/format';

type Candidate = {
  id: string;
  name: string;
  job: string;
  status: string;
};

type Establishment = {
  id: string;
  name: string;
  address: string;
  employees: number;
};

export default function EmployerDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const [jobs, setJobs] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [employees, setEmployees] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data: employer, error: employerError } = await supabase
        .from('employer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (employerError) {
        console.error(employerError);
        setLoading(false);
        return;
      }

      const [jobsResult, applicationsResult, deploymentsResult, invoicesResult, establishmentsResult] =
        await Promise.all([
          supabase.from('job_openings').select('id', { count: 'exact', head: true }).eq('employer_id', employer.id),
          supabase
            .from('job_applications')
            .select(`
              id,
              status,
              profiles:applicant_id (full_name),
              job_openings:job_id (title, employer_id)
            `)
            .order('submitted_at', { ascending: false })
            .limit(4),
          supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('employer_id', employer.id).eq('status', 'active'),
          supabase.from('invoices').select('total, status').eq('employer_id', employer.id),
          supabase.from('establishments').select('id, name, address').eq('employer_id', employer.id).order('name'),
        ]);

      if (jobsResult.error) console.error(jobsResult.error);
      if (applicationsResult.error) console.error(applicationsResult.error);
      if (deploymentsResult.error) console.error(deploymentsResult.error);
      if (invoicesResult.error) console.error(invoicesResult.error);
      if (establishmentsResult.error) console.error(establishmentsResult.error);

      setJobs(jobsResult.count ?? 0);
      setEmployees(deploymentsResult.count ?? 0);
      setOutstanding(
        (invoicesResult.data ?? [])
          .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'draft')
          .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0),
      );

      setCandidates((applicationsResult.data ?? []).map((item) => {
        const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const job = Array.isArray(item.job_openings) ? item.job_openings[0] : item.job_openings;
        return {
          id: item.id,
          name: profile?.full_name ?? 'Candidate',
          job: job?.title ?? 'Role',
          status: item.status,
        };
      }));

      const establishmentRows = await Promise.all(
        (establishmentsResult.data ?? []).map(async (item) => {
          const { count } = await supabase
            .from('deployments')
            .select('id', { count: 'exact', head: true })
            .eq('establishment_id', item.id)
            .eq('status', 'active');

          return {
            id: item.id,
            name: item.name,
            address: item.address,
            employees: count ?? 0,
          };
        }),
      );

      setEstablishments(establishmentRows);
      setLoading(false);
    }

    void load();
  }, [user?.id]);

  return (
    <section>
      <PageHeader
        eyebrow="Employer workspace"
        title="Workforce overview"
        description="Your establishments, candidates, employees and billing at a glance."
        actions={
          <Link className="btn btn-primary" to="/employer/jobs">
            Request staff <ArrowRight size={16} />
          </Link>
        }
      />

      <div className="stat-grid">
        <StatCard label="Job requests" value={loading ? '—' : jobs} hint="Your staffing requests" icon={BriefcaseBusiness} />
        <StatCard label="Candidates" value={loading ? '—' : candidates.length} hint="Recent applications" icon={Users} />
        <StatCard label="Active employees" value={loading ? '—' : employees} hint="Deployed to you" icon={Building2} />
        <StatCard label="Outstanding" value={loading ? '—' : formatCurrency(outstanding)} hint="Unpaid invoices" icon={Receipt} />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <div className="card-heading">
            <h2>Latest candidates</h2>
            <Link to="/employer/candidates">View all</Link>
          </div>
          {candidates.length === 0 ? <p className="muted">No applications yet.</p> : candidates.map((candidate) => (
            <div className="application-row" key={candidate.id}>
              <div>
                <h3>{candidate.name}</h3>
                <p>{candidate.job}</p>
              </div>
              <StatusBadge status={candidate.status} />
            </div>
          ))}
        </div>

        <div className="content-card">
          <div className="card-heading">
            <h2>Your establishments</h2>
            <Link to="/employer/establishments">Manage</Link>
          </div>
          {establishments.length === 0 ? <p className="muted">No establishments registered.</p> : establishments.map((establishment) => (
            <div className="list-row" key={establishment.id}>
              <Building2 size={18} />
              <div>
                <strong>{establishment.name}</strong>
                <p>{establishment.address} · {establishment.employees} employees</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
