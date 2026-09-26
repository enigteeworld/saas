import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';

type ApplicationRow = {
  id: string;
  application_number: string;
  candidate: string;
  job_title: string;
  employer: string;
  submitted: string;
  status: string;
};

export default function AdminApplicationsPage() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('job_applications')
        .select(`
          id,
          application_number,
          status,
          submitted_at,
          applicant_id,
          job_id,
          profiles:applicant_id (full_name),
          job_openings:job_id (
            title,
            employer_id,
            employer_profiles:employer_id (business_name)
          )
        `)
        .order('submitted_at', { ascending: false });

      if (queryError) throw queryError;

      setRows(
        (data ?? []).map((item) => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          const job = Array.isArray(item.job_openings)
            ? item.job_openings[0]
            : item.job_openings;
          const employer = job?.employer_profiles
            ? Array.isArray(job.employer_profiles)
              ? job.employer_profiles[0]
              : job.employer_profiles
            : null;

          return {
            id: item.id,
            application_number: item.application_number,
            candidate: profile?.full_name ?? 'Unknown candidate',
            job_title: job?.title ?? 'Unknown role',
            employer: employer?.business_name ?? 'EnigteeWorld',
            submitted: new Intl.DateTimeFormat('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }).format(new Date(item.submitted_at)),
            status: item.status,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load applications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<ApplicationRow>[] = [
    { key: 'application_number', header: 'Reference' },
    { key: 'candidate', header: 'Candidate' },
    { key: 'job_title', header: 'Role' },
    { key: 'employer', header: 'Employer' },
    { key: 'submitted', header: 'Submitted' },
    {
      key: 'status',
      header: 'Stage',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link className="table-link" to={`/admin/applications/${row.id}`}>
          Review
        </Link>
      ),
    },
  ];

  const count = (status: string) =>
    rows.filter((row) => row.status === status).length;

  return (
    <section>
      <PageHeader
        eyebrow="Recruitment"
        title="Applications"
        description="Every application received, with its current recruitment stage."
      />

      {error ? <div className="error-message">{error}</div> : null}

      <div className="stat-grid">
        <StatCard label="Total" value={loading ? '—' : rows.length} hint="All applications" />
        <StatCard label="Screening" value={loading ? '—' : count('under_review')} hint="Under review" />
        <StatCard label="Interview" value={loading ? '—' : count('interview_scheduled')} hint="Scheduled" />
        <StatCard label="Deployed" value={loading ? '—' : count('employed')} hint="Currently employed" />
      </div>

      <div className="content-card">
        {loading ? (
          <div className="empty-state"><p>Loading applications...</p></div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            emptyTitle="No applications yet"
            emptyDescription="Applications appear here as candidates apply."
          />
        )}
      </div>
    </section>
  );
}
