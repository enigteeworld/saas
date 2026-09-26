import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Deployment = {
  id: string;
  role_title: string;
  status: string;
  start_date: string | null;
  agreed_salary: number;
  employer: string;
  establishment: string;
};

export default function EmployeeEmploymentPage() {
  const user = useAuthStore((state) => state.user);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('deployments')
        .select(`
          id,
          role_title,
          status,
          start_date,
          agreed_salary,
          employer_profiles:employer_id (business_name),
          establishments:establishment_id (name)
        `)
        .eq('employee_id', user.id)
        .in('status', ['selected', 'onboarding', 'pending_start', 'active', 'on_leave'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) console.error(error);
      else if (data) {
        const employer = Array.isArray(data.employer_profiles) ? data.employer_profiles[0] : data.employer_profiles;
        const establishment = Array.isArray(data.establishments) ? data.establishments[0] : data.establishments;
        setDeployment({
          id: data.id,
          role_title: data.role_title,
          status: data.status,
          start_date: data.start_date,
          agreed_salary: Number(data.agreed_salary ?? 0),
          employer: employer?.business_name ?? 'EnigteeWorld',
          establishment: establishment?.name ?? '—',
        });
      }

      setLoading(false);
    }
    void load();
  }, [user?.id]);

  return (
    <section>
      <PageHeader eyebrow="Employment" title="Your employment status" description="Details of your current placement, establishment and start date." />
      {loading ? <div className="content-card"><p className="muted">Loading employment...</p></div> : deployment ? (
        <>
          <div className="stat-grid">
            <StatCard label="Role" value={deployment.role_title} hint="Current position" />
            <StatCard label="Employer" value={deployment.employer} hint="Deployed to" />
            <StatCard label="Status" value={deployment.status.replace(/_/g, ' ')} hint="Employment state" />
            <StatCard label="Started" value={deployment.start_date ? new Date(deployment.start_date).toLocaleDateString('en-NG') : '—'} hint="Start date" />
          </div>
          <div className="content-card">
            <h2>Employment summary</h2>
            <p className="muted">You are currently deployed through EnigteeWorld at {deployment.establishment}. Attendance, payroll and employment documents are available from your workspace.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/employee/attendance">Go to attendance</Link>
              <Link className="btn btn-secondary" to="/employee/payroll">View payroll</Link>
            </div>
          </div>
        </>
      ) : (
        <div className="content-card">
          <EmptyState icon={BriefcaseBusiness} title="You are not currently employed" description="Once an application reaches deployment, your employment details will appear here." action={<Link className="btn btn-primary" to="/jobs">Browse open roles</Link>} />
        </div>
      )}
    </section>
  );
}
