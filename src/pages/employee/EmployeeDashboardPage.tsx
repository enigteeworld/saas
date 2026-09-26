import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  QrCode,
  XCircle,
} from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import EmployeeNoticeBoard from './EmployeeNoticeBoard';
import StatusBadge from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

type DatabaseRow = Record<string, unknown>;

type EmployeeDashboardData = {
  profile: DatabaseRow | null;
  staffProfile: DatabaseRow | null;
  applications: DatabaseRow[];
  interviews: DatabaseRow[];
};

type DashboardApplication = {
  id: string;
  jobTitle: string;
  employer: string;
  submitted: string;
  status: string;
};

// These are the fields the employee onboarding form actually asks the
// employee to complete. Account name is already handled by registration,
// while date of birth / highest qualification remain optional in the form.
const ONBOARDING_FIELDS: { label: string; aliases: string[] }[] = [
  { label: 'Phone number', aliases: ['phone'] },
  { label: 'Address', aliases: ['address'] },
  { label: 'LGA', aliases: ['lga'] },
  { label: 'Country', aliases: ['country'] },
  { label: 'Field of study', aliases: ['field_of_study'] },
  { label: 'Years of experience', aliases: ['years_experience'] },
  { label: 'Preferred work location', aliases: ['preferred_location'] },
  { label: 'Experience & skills summary', aliases: ['professional_summary', 'skills'] },
];

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function getString(
  source: DatabaseRow | null | undefined,
  keys: string[],
  fallback = '',
): string {
  if (!source) {
    return fallback;
  }

  for (const key of keys) {
    if (hasValue(source[key])) {
      return String(source[key]);
    }
  }

  return fallback;
}

function firstValue(
  sources: Array<DatabaseRow | null>,
  aliases: string[],
): unknown {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const alias of aliases) {
      if (hasValue(source[alias])) {
        return source[alias];
      }
    }
  }

  return undefined;
}

function getOnboardingChecklist(
  profile: DatabaseRow | null,
  staffProfile: DatabaseRow | null,
): { label: string; done: boolean }[] {
  const sources = [profile, staffProfile];
  return ONBOARDING_FIELDS.map(({ label, aliases }) => ({
    label,
    done: firstValue(sources, aliases) !== undefined,
  }));
}

function calculateOnboardingCompletion(
  profile: DatabaseRow | null,
  staffProfile: DatabaseRow | null,
): number {
  if (!profile && !staffProfile) {
    return 0;
  }

  const checklist = getOnboardingChecklist(profile, staffProfile);
  const completedFields = checklist.filter((item) => item.done).length;

  return Math.round(
    (completedFields / ONBOARDING_FIELDS.length) * 100,
  );
}

