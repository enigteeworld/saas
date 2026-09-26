import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  name: string;
  role: string;
  establishment: string;
  startDate: string;
  status: string;
};

export default function EmployerEmployeesPage() {
  const user = useAuthStore((state) => state.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('deployments')
        .select(`
          id,
          role_title,
          start_date,
          status,
          profiles:employee_id (full_name),
          establishments:establishment_id (name)
        `)
        .order('created_at', { ascending: false });

      if (error) console.error(error);
      else {
        setRows((data ?? []).map((item) => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          const establishment = Array.isArray(item.establishments) ? item.establishments[0] : item.establishments;
          return {
            id: item.id,
            name: profile?.full_name ?? 'Unknown employee',
            role: item.role_title,
            establishment: establishment?.name ?? '—',
            startDate: item.start_date ? new Date(item.start_date).toLocaleDateString('en-NG') : '—',
            status: item.status,
          };
        }));
      }

      setLoading(false);
    }

    void load();
  }, [user?.id]);

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'role', header: 'Role' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'startDate', header: 'Start date' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => <Link className="table-link" to={`/employer/employees/${row.id}`}>View</Link>,
    },
  ];

  return (
    <section>
      <PageHeader eyebrow="Workforce" title="Your employees" description="People currently deployed to your establishments through EnigteeWorld." />
      <div className="stat-grid">
        <StatCard label="Employees" value={loading ? '—' : rows.length} hint="Deployments" />
        <StatCard label="Active" value={loading ? '—' : rows.filter((row) => row.status === 'active').length} hint="Confirmed staff" />
        <StatCard label="Onboarding" value={loading ? '—' : rows.filter((row) => row.status === 'onboarding').length} hint="Preparing to start" />
        <StatCard label="Establishments" value={loading ? '—' : new Set(rows.map((row) => row.establishment)).size} hint="With deployed staff" />
      </div>
      <div className="content-card">
        {loading ? <p className="muted">Loading employees...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No employees yet" emptyDescription="Deployed candidates will appear here." />
        )}
      </div>
    </section>
  );
}
