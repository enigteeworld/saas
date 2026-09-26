import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';

interface EmployerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  establishments: number;
  employees: number;
  status: string;
}

interface EmployerProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  verification_status: string;
}

interface Establishment {
  id: string;
  employer_id: string;
}

interface Deployment {
  id: string;
  employer_id: string;
  employee_id: string;
}

export default function AdminEmployersPage() {
  const navigate = useNavigate();

  const [employers, setEmployers] = useState<EmployerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingEmployerId, setUpdatingEmployerId] =
    useState<string | null>(null);

  useEffect(() => {
    loadEmployers();
  }, []);

  async function loadEmployers() {
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
          'You must be logged in to view employers.'
        );
      }

      const { data: employerData, error: employerError } =
        await supabase
          .from('employer_profiles')
          .select(
            `
              id,
              user_id,
              business_name,
              business_email,
              business_phone,
              verification_status
            `
          )
          .order('business_name', {
            ascending: true,
          });

      if (employerError) {
        throw employerError;
      }

      const employerProfiles =
        (employerData as EmployerProfile[]) ?? [];

      if (employerProfiles.length === 0) {
        setEmployers([]);
        return;
      }

      const employerIds = employerProfiles.map(
        (employer) => employer.id
      );

      const [
        establishmentsResult,
        deploymentsResult,
      ] = await Promise.all([
        supabase
          .from('establishments')
          .select('id, employer_id')
          .in('employer_id', employerIds),

        supabase
          .from('deployments')
          .select(
            'id, employer_id, employee_id'
          )
          .in('employer_id', employerIds)
          .in('status', [
            'selected',
            'onboarding',
            'pending_start',
            'active',
            'on_leave',
          ]),
      ]);

      if (establishmentsResult.error) {
        throw establishmentsResult.error;
      }

      if (deploymentsResult.error) {
        throw deploymentsResult.error;
      }

      const establishments =
        (establishmentsResult.data as Establishment[]) ?? [];

      const deployments =
        (deploymentsResult.data as Deployment[]) ?? [];

      const rows: EmployerRow[] =
        employerProfiles.map((employer) => {
          const employerEstablishments =
            establishments.filter(
              (establishment) =>
                establishment.employer_id === employer.id
            );

          const employerDeployments =
            deployments.filter(
              (deployment) =>
                deployment.employer_id === employer.id
            );

          const uniqueEmployees = new Set(
            employerDeployments.map(
              (deployment) =>
                deployment.employee_id
            )
          );

          return {
            id: employer.id,
            name: employer.business_name,
            email:
              employer.business_email ||
              'No email provided',
            phone:
              employer.business_phone ||
              'No phone provided',
            establishments:
              employerEstablishments.length,
            employees: uniqueEmployees.size,
            status:
              employer.verification_status ||
              'pending',
          };
        });

      setEmployers(rows);
    } catch (err) {
      console.error(
        'Error loading employers:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load employers from Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateVerificationStatus(
    employerId: string,
    status: 'verified' | 'rejected'
  ) {
    const employer = employers.find(
      (item) => item.id === employerId
    );

    if (!employer) {
      return;
    }

    const action =
      status === 'verified'
        ? 'verify'
        : 'reject';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${employer.name}?`
    );

    if (!confirmed) {
      return;
    }

    setUpdatingEmployerId(employerId);
    setError('');

    try {
      const { error: updateError } =
        await supabase
          .from('employer_profiles')
          .update({
            verification_status: status,
          })
          .eq('id', employerId);

      if (updateError) {
        throw updateError;
      }

      setEmployers((currentEmployers) =>
        currentEmployers.map((item) =>
          item.id === employerId
            ? {
                ...item,
                status,
              }
            : item
        )
      );
    } catch (err) {
      console.error(
        `Error ${action}ing employer:`,
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : `Unable to ${action} employer.`
      );
    } finally {
      setUpdatingEmployerId(null);
    }
  }

  const verifiedEmployers =
    employers.filter(
      (employer) =>
        employer.status === 'verified'
    ).length;

  const totalEmployees = employers.reduce(
    (total, employer) =>
      total + employer.employees,
    0
  );

  const columns: Column<EmployerRow>[] = [
    {
      key: 'name',
      header: 'Employer',
    },
    {
      key: 'email',
      header: 'Email',
    },
    {
      key: 'phone',
      header: 'Phone',
    },
    {
      key: 'establishments',
      header: 'Establishments',
      align: 'right',
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const isUpdating =
          updatingEmployerId === row.id;

        return (
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="btn"
              type="button"
              onClick={() =>
                navigate(
                  `/admin/employers/${row.id}`
                )
              }
            >
              View
            </button>

            {row.status === 'pending' ? (
              <>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    updateVerificationStatus(
                      row.id,
                      'verified'
                    )
                  }
                >
                  {isUpdating
                    ? 'Updating...'
                    : 'Verify'}
                </button>

                <button
                  className="btn"
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    updateVerificationStatus(
                      row.id,
                      'rejected'
                    )
                  }
                >
                  Reject
                </button>
              </>
            ) : null}

            {row.status === 'verified' ? (
              <button
                className="btn"
                type="button"
                disabled={isUpdating}
                onClick={() =>
                  updateVerificationStatus(
                    row.id,
                    'rejected'
                  )
                }
              >
                {isUpdating
                  ? 'Updating...'
                  : 'Reject'}
              </button>
            ) : null}

            {row.status === 'rejected' ? (
              <button
                className="btn btn-primary"
                type="button"
                disabled={isUpdating}
                onClick={() =>
                  updateVerificationStatus(
                    row.id,
                    'verified'
                  )
                }
              >
                {isUpdating
                  ? 'Updating...'
                  : 'Verify'}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Clients"
        title="Employers"
        description="Businesses hiring through EnigteeWorld and the workforce assigned to them."
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() =>
              navigate(
                '/admin/employers/create'
              )
            }
          >
            Add employer
          </button>
        }
      />

      {error ? (
        <div className="error-message">
          {error}
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard
          label="Employers"
          value={
            loading ? '—' : employers.length
          }
          hint="Registered"
        />

        <StatCard
          label="Verified"
          value={
            loading
              ? '—'
              : verifiedEmployers
          }
          hint="Verified employers"
        />

        <StatCard
          label="Employees placed"
          value={
            loading ? '—' : totalEmployees
          }
          hint="Across all clients"
        />
      </div>

      <div className="content-card">
        {loading ? (
          <div className="empty-state">
            <p>Loading employers...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={employers}
            emptyTitle="No employers registered"
            emptyDescription="Add an employer to start managing their workforce."
          />
        )}
      </div>
    </section>
  );
}
