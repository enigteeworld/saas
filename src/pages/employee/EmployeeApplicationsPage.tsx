import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';

type ApplicationRow = {
  id: string;
  applicationNumber: string;
  jobTitle: string;
  employer: string;
  submitted: string;
  status: string;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function EmployeeApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadApplications = async () => {
      setLoading(true);
      setError('');

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          if (mounted) {
            setApplications([]);
            setError('You must be signed in to view your applications.');
          }

          return;
        }

        const { data: applicationData, error: applicationError } =
          await supabase
            .from('job_applications')
            .select(
              `
                id,
                application_number,
                job_id,
                status,
                submitted_at
              `,
            )
            .eq('applicant_id', user.id)
            .order('submitted_at', { ascending: false });

        if (applicationError) {
          throw applicationError;
        }

        if (!applicationData || applicationData.length === 0) {
          if (mounted) {
            setApplications([]);
          }

          return;
        }

        const jobIds = [
          ...new Set(
            applicationData
              .map((application) => application.job_id)
              .filter(Boolean),
          ),
        ];

        const { data: jobs, error: jobsError } = await supabase
          .from('job_openings')
          .select(
            `
              id,
              title,
              employer_id
            `,
          )
          .in('id', jobIds);

        if (jobsError) {
          throw jobsError;
        }

        const jobMap = new Map(
          (jobs ?? []).map((job) => [
            job.id,
            {
              title: job.title,
              employerId: job.employer_id,
            },
          ]),
        );

        /*
         * employer_profiles is intentionally queried separately rather than
         * relying on an implicit Supabase relationship.
         */
        const employerIds = [
          ...new Set(
            (jobs ?? [])
              .map((job) => job.employer_id)
              .filter(Boolean),
          ),
        ];

        let employerMap = new Map<string, string>();

        if (employerIds.length > 0) {
          const { data: employers, error: employersError } = await supabase
            .from('employer_profiles')
            .select('id, business_name')
            .in('id', employerIds);

          if (employersError) {
            /*
             * Do not fail the whole applications page if the current
             * employee RLS policy does not expose employer_profiles.
             */
            console.warn(
              'Unable to load employer names:',
              employersError.message,
            );
          } else {
            employerMap = new Map(
              (employers ?? []).map((employer) => [
                employer.id,
                employer.business_name,
              ]),
            );
          }
        }

        const rows: ApplicationRow[] = applicationData.map((application) => {
          const job = jobMap.get(application.job_id);

          return {
            id: application.id,
            applicationNumber:
              application.application_number || application.id,
            jobTitle: job?.title || 'Job no longer available',
            employer:
              (job?.employerId
                ? employerMap.get(job.employerId)
                : undefined) || 'EnigteeWorld',
            submitted: formatDate(application.submitted_at),
            status: application.status,
          };
        });

        if (mounted) {
          setApplications(rows);
        }
      } catch (err) {
        console.error('Error loading employee applications:', err);

        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load your applications.',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadApplications();

    return () => {
      mounted = false;
    };
  }, []);

  const inProgressCount = useMemo(() => {
    return applications.filter((application) =>
      [
        'submitted',
        'under_review',
        'shortlisted',
        'interview_invited',
        'interview_scheduled',
        'interview_completed',
        'selected',
        'onboarding',
      ].includes(application.status),
    ).length;
  }, [applications]);

  const successfulCount = useMemo(() => {
    return applications.filter((application) =>
      ['successful', 'selected'].includes(application.status),
    ).length;
  }, [applications]);

  const employedCount = useMemo(() => {
    return applications.filter(
      (application) => application.status === 'employed',
    ).length;
  }, [applications]);

  const columns: Column<ApplicationRow>[] = [
    {
      key: 'applicationNumber',
      header: 'Reference',
    },
    {
      key: 'jobTitle',
      header: 'Role',
    },
    {
      key: 'employer',
      header: 'Employer',
    },
    {
      key: 'submitted',
      header: 'Submitted',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link
          className="table-link"
          to={`/employee/applications/${row.id}`}
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="My applications"
        title="Applications"
        description="Track every application you have submitted and see exactly where it stands."
      />

      <div className="stat-grid">
        <StatCard
          label="Total applications"
          value={applications.length}
          hint="All time"
        />

        <StatCard
          label="In progress"
          value={inProgressCount}
          hint="Awaiting outcome"
        />

        <StatCard
          label="Successful"
          value={successfulCount}
          hint="Selected applications"
        />

        <StatCard
          label="Employed"
          value={employedCount}
          hint="Currently employed"
        />
      </div>

      {loading ? (
        <div className="content-card">
          <p className="muted">Loading your applications...</p>
        </div>
      ) : error ? (
        <div className="content-card">
          <h2>Unable to load applications</h2>
          <p className="muted">{error}</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="content-card">
          <EmptyState
            title="No applications yet"
            description="Apply to an open role and your application will appear here."
            action={
              <Link className="btn btn-primary" to="/jobs">
                Browse jobs
              </Link>
            }
          />
        </div>
      ) : (
        <div className="content-card">
          <DataTable
            columns={columns}
            rows={applications}
            emptyTitle="No applications yet"
            emptyDescription="Apply to an open role and it will appear here."
          />
        </div>
      )}
    </section>
  );
}