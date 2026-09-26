import { useEffect, useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  candidate: string;
  jobTitle: string;
  submitted: string;
  status: string;
};

export default function EmployerCandidatesPage() {
  const user = useAuthStore((state) => state.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('job_applications')
        .select(`
          id,
          status,
          submitted_at,
          applicant_id,
          job_id,
          profiles:applicant_id (full_name),
          job_openings:job_id (title, employer_id)
        `)
        .order('submitted_at', { ascending: false });

      if (error) console.error(error);
      else {
        setRows((data ?? []).map((item) => {
          const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          const job = Array.isArray(item.job_openings) ? item.job_openings[0] : item.job_openings;
          return {
            id: item.id,
            candidate: profile?.full_name ?? 'Unknown candidate',
            jobTitle: job?.title ?? 'Unknown role',
            submitted: new Date(item.submitted_at).toLocaleDateString('en-NG'),
            status: item.status,
          };
        }));
      }

      setLoading(false);
    }

    void load();
  }, [user?.id]);

  const columns: Column<Row>[] = [
    { key: 'candidate', header: 'Candidate' },
    { key: 'jobTitle', header: 'Applied for' },
    { key: 'submitted', header: 'Received' },
    { key: 'status', header: 'Stage', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <section>
      <PageHeader eyebrow="Candidates" title="Candidates for your roles" description="Applicants sourced and screened by EnigteeWorld for your open positions." />
      <div className="content-card">
        {loading ? <p className="muted">Loading candidates...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No candidates yet" emptyDescription="Candidates appear once your job request receives applications." />
        )}
      </div>
    </section>
  );
}
