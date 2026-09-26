import { useEffect, useState, type FormEvent } from 'react';

import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

interface EstablishmentRow {
  id: string;
  name: string;
  employer: string;
  address: string;
  employees: number;
  status: string;
}

interface Establishment {
  id: string;
  employer_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
}

interface Deployment {
  id: string;
  establishment_id: string;
  employee_id: string;
  status: string;
}

const columns: Column<EstablishmentRow>[] = [
  {
    key: 'id',
    header: 'Reference',
    render: (row) => row.id.slice(0, 8).toUpperCase(),
  },
  {
    key: 'name',
    header: 'Name',
  },
  {
    key: 'employer',
    header: 'Employer',
  },
  {
    key: 'address',
    header: 'Address',
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
];

export default function AdminEstablishmentsPage() {
  const [establishments, setEstablishments] = useState<
    EstablishmentRow[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employers, setEmployers] = useState<
    { id: string; business_name: string }[]
  >([]);
  const [form, setForm] = useState({
    employer_id: '',
    name: '',
    address: '',
    city: '',
    state: '',
    contact_name: '',
    contact_phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    loadEstablishments();
  }, []);

  async function createEstablishment(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved('');

    if (!form.employer_id) return setError('Select the employer this establishment belongs to.');
    if (!form.name.trim() || !form.address.trim()) return setError('Name and address are required.');

    setSaving(true);
    const { error: insertError } = await supabase.from('establishments').insert({
      employer_id: form.employer_id,
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    });
    setSaving(false);

    if (insertError) {
      setError(errorMessage(insertError));
      return;
    }

    setSaved(`${form.name.trim()} was added.`);
    setForm({ ...form, name: '', address: '', city: '', state: '', contact_name: '', contact_phone: '' });
    await loadEstablishments();
  }

  async function loadEstablishments() {
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
          'You must be logged in to view establishments.'
        );
      }

      const {
        data: establishmentData,
        error: establishmentError,
      } = await supabase
        .from('establishments')
        .select(
          `
            id,
            employer_id,
            name,
            address,
            city,
            state,
            is_active
          `
        )
        .order('name', {
          ascending: true,
        });

      if (establishmentError) {
        throw establishmentError;
      }

      const establishmentRows =
        (establishmentData as Establishment[]) ?? [];

      const { data: employerData } = await supabase
        .from('employer_profiles')
        .select('id, business_name')
        .order('business_name');
      const employerList = (employerData ?? []) as { id: string; business_name: string }[];
      setEmployers(employerList);
      const employerNames = new Map(employerList.map((item) => [item.id, item.business_name]));

      if (establishmentRows.length === 0) {
        setEstablishments([]);
        return;
      }

      const establishmentIds =
        establishmentRows.map(
          (establishment) => establishment.id
        );

      const {
        data: deploymentData,
        error: deploymentError,
      } = await supabase
        .from('deployments')
        .select(
          `
            id,
            establishment_id,
            employee_id,
            status
          `
        )
        .in(
          'establishment_id',
          establishmentIds
        )
        .in('status', [
          'selected',
          'onboarding',
          'pending_start',
          'active',
          'on_leave',
        ]);

      if (deploymentError) {
        throw deploymentError;
      }

      const deployments =
        (deploymentData as Deployment[]) ?? [];

      const rows: EstablishmentRow[] =
        establishmentRows.map(
          (establishment) => {
            const establishmentDeployments =
              deployments.filter(
                (deployment) =>
                  deployment.establishment_id ===
                  establishment.id
              );

            const uniqueEmployees = new Set(
              establishmentDeployments.map(
                (deployment) =>
                  deployment.employee_id
              )
            );

            const addressParts = [
              establishment.address,
              establishment.city,
              establishment.state,
            ].filter(Boolean);

            return {
              id: establishment.id,
              name: establishment.name,
              employer: employerNames.get(establishment.employer_id) ?? '—',
              address:
                addressParts.length > 0
                  ? addressParts.join(', ')
                  : 'No address provided',
              employees:
                uniqueEmployees.size,
              status: establishment.is_active
                ? 'active'
                : 'inactive',
            };
          }
        );

      setEstablishments(rows);
    } catch (err) {
      console.error(
        'Error loading establishments:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load establishments from Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }

  const activeEstablishments =
    establishments.filter(
      (establishment) =>
        establishment.status === 'active'
    ).length;

  const inactiveEstablishments =
    establishments.length -
    activeEstablishments;

  const totalEmployees =
    establishments.reduce(
      (total, establishment) =>
        total + establishment.employees,
      0
    );

  return (
    <section>
      <PageHeader
        eyebrow="Employers"
        title="Establishments"
        description="Business locations registered by employers and approved for deployment."
      />

      {error ? (
        <div className="error-message">
          {error}
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard
          label="Establishments"
          value={
            loading
              ? '—'
              : establishments.length
          }
          hint="All locations"
        />

        <StatCard
          label="Active"
          value={
            loading
              ? '—'
              : activeEstablishments
          }
          hint="Active locations"
        />

        <StatCard
          label="Employees"
          value={
            loading
              ? '—'
              : totalEmployees
          }
          hint="Currently assigned"
        />
      </div>

      <div className="content-card" style={{ marginBottom: 20 }}>
        <h2>Add establishment</h2>
        <p className="hint">
          Every employer already gets a default “Main Office”. Add more locations here, or let the employer add their own.
        </p>
        <form className="form" onSubmit={createEstablishment}>
          <div className="row-2">
            <label>
              Employer
              <select value={form.employer_id} onChange={(event) => setForm({ ...form, employer_id: event.target.value })} required>
                <option value="">Select employer</option>
                {employers.map((employer) => (
                  <option value={employer.id} key={employer.id}>
                    {employer.business_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Establishment name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
          </div>
          <label>
            Address
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
          </label>
          <div className="row-2">
            <label>
              City
              <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </label>
            <label>
              State
              <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </label>
          </div>
          <div className="row-2">
            <label>
              Contact person
              <input value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
            </label>
            <label>
              Contact phone
              <input value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} />
            </label>
          </div>
          {saved ? <p className="success-message">{saved}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add establishment'}
          </button>
        </form>
      </div>

      <div className="content-card">
        {loading ? (
          <div className="empty-state">
            <p>
              Loading establishments...
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={establishments}
            emptyTitle="No establishments registered"
            emptyDescription="Employer locations appear here once submitted."
          />
        )}
      </div>
    </section>
  );
}