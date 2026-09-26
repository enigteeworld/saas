import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type JobStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'closed'
  | 'archived';

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  posted: string;
  status: JobStatus;
  positions: number;
  fromEmployer: boolean;
}

interface JobOpening {
  id: string;
  job_number: string | null;
  title: string;
  location: string;
  employment_type: string;
  status: JobStatus;
  created_at: string;
  published_at: string | null;
  employer_id: string | null;
  positions_available: number;
  creator: { role: string } | { role: string }[] | null;
}

interface EmployerProfile {
  id: string;
  business_name: string;
}

function formatEmploymentType(
  employmentType: string
): string {
  return employmentType
    .split('-')
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function formatDate(
  date: string
): string {
  return new Intl.DateTimeFormat(
    'en-NG',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }
  ).format(new Date(date));
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
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
        throw new Error(
          'You must be logged in to view job openings.'
        );
      }

      const {
        data: jobData,
        error: jobsError,
      } = await supabase
        .from('job_openings')
        .select(
          `
            id,
            job_number,
            title,
            location,
            employment_type,
            status,
            created_at,
            published_at,
            employer_id,
            positions_available,
            creator:created_by (role)
          `
        )
        .order('created_at', {
          ascending: false,
        });

      if (jobsError) {
        throw jobsError;
      }

      const jobOpenings =
        (jobData as JobOpening[]) ?? [];

      if (jobOpenings.length === 0) {
        setJobs([]);
        return;
      }

      const employerIds = Array.from(
        new Set(
          jobOpenings
            .map((job) => job.employer_id)
            .filter(
              (
                employerId
              ): employerId is string =>
                Boolean(employerId)
            )
        )
      );

      let employers: EmployerProfile[] = [];

      if (employerIds.length > 0) {
        const {
          data: employerData,
          error: employersError,
        } = await supabase
          .from('employer_profiles')
          .select(
            'id, business_name'
          )
          .in('id', employerIds);

        if (employersError) {
          throw employersError;
        }

        employers =
          (employerData as EmployerProfile[]) ?? [];
      }

      const employerMap = new Map(
        employers.map((employer) => [
          employer.id,
          employer.business_name,
        ])
      );

      const rows: JobRow[] =
        jobOpenings.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.employer_id
            ? employerMap.get(
                job.employer_id
              ) || 'Unassigned employer'
            : 'Unassigned employer',
          location: job.location,
          type: formatEmploymentType(
            job.employment_type
          ),
          posted: formatDate(
            job.published_at ||
              job.created_at
          ),
          status: job.status,
          positions: job.positions_available ?? 1,
          fromEmployer:
            (Array.isArray(job.creator)
              ? job.creator[0]?.role
              : job.creator?.role) === 'employer',
        }));

      setJobs(rows);
    } catch (err) {
      console.error(
        'Error loading job openings:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load job openings from Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(
    id: string,
    status: 'published' | 'closed' | 'paused'
  ) {
    setError('');
    const { error: updateError } = await supabase
      .from('job_openings')
      .update({
        status,
        published_at:
          status === 'published'
            ? new Date().toISOString()
            : undefined,
      })
      .eq('id', id);

    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }

    flushEmailOutbox();
    await loadJobs();
  }

  const pendingRequests = jobs.filter(
    (job) => job.fromEmployer && job.status === 'draft'
  );

  const fullTimeJobs = jobs.filter(
    (job) =>
      job.type.toLowerCase() ===
      'full time'
  ).length;

  const employerCount = new Set(
    jobs
      .filter(
        (job) =>
          job.company !==
          'Unassigned employer'
      )
      .map((job) => job.company)
  ).size;

  const columns: Column<JobRow>[] = [
    {
      key: 'title',
      header: 'Role',
    },
    {
      key: 'company',
      header: 'Employer',
    },
    {
      key: 'location',
      header: 'Location',
    },
    {
      key: 'type',
      header: 'Type',
    },
    {
      key: 'posted',
      header: 'Posted',
    },
    {
      key: 'positions',
      header: 'Positions',
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <>
          <StatusBadge
            status={row.status}
          />
          {row.fromEmployer ? (
            <span
              className="tag"
              style={{ marginLeft: 6 }}
            >
              Employer request
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div
          className="inline-actions"
          style={{ justifyContent: 'flex-end' }}
        >
          {row.status === 'draft' ? (
            <>
              <Link
                className="btn btn-secondary btn-sm"
                to={`/admin/jobs/${row.id}/edit`}
              >
                Review & edit
              </Link>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() =>
                  void changeStatus(row.id, 'published')
                }
              >
                Quick publish
              </button>
            </>
          ) : null}
          {row.status === 'published' ? (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() =>
                void changeStatus(row.id, 'closed')
              }
            >
              Close
            </button>
          ) : null}
          {row.status === 'published' ? (
            <Link
              className="table-link"
              to={`/jobs/${row.id}`}
            >
              Preview
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Recruitment"
        title="Job openings"
        description="All published and draft openings across every employer."
        actions={
          <Link
            className="btn btn-primary"
            to="/admin/jobs/new"
          >
            Create job
          </Link>
        }
      />

      {error ? (
        <div className="error-message">
          {error}
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard
          label="Openings"
          value={
            loading ? '—' : jobs.length
          }
          hint="Published and drafts"
        />

        <StatCard
          label="Full-time"
          value={
            loading ? '—' : fullTimeJobs
          }
          hint="Full-time roles"
        />

        <StatCard
          label="Employers"
          value={
            loading ? '—' : employerCount
          }
          hint="With job openings"
        />
      </div>

      {pendingRequests.length > 0 ? (
        <div
          className="notice-card warn"
          style={{ marginBottom: 20 }}
        >
          <h3>
            {pendingRequests.length} employer staffing request
            {pendingRequests.length === 1 ? '' : 's'} awaiting review
          </h3>
          <p>
            {pendingRequests
              .map((job) => `${job.positions} × ${job.title} (${job.company})`)
              .join(' · ')}
          </p>
          <p>
            Publish a request to open it for applications - the employer is notified automatically.
          </p>
        </div>
      ) : null}

      <div className="content-card">
        {loading ? (
          <div className="empty-state">
            <p>Loading job openings...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={jobs}
            emptyTitle="No openings found"
            emptyDescription="Create your first job opening to publish it on the careers page."
          />
        )}
      </div>
    </section>
  );
}