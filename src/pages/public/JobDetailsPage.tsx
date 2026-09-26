
import { useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';

interface JobOpening {
  id: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  location: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  status: string;
  employer_id: string | null;
}

interface EmployerProfile {
  id: string;
  business_name: string;
}

interface Profile {
  id: string;
  role: string;
}

function formatEmploymentType(employmentType: string): string {
  return employmentType
    .split('-')
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

function formatSalary(
  minimum: number | null,
  maximum: number | null,
  currency: string | null,
): string {
  const symbol =
    currency === 'NGN' || !currency ? '₦' : currency;

  const formatter = new Intl.NumberFormat('en-NG');

  if (minimum !== null && maximum !== null) {
    return `${symbol}${formatter.format(
      minimum,
    )} - ${symbol}${formatter.format(maximum)}`;
  }

  if (minimum !== null) {
    return `From ${symbol}${formatter.format(minimum)}`;
  }

  if (maximum !== null) {
    return `Up to ${symbol}${formatter.format(maximum)}`;
  }

  return 'Salary not specified';
}

function splitLines(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function JobDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobOpening | null>(null);
  const [company, setCompany] = useState('EnigteeWorld');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [hasApplied, setHasApplied] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');

  useEffect(() => {
    void loadAuthentication();
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    void loadJob(id);
  }, [id]);

  useEffect(() => {
    if (
      !id ||
      !userId ||
      userRole !== 'employee'
    ) {
      return;
    }

    void checkExistingApplication(id, userId);
  }, [id, userId, userRole]);

  async function loadAuthentication() {
    setCheckingAuth(true);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const session = sessionData.session;

      if (!session?.user) {
        setUserId(null);
        setUserRole(null);
        return;
      }

      setUserId(session.user.id);

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (profileData) {
        const profile = profileData as Profile;
        setUserRole(profile.role);
      } else {
        setUserRole(null);
      }
    } catch (err) {
      console.error(
        'Error checking authentication:',
        err,
      );

      setUserId(null);
      setUserRole(null);
    } finally {
      setCheckingAuth(false);
    }
  }

  async function loadJob(jobId: string) {
    setLoading(true);
    setError('');

    try {
      const {
        data: jobData,
        error: jobError,
      } = await supabase
        .from('job_openings')
        .select(
          `
            id,
            title,
            description,
            responsibilities,
            requirements,
            location,
            employment_type,
            salary_min,
            salary_max,
            salary_currency,
            status,
            employer_id
          `,
        )
        .eq('id', jobId)
        .eq('status', 'published')
        .maybeSingle();

      if (jobError) {
        throw jobError;
      }

      if (!jobData) {
        setJob(null);
        return;
      }

      const selectedJob = jobData as JobOpening;

      setJob(selectedJob);

      if (selectedJob.employer_id) {
        const {
          data: employerData,
          error: employerError,
        } = await supabase
          .from('employer_profiles')
          .select('id, business_name')
          .eq('id', selectedJob.employer_id)
          .maybeSingle();

        if (employerError) {
          console.warn(
            'Unable to load employer profile:',
            employerError.message,
          );
        }

        if (employerData) {
          const employer =
            employerData as EmployerProfile;

          setCompany(employer.business_name);
        }
      }
    } catch (err) {
      console.error(
        'Error loading job details:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load this job opening.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkExistingApplication(
    jobId: string,
    applicantId: string,
  ) {
    try {
      const {
        data,
        error: applicationError,
      } = await supabase
        .from('job_applications')
        .select('id, status')
        .eq('job_id', jobId)
        .eq('applicant_id', applicantId)
        .maybeSingle();

      if (applicationError) {
        throw applicationError;
      }

      setHasApplied(Boolean(data && data.status !== 'draft'));
    } catch (err) {
      console.error(
        'Error checking existing application:',
        err,
      );
    }
  }

  function handleApply() {
    if (!job || !userId) {
      return;
    }

    if (userRole !== 'employee') {
      setApplicationMessage(
        'Only employee accounts can apply for job openings.',
      );

      return;
    }

    navigate(`/employee/applications/job/${job.id}`);
  }

  if (loading || checkingAuth) {
    return (
      <main className="page">
        <div className="container">
          <div className="empty-state">
            <p>Loading job opening...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="container">
          <div className="error-message">
            {error}
          </div>

          <Link
            className="btn btn-primary"
            to="/jobs"
          >
            Back to all openings
          </Link>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="page">
        <div className="container">
          <EmptyState
            title="This opening is no longer available"
            description="The role may have been filled or removed."
            action={
              <Link
                className="btn btn-primary"
                to="/jobs"
              >
                Back to all openings
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const responsibilities = splitLines(
    job.responsibilities,
  );

  const requirements = splitLines(
    job.requirements,
  );

  const isEmployee = userRole === 'employee';
  const isLoggedIn = Boolean(userId);

  return (
    <main className="page">
      <div className="container">
        <Link
          to="/jobs"
          className="back-link"
        >
          <ArrowLeft size={15} />
          All openings
        </Link>

        <div className="detail-layout">
          <article className="detail-card">
            <div className="job-icon large">
              <BriefcaseBusiness />
            </div>

            <span className="eyebrow">
              Open position
            </span>

            <h1>{job.title}</h1>

            <p className="company">
              {company}
            </p>

            <div className="job-meta detail-meta">
              <span>
                <MapPin size={14} />
                {job.location}
              </span>

              <span>
                {formatSalary(
                  job.salary_min,
                  job.salary_max,
                  job.salary_currency,
                )}
              </span>

              <span>
                {formatEmploymentType(
                  job.employment_type,
                )}
              </span>
            </div>

            <hr />

            <h2>About the role</h2>

            <p>{job.description}</p>

            {responsibilities.length > 0 ? (
              <>
                <h2>Responsibilities</h2>

                <ul className="check-list">
                  {responsibilities.map(
                    (item, index) => (
                      <li
                        key={`${item}-${index}`}
                      >
                        <CheckCircle2 size={17} />
                        {item}
                      </li>
                    ),
                  )}
                </ul>
              </>
            ) : null}

            {requirements.length > 0 ? (
              <>
                <h2>Requirements</h2>

                <ul className="check-list">
                  {requirements.map(
                    (item, index) => (
                      <li
                        key={`${item}-${index}`}
                      >
                        <CheckCircle2 size={17} />
                        {item}
                      </li>
                    ),
                  )}
                </ul>
              </>
            ) : null}
          </article>

          <aside className="side-card">
            <h3>Apply for this role</h3>

            {!isLoggedIn ? (
              <>
                <p>
                  Create a free EnigteeWorld
                  account to submit your
                  application and track every
                  stage.
                </p>

                <Link
                  className="btn btn-primary"
                  to={`/register?job=${job.id}`}
                >
                  Create account to apply
                </Link>

                <p className="small muted">
                  Already registered?{' '}
                  <Link to="/login">
                    Sign in
                  </Link>
                </p>
              </>
            ) : !isEmployee ? (
              <>
                <p>
                  You are signed in, but this
                  account is not an employee
                  account.
                </p>

                <p className="small muted">
                  Only employee accounts can
                  apply for job openings.
                </p>
              </>
            ) : hasApplied ? (
              <>
                <p>
                  You have already applied for
                  this role.
                </p>

                <div className="success-message">
                  Your application has already
                  been submitted.
                </div>

                <Link
                  className="btn btn-primary"
                  to="/employee/applications"
                >
                  View my applications
                </Link>
              </>
            ) : (
              <>
                <p>
                  Review your employee profile,
                  attach role-specific documents,
                  and submit your application.
                </p>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleApply}
                >
                  Continue to application
                </button>

                {applicationMessage ? (
                  <div className="error-message">
                    {applicationMessage}
                  </div>
                ) : null}
              </>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}