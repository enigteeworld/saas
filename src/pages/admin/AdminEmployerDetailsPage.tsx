import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Globe, Mail, Phone, Receipt, Users } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import { formatCurrency } from '@/utils/format';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

type Employer = {
  id: string;
  business_name: string;
  business_type: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  website: string | null;
  verification_status: string;
  owner_name: string | null;
  owner_email: string | null;
};

type EstablishmentRow = { id: string; name: string; address: string; is_active: boolean };
type EmployeeRow = { id: string; name: string; role: string; establishment: string; status: string };
type JobRow = { id: string; title: string; status: string; positions: number };
type InvoiceRow = { id: string; reference: string; period: string; amount: number; status: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminEmployerDetailsPage() {
  const { id } = useParams();
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [establishments, setEstablishments] = useState<EstablishmentRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      setError('');

      const { data, error: loadError } = await supabase
        .from('employer_profiles')
        .select('id, business_name, business_type, business_email, business_phone, business_address, website, verification_status, profiles:user_id (full_name, email)')
        .eq('id', id)
        .maybeSingle();

      if (loadError) {
        setError(errorMessage(loadError, 'Unable to load this employer.'));
        setLoading(false);
        return;
      }
      if (!data) {
        setEmployer(null);
        setLoading(false);
        return;
      }

      const owner = one(data.profiles as { full_name: string; email: string } | { full_name: string; email: string }[] | null);
      setEmployer({
        id: data.id,
        business_name: data.business_name,
        business_type: data.business_type,
        business_email: data.business_email,
        business_phone: data.business_phone,
        business_address: data.business_address,
        website: data.website,
        verification_status: data.verification_status,
        owner_name: owner?.full_name ?? null,
        owner_email: owner?.email ?? null,
      });

      const [estRes, depRes, jobRes, invRes] = await Promise.all([
        supabase.from('establishments').select('id, name, address, is_active').eq('employer_id', id).order('created_at', { ascending: false }),
        supabase
          .from('deployments')
          .select('id, role_title, status, profiles:employee_id (full_name), establishments:establishment_id (name)')
          .eq('employer_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('job_openings').select('id, title, status, positions_available').eq('employer_id', id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('id, invoice_number, period_start, period_end, total, status').eq('employer_id', id).order('created_at', { ascending: false }),
      ]);

      setEstablishments((estRes.data ?? []) as EstablishmentRow[]);
      setEmployees(
        (depRes.data ?? []).map((item) => ({
          id: item.id,
          name: one(item.profiles)?.full_name ?? 'Employee',
          role: item.role_title,
          establishment: one(item.establishments)?.name ?? '—',
          status: item.status,
        })),
      );
      setJobs((jobRes.data ?? []).map((item) => ({ id: item.id, title: item.title, status: item.status, positions: item.positions_available ?? 1 })));
      setInvoices(
        (invRes.data ?? []).map((item) => ({
          id: item.id,
          reference: item.invoice_number,
          period: `${item.period_start} – ${item.period_end}`,
          amount: Number(item.total ?? 0),
          status: item.status,
        })),
      );
      setLoading(false);
    }
    void load();
  }, [id]);

  const employeeColumns: Column<EmployeeRow>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'role', header: 'Role' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  const jobColumns: Column<JobRow>[] = [
    { key: 'title', header: 'Role' },
    { key: 'positions', header: 'Positions', align: 'right' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  const invoiceColumns: Column<InvoiceRow>[] = [
    { key: 'reference', header: 'Reference' },
    { key: 'period', header: 'Period' },
    { key: 'amount', header: 'Total', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  if (!loading && !employer) {
    return (
      <EmptyState
        title="Employer not found"
        description="This employer may have been removed."
        action={<Link className="btn btn-primary" to="/admin/employers">Back to employers</Link>}
      />
    );
  }

  return (
    <section>
      <Link to="/admin/employers" className="back-link">
        <ArrowLeft size={15} /> All employers
      </Link>

      {error ? <div className="error-message">{error}</div> : null}

      {loading ? (
        <div className="content-card"><p className="muted">Loading employer...</p></div>
      ) : employer ? (
        <>
          <PageHeader
            eyebrow="Employer"
            title={employer.business_name}
            description={employer.business_type ?? undefined}
            actions={<StatusBadge status={employer.verification_status} />}
          />

          <div className="stat-grid">
            <StatCard label="Establishments" value={establishments.length} hint="Registered locations" />
            <StatCard label="Employees" value={employees.length} hint="Deployed staff" />
            <StatCard label="Job openings" value={jobs.length} hint="All time" />
            <StatCard label="Invoices" value={invoices.length} hint="All time" />
          </div>

          <div className="dashboard-grid">
            <div className="content-card">
              <h2><Building2 size={19} style={{ verticalAlign: '-3px' }} /> Business details</h2>
              <dl className="detail-grid">
                <div><dt><Mail size={12} /> Business email</dt><dd>{employer.business_email ?? 'Not provided'}</dd></div>
                <div><dt><Phone size={12} /> Business phone</dt><dd>{employer.business_phone ?? 'Not provided'}</dd></div>
                <div><dt>Address</dt><dd>{employer.business_address ?? 'Not provided'}</dd></div>
                <div><dt><Globe size={12} /> Website</dt><dd>{employer.website ?? 'Not provided'}</dd></div>
              </dl>
            </div>

            <div className="content-card">
              <h2><Users size={19} style={{ verticalAlign: '-3px' }} /> Account owner</h2>
              <dl className="detail-grid">
                <div><dt>Name</dt><dd>{employer.owner_name ?? '—'}</dd></div>
                <div><dt>Email</dt><dd>{employer.owner_email ?? '—'}</dd></div>
              </dl>
            </div>
          </div>

          <div className="content-card">
            <h2>Establishments</h2>
            {establishments.length === 0 ? (
              <p className="muted">No establishments registered yet.</p>
            ) : (
              establishments.map((item) => (
                <div className="list-row" key={item.id}>
                  <Building2 size={18} />
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.address}</p>
                  </div>
                  <span className={`status-badge ${item.is_active ? 'status-success' : 'status-neutral'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              ))
            )}
          </div>

          <div className="content-card">
            <h2>Employees</h2>
            <DataTable columns={employeeColumns} rows={employees} emptyTitle="No employees deployed" emptyDescription="Deployed staff will appear here once hired." />
          </div>

          <div className="content-card">
            <h2>Job openings</h2>
            <DataTable columns={jobColumns} rows={jobs} emptyTitle="No job openings" emptyDescription="Roles created for this employer will appear here." />
          </div>

          <div className="content-card">
            <h2><Receipt size={19} style={{ verticalAlign: '-3px' }} /> Invoices</h2>
            <DataTable columns={invoiceColumns} rows={invoices} emptyTitle="No invoices" emptyDescription="Invoices issued to this employer will appear here." />
          </div>
        </>
      ) : null}
    </section>
  );
}
