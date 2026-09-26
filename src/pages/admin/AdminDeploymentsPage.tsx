import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type Row = {
  id: string;
  applicationId: string | null;
  name: string;
  role: string;
  employer: string;
  establishment: string;
  startDate: string;
  status: string;
};

type Pending = {
  id: string;
  number: string;
  candidate: string;
  job: string;
  status: string;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminDeploymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const [deploymentsRes, readyRes] = await Promise.all([
      supabase
        .from('deployments')
        .select(`
          id,
          application_id,
          role_title,
          start_date,
          status,
          profiles:employee_id (full_name),
          employer_profiles:employer_id (business_name),
          establishments:establishment_id (name)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('job_applications')
        .select(`
          id,
          application_number,
          status,
          profiles:applicant_id (full_name),
          job_openings:job_id (title)
        `)
        .in('status', ['successful', 'selected', 'interview_completed'])
        .order('updated_at', { ascending: false }),
    ]);

    if (deploymentsRes.error) {
      console.error(deploymentsRes.error);
      setError(errorMessage(deploymentsRes.error));
    } else {
      const deployed = new Set((deploymentsRes.data ?? []).map((item) => item.application_id));
      setRows(
        (deploymentsRes.data ?? []).map((item) => ({
          id: item.id,
          applicationId: item.application_id,
          name: one(item.profiles)?.full_name ?? 'Unknown employee',
          role: item.role_title,
          employer: one(item.employer_profiles)?.business_name ?? '—',
          establishment: one(item.establishments)?.name ?? '—',
          startDate: item.start_date
            ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(item.start_date))
            : '—',
          status: item.status,
        })),
      );
      setPending(
        (readyRes.data ?? [])
          .filter((item) => !deployed.has(item.id))
          .map((item) => ({
            id: item.id,
            number: item.application_number,
            candidate: one(item.profiles)?.full_name ?? 'Candidate',
            job: one(item.job_openings)?.title ?? 'Role',
            status: item.status,
          })),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: string) {
    setBusy(`${id}-${status}`);
    setError('');
    const { error: updateError } = await supabase.from('deployments').update({ status }).eq('id', id);
    if (updateError) setError(errorMessage(updateError));
    else {
      flushEmailOutbox();
      await load();
    }
    setBusy(null);
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'role', header: 'Deployed as' },
    { key: 'employer', header: 'Employer' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'startDate', header: 'Start date' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
          {['onboarding', 'pending_start', 'selected', 'suspended', 'on_leave'].includes(row.status) ? (
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy === `${row.id}-active`} onClick={() => void setStatus(row.id, 'active')}>
              Activate
            </button>
          ) : null}
          {row.status === 'active' ? (
            <button className="btn btn-danger btn-sm" type="button" disabled={busy === `${row.id}-suspended`} onClick={() => void setStatus(row.id, 'suspended')}>
              Suspend
            </button>
          ) : null}
          {row.applicationId ? (
            <Link className="table-link" to={`/admin/applications/${row.applicationId}`}>
              Open
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader eyebrow="Operations" title="Deployments" description="Selected candidates moving from offer into active employment." />
      {error ? <div className="error-message">{error}</div> : null}

      <div className="stat-grid">
        <StatCard label="Deployments" value={loading ? '—' : rows.length} hint="All time" />
        <StatCard label="Active" value={loading ? '—' : rows.filter((row) => row.status === 'active').length} hint="Current workforce" />
        <StatCard
          label="Onboarding"
          value={loading ? '—' : rows.filter((row) => ['onboarding', 'pending_start', 'selected'].includes(row.status)).length}
          hint="Preparing to start"
        />
        <StatCard label="Ready to deploy" value={loading ? '—' : pending.length} hint="Successful, not yet placed" />
      </div>

      {pending.length > 0 ? (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2>Ready to be employed</h2>
          <p className="hint">These candidates passed recruitment but are not assigned to an employer yet.</p>
          {pending.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.candidate}</strong>
                <p>
                  {item.job} · {item.number}
                </p>
              </div>
              <StatusBadge status={item.status} />
              <Link className="btn btn-primary btn-sm" to={`/admin/applications/${item.id}`}>
                Assign to employer
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      <div className="content-card">
        {loading ? (
          <p className="muted">Loading deployments...</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            emptyTitle="No deployments yet"
            emptyDescription="Open a successful application and choose “Employ & assign to employer”."
          />
        )}
      </div>
    </section>
  );
}
