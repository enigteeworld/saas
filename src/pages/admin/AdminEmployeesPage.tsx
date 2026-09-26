import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  establishment: string;
  startDate: string;
  status: string;
};

export default function AdminEmployeesPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('deployments')
        .select(`
          id,
          employee_id,
          role_title,
          establishment_id,
          start_date,
          status,
          profiles:employee_id (full_name),
          establishments:establishment_id (name)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setRows(
          (data ?? []).map((item) => {
            const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
            const establishment = Array.isArray(item.establishments) ? item.establishments[0] : item.establishments;
            return {
              id: item.id,
              name: profile?.full_name ?? 'Unknown employee',
              role: item.role_title,
              establishment: establishment?.name ?? '—',
              startDate: item.start_date
                ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(item.start_date))
                : '—',
              status: item.status,
            };
          }),
        );
      }

      setLoading(false);
    }

    void load();
  }, []);

  const columns: Column<EmployeeRow>[] = [
    { key: 'id', header: 'Reference' },
    { key: 'name', header: 'Employee' },
    { key: 'role', header: 'Role' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'startDate', header: 'Start date' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link className="table-link" to={`/admin/employees/${row.id}`}>
          View details
        </Link>
      ),
    },
  ];

  const active = rows.filter((row) => row.status === 'active').length;

  return (
    <section>
      <PageHeader eyebrow="Workforce" title="Employees" description="Every employee currently deployed through EnigteeWorld." />
      <div className="stat-grid">
        <StatCard label="Employees" value={loading ? '—' : rows.length} hint="Deployments" />
        <StatCard label="Active" value={loading ? '—' : active} hint="Confirmed staff" />
        <StatCard label="Onboarding" value={loading ? '—' : rows.filter((row) => row.status === 'onboarding').length} hint="Preparing to start" />
      </div>
      <div className="content-card">
        {loading ? <p className="muted">Loading employees...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No employees deployed" emptyDescription="Deployed candidates appear here automatically." />
        )}
      </div>
    </section>
  );
}
