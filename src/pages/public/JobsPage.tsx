
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  MapPin,
  Search,
} from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';

interface JobOpening {
  id: string;
  title: string;
  location: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  created_at: string;
  published_at: string | null;
  employer_id: string | null;
  status: string;
}

interface EmployerProfile {
  id: string;
  business_name: string;
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  posted: string;
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

function formatSalary(
  minimum: number | null,
  maximum: number | null,
  currency: string | null
): string {
  const symbol =
    currency === 'NGN' || !currency
      ? '₦'
      : currency;

  const formatter = new Intl.NumberFormat(
    'en-NG'
  );

  if (
    minimum !== null &&
    maximum !== null
  ) {
    return `${symbol}${formatter.format(
      minimum
    )} - ${symbol}${formatter.format(
      maximum
    )}`;
  }

  if (minimum !== null) {
    return `From ${symbol}${formatter.format(
      minimum
    )}`;
  }

  if (maximum !== null) {
    return `Up to ${symbol}${formatter.format(
      maximum
    )}`;
  }

  return 'Salary not specified';
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [query, setQuery] = useState('');
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
        data: jobData,
        error: jobsError,
      } = await supabase
        .from('job_openings')
        .select(
          `
            id,
            title,
            location,
            employment_type,
            salary_min,
            salary_max,
            salary_currency,
            created_at,
            published_at,
            employer_id,
            status
          `
        )
        .eq('status', 'published')
        .order('published_at', {
          ascending: false,
          nullsFirst: false,
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
              ) || 'EnigteeWorld employer'
            : 'EnigteeWorld',
          location: job.location,
          type: formatEmploymentType(
            job.employment_type
          ),
          salary: formatSalary(
            job.salary_min,
            job.salary_max,
            job.salary_currency
          ),
          posted: formatDate(
            job.published_at ||
              job.created_at
          ),
        }));

      setJobs(rows);
    } catch (err) {
      console.error(
        'Error loading public jobs:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load job openings.'
      );
    } finally {
      setLoading(false);
    }
  }

  const results = useMemo(() => {
    const term = query
      .trim()
      .toLowerCase();

    if (!term) {
      return jobs;
    }

    return jobs.filter((job) =>
      [
        job.title,
        job.company,
        job.location,
        job.type,
        job.salary,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [jobs, query]);

  return (
    <main className="page">
      <div className="container">
        <div className="page-hero">
          <span className="eyebrow">
            Career opportunities
          </span>

          <h1>
            Find your next opportunity.
          </h1>

          <p>
            Explore current openings published
            by EnigteeWorld and apply in a few
            minutes.
          </p>
        </div>

        <div className="search-bar">
          <Search size={18} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search by role, company or location"
            aria-label="Search jobs"
          />
        </div>

        {error ? (
          <div className="error-message">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state">
            <p>Loading available openings...</p>
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title={
              query
                ? 'No roles match your search'
                : 'No openings published yet'
            }
            description={
              query
                ? 'Try a different keyword or clear the search.'
                : 'Check back soon for new career opportunities.'
            }
          />
        ) : (
          <div className="job-list">
            {results.map((job) => (
              <div
                className="job-card"
                key={job.id}
              >
                <div className="job-icon">
                  <BriefcaseBusiness />
                </div>

                <div className="job-main">
                  <div className="job-title-row">
                    <h3>{job.title}</h3>

                    <span className="tag">
                      {job.type}
                    </span>
                  </div>

                  <p className="company">
                    {job.company}
                  </p>

                  <div className="job-meta">
                    <span>
                      <MapPin size={14} />
                      {job.location}
                    </span>

                    <span>
                      {job.salary}
                    </span>
                  </div>

                  <div className="job-card-bottom">
                    <span className="muted">
                      Posted {job.posted}
                    </span>

                    <Link
                      className="btn btn-ghost"
                      to={`/jobs/${job.id}`}
                    >
                      View role
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