function formatDate(value: unknown): string {
  if (!value) {
    return '—';
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getRelatedObject(
  row: DatabaseRow,
  keys: string[],
): DatabaseRow | null {
  for (const key of keys) {
    const value = row[key];

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value as DatabaseRow;
    }
  }

  return null;
}

function normalizeApplication(
  application: DatabaseRow,
): DashboardApplication {
  const job = getRelatedObject(application, [
    'job',
    'job_opening',
    'job_openings',
  ]);

  const employer = getRelatedObject(application, [
    'employer',
    'employer_profile',
    'employer_profiles',
    'establishment',
  ]);

  return {
    id: String(application.id),

    jobTitle: getString(
      application,
      [
        'job_title',
        'position_title',
        'role_title',
        'position',
        'title',
      ],
      getString(
        job,
        ['title', 'position_title', 'role_title'],
        'Job application',
      ),
    ),

    employer: getString(
      application,
      [
        'employer_name',
        'company_name',
        'establishment_name',
        'business_name',
      ],
      getString(
        employer,
        ['business_name', 'name', 'company_name'],
        'Employer',
      ),
    ),

    submitted: formatDate(
      application.submitted_at ??
        application.created_at,
    ),

    status: getString(
      application,
      ['status', 'application_status'],
      'submitted',
    ),
  };
}

function useEmployeeDashboardData(
  userId?: string,
): {
  data: EmployeeDashboardData;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<EmployeeDashboardData>({
    profile: null,
    staffProfile: null,
    applications: [],
    interviews: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      if (!userId) {
        if (active) {
          setData({
            profile: null,
            staffProfile: null,
            applications: [],
            interviews: [],
          });

          setLoading(false);
        }

        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [
          profileResult,
          staffProfileResult,
          applicationsResult,
          interviewsResult,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle(),

          supabase
            .from('staff_profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle(),

          supabase
            .from('job_applications')
            .select('*')
            .eq('applicant_id', userId)
            .order('submitted_at', {
              ascending: false,
            }),

          supabase
            .from('interviews')
            .select('*')
            .order('scheduled_for', {
              ascending: true,
              nullsFirst: false,
            }),
        ]);

        if (profileResult.error) {
          throw new Error(
            `Profile: ${profileResult.error.message}`,
          );
        }

        if (staffProfileResult.error) {
          throw new Error(
            `Staff profile: ${staffProfileResult.error.message}`,
          );
        }

        if (applicationsResult.error) {
          throw new Error(
            `Applications: ${applicationsResult.error.message}`,
          );
        }

        if (interviewsResult.error) {
          throw new Error(
            `Interviews: ${interviewsResult.error.message}`,
          );
        }

        if (!active) {
          return;
        }

        const applications =
          (applicationsResult.data ?? []) as DatabaseRow[];

        const interviews =
          (interviewsResult.data ?? []) as DatabaseRow[];

        setData({
          profile: profileResult.data as DatabaseRow | null,
          staffProfile:
            staffProfileResult.data as DatabaseRow | null,
          applications,
          interviews,
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load your dashboard data.',
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, [userId]);

  return {
    data,
    loading,
    error,
  };
}

export default function EmployeeDashboardPage() {
  const user = useAuthStore((state) => state.user);

  const { data, loading, error } = useEmployeeDashboardData(
    user?.id,
  );

  const [deploymentStatus, setDeploymentStatus] = useState<string | null>(null);

  useEffect(() => {
    async function loadDeployment() {
      if (!user?.id) return;
      const { data: deployment } = await supabase
        .from('deployments')
        .select('status')
        .eq('employee_id', user.id)
        .in('status', ['selected', 'onboarding', 'pending_start', 'active', 'on_leave', 'suspended'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setDeploymentStatus(deployment?.status ?? null);
    }
    void loadDeployment();
  }, [user?.id]);

  const firstName = (user?.full_name ?? 'there').split(' ')[0];

  const completion = useMemo(() => {
    return calculateOnboardingCompletion(
      data.profile,
      data.staffProfile,
    );
  }, [data.profile, data.staffProfile]);

  const onboardingChecklist = useMemo(() => {
    return getOnboardingChecklist(data.profile, data.staffProfile);
  }, [data.profile, data.staffProfile]);

  const profileDone = completion >= 100;

  const employment = getString(
    data.staffProfile,
    ['employment_status', 'status'],
    getString(
      data.profile,
      ['employment_status'],
      'Pending',
    ),
  );

  const attendance = getString(
    data.staffProfile,
    ['attendance_rate'],
    getString(
      data.profile,
      ['attendance_rate'],
      '—',
    ),
  );

  const recentApplications = useMemo(() => {
    return data.applications
      .slice(0, 4)
      .map(normalizeApplication);
  }, [data.applications]);

  return (
    <section>
      <PageHeader
        eyebrow="Employee workspace"
        title={`Welcome back, ${firstName}.`}
        description="Your applications, interviews and employment status in one place."
        actions={
          <Link
            className="btn btn-primary"
            to="/employee/onboarding"
          >
            {profileDone
              ? 'Review onboarding'
              : 'Complete onboarding'}
            <ArrowRight size={16} />
          </Link>
        }
      />

      {error && (
        <div className="content-card error-banner" role="alert">
          <h2>Unable to load dashboard data</h2>
          <p className="muted small">{error}</p>
        </div>
      )}

      <EmployeeNoticeBoard />

      <div className="stat-grid">
        <StatCard
          label="Applications"
          value={loading ? '—' : data.applications.length}
          hint="Submitted so far"
          icon={FileText}
        />

        <StatCard
          label="Interviews"
          value={loading ? '—' : data.interviews.length}
          hint="Invitations received"
          icon={CalendarDays}
        />

        <StatCard
          label="Employment"
          value={loading ? '—' : deploymentStatus ? deploymentStatus.replace(/_/g, ' ') : employment}
          hint="Current employment status"
          icon={BriefcaseBusiness}
        />

        <StatCard
          label="Attendance"
          value={loading ? '—' : attendance}
          hint="Starts after deployment"
          icon={QrCode}
        />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Activity</span>
              <h2>Recent applications</h2>
            </div>

            <Link
              className="text-link"
              to="/employee/applications"
            >
              View all
            </Link>
          </div>

          {loading ? (
            <p className="muted small loading-note">
              Loading applications…
            </p>
          ) : recentApplications.length === 0 ? (
            <div className="empty-state">
              <h3>No applications yet</h3>
              <p className="muted small">
                Your submitted job applications will appear here.
              </p>

              <Link
                className="btn btn-secondary"
                to="/jobs"
              >
                Browse available jobs
              </Link>
            </div>
          ) : (
            <div className="application-list">
              {recentApplications.map((application) => (
                <div
                  className="application-row"
                  key={application.id}
                >
                  <div className="application-main">
                    <h3>{application.jobTitle}</h3>
                    <p>
                      {application.employer} · Submitted{' '}
                      {application.submitted}
                    </p>
                  </div>

                  <div className="application-status">
                    <StatusBadge status={application.status} />

                    <Link
                      className="text-link"
                      to={`/employee/applications/${application.id}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="content-card status-card">
          <span className="eyebrow">
            Onboarding progress
          </span>

          <h2>
            {loading
              ? 'Loading your profile'
              : profileDone
                ? 'Profile complete'
                : 'Finish your profile'}
          </h2>

          <p>
            {profileDone
              ? 'Your onboarding details are complete. HR administration can move your applications forward.'
              : 'Complete your onboarding details and upload your CV so HR administration can move your applications forward.'}
          </p>

          <div
            className="progress-line"
            aria-label={`Onboarding ${completion}% complete`}
          >
            <span
              style={{
                width: `${completion}%`,
              }}
            />
          </div>

          <p className="muted small">
            {loading
              ? 'Loading profile…'
              : `Profile ${completion}% complete`}
          </p>

          {!loading && !profileDone ? (
            <ul className="onboarding-checklist">
              {onboardingChecklist.map((item) => (
                <li key={item.label} className={item.done ? 'done' : ''}>
                  {item.done ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}

          <Link
            className="btn btn-primary"
            to="/employee/onboarding"
          >
            {profileDone
              ? 'Review profile'
              : 'Continue onboarding'}
          </Link>
        </div>
      </div>
    </section>
  );
}