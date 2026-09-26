import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

type Row = {
  id: string;
  applicationId: string;
  reference: string;
  candidate: string;
  jobTitle: string;
  date: string;
  time: string;
  mode: string;
  status: string;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminInterviewsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error: queryError } = await supabase
        .from('interviews')
        .select(`
          id,
          scheduled_for,
          meeting_url,
          mode,
          status,
          application_id,
          job_applications:application_id (
            application_number,
            profiles:applicant_id (full_name),
            job_openings:job_id (title)
          )
        `)
        .order('scheduled_for', { ascending: true, nullsFirst: false });

      if (queryError) {
        console.error(queryError);
        setError(errorMessage(queryError));
      } else {
        setRows(
          (data ?? []).map((item) => {
            const application = one(item.job_applications);
            const profile = one(application?.profiles);
            const job = one(application?.job_openings);
            const date = item.scheduled_for ? new Date(item.scheduled_for) : null;
            return {
              id: item.id,
              applicationId: item.application_id,
              reference: application?.application_number ?? item.application_id,
              candidate: profile?.full_name ?? 'Unknown candidate',
              jobTitle: job?.title ?? 'Unknown role',
              date: date
                ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
                : 'Not scheduled',
              time: date ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
              mode: item.mode === 'in_person' ? 'In person' : item.mode === 'phone' ? 'Phone' : 'Online',
              status: item.status,
            };
          }),
        );
      }
      setLoading(false);
    }
    void load();
  }, []);

  const columns: Column<Row>[] = [
    { key: 'reference', header: 'Application' },
    { key: 'candidate', header: 'Candidate' },
    { key: 'jobTitle', header: 'Role' },
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time' },
    { key: 'mode', header: 'Mode' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link className="table-link" to={`/admin/applications/${row.applicationId}`}>
          Manage
        </Link>
      ),
    },
  ];

  const upcoming = rows.filter((row) => ['scheduled', 'rescheduled'].includes(row.status)).length;

  return (
    <section>
      <PageHeader
        eyebrow="Recruitment"
        title="Interviews"
        description="Scheduling and outcomes for every candidate interview. Open an application to schedule, reschedule or record an outcome."
      />
      {error ? <div className="error-message">{error}</div> : null}
      <div className="stat-grid">
        <StatCard label="Interviews" value={loading ? '—' : rows.length} hint="All time" />
        <StatCard label="Upcoming" value={loading ? '—' : upcoming} hint="Scheduled" />
        <StatCard label="Successful" value={loading ? '—' : rows.filter((row) => row.status === 'successful').length} hint="Passed" />
      </div>
      <div className="content-card">
        {loading ? (
          <p className="muted">Loading interviews...</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            emptyTitle="No interviews scheduled"
            emptyDescription="Open an application and use “Schedule interview” to arrange one."
          />
        )}
      </div>
    </section>
  );
}
