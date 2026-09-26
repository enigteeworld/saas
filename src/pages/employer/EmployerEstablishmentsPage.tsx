import { useEffect, useState, type FormEvent } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { ensureDefaultEstablishment } from '@/lib/establishments';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  name: string;
  address: string;
  employees: number;
  status: string;
  isActive: boolean;
};

const emptyForm = { name: '', address: '', city: '', state: '', contact_name: '', contact_phone: '' };

export default function EmployerEstablishmentsPage() {
  const user = useAuthStore((state) => state.user);
  const [employerId, setEmployerId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    if (!user?.id) return;

    const { data: employer, error: employerError } = await supabase
      .from('employer_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (employerError) {
      console.error(employerError);
      setError(errorMessage(employerError, 'Unable to load your employer profile.'));
      setLoading(false);
      return;
    }

    setEmployerId(employer.id);
    await ensureDefaultEstablishment(employer.id);

    const { data, error: queryError } = await supabase
      .from('establishments')
      .select('id, name, address, city, state, is_active')
      .eq('employer_id', employer.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(errorMessage(queryError));
    } else {
      const withCounts = await Promise.all(
        (data ?? []).map(async (item) => {
          const { count } = await supabase
            .from('deployments')
            .select('id', { count: 'exact', head: true })
            .eq('establishment_id', item.id)
            .eq('status', 'active');

          return {
            id: item.id,
            name: item.name,
            address: [item.address, item.city, item.state].filter(Boolean).join(', '),
            employees: count ?? 0,
            status: item.is_active ? 'active' : 'inactive',
            isActive: item.is_active,
          };
        }),
      );
      setRows(withCounts);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function addEstablishment(event: FormEvent) {
    event.preventDefault();
    if (!employerId) return;
    setError('');
    setMessage('');

    if (!form.name.trim() || !form.address.trim()) {
      setError('Name and address are required.');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('establishments').insert({
      employer_id: employerId,
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

    setMessage(`${form.name.trim()} was added. You can now select it when requesting staff.`);
    setForm(emptyForm);
    setShowForm(false);
    await load();
  }

  async function toggleActive(row: Row) {
    setError('');
    const { error: updateError } = await supabase.from('establishments').update({ is_active: !row.isActive }).eq('id', row.id);
    if (updateError) setError(errorMessage(updateError));
    else await load();
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name' },
    { key: 'address', header: 'Address' },
    { key: 'employees', header: 'Employees', align: 'right' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button className="table-link" type="button" onClick={() => void toggleActive(row)}>
          {row.isActive ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Establishments"
        title="Your establishments"
        description="Business locations where your workforce is deployed."
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Close' : 'Add establishment'}
          </button>
        }
      />

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <p className="success-message" style={{ marginBottom: 16 }}>{message}</p> : null}

      {showForm ? (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2>New establishment</h2>
          <form className="form" onSubmit={addEstablishment}>
            <label>
              Establishment name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Lekki Branch" required />
            </label>
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
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save establishment'}
            </button>
          </form>
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard label="Establishments" value={loading ? '—' : rows.length} hint="Registered locations" />
        <StatCard label="Active" value={loading ? '—' : rows.filter((row) => row.status === 'active').length} hint="Active sites" />
        <StatCard label="Deployed staff" value={loading ? '—' : rows.reduce((total, row) => total + row.employees, 0)} hint="Across all sites" />
      </div>
      <div className="content-card">
        {loading ? (
          <p className="muted">Loading establishments...</p>
        ) : (
          <DataTable columns={columns} rows={rows} emptyTitle="No establishments yet" emptyDescription="Use “Add establishment” to register your first location." />
        )}
      </div>
    </section>
  );
}
