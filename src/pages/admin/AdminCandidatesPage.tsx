import { useEffect, useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';

type CandidateRow = {
  id: string;
  candidate: string;
  jobTitle: string;
  submitted: string;
  status: string;
};

export default function AdminCandidatesPage() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('job_applications')
        .select(`
          id,
          status,
          submitted_at,
          applicant_id,
          job_id,
          profiles:applicant_id (full_name),
          job_openings:job_id (title)
        `)
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setRows(
          (data ?? []).map((item) => {
            const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
            const job = Array.isArray(item.job_openings) ? item.job_openings[0] : item.job_openings;
            return {
              id: item.id,
              candidate: profile?.full_name ?? 'Unknown candidate',
              jobTitle: job?.title ?? 'Unknown role',
              submitted: new Intl.DateTimeFormat('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(new Date(item.submitted_at)),
              status: item.status,
            };
          }),
        );
      }

      setLoading(false);
    }

    void load();
  }, []);

  const columns: Column<CandidateRow>[] = [
    { key: 'candidate', header: 'Candidate' },
    { key: 'jobTitle', header: 'Latest application' },
    { key: 'submitted', header: 'Applied' },
    { key: 'status', header: 'Stage', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Talent pool"
        title="Candidates"
        description="Everyone who has applied through EnigteeWorld, with their latest stage."
      />
      <div className="content-card">
        {loading ? <p className="muted">Loading candidates...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No candidates yet" emptyDescription="Registered job seekers appear here once they apply." />
        )}
      </div>
    </section>
  );
}
