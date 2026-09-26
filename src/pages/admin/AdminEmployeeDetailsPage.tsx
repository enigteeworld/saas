import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Download, FileText, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import { formatCurrency } from '@/utils/format';
import { supabase } from '@/lib/supabase';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';
import { errorMessage } from '@/lib/errors';

type Employee = {
  id: string;
  employee_id: string;
  role_title: string;
  start_date: string | null;
  status: string;
  agreed_salary: number;
  pay_basis: string;
  application_id: string | null;
  employee_name: string;
  establishment: string;
  employer: string;
  email: string;
  phone: string | null;
  address: string | null;
  state: string | null;
  lga: string | null;
  country: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
};

type DocumentRow = { id: string; document_kind: string; file_path: string; original_name: string | null };
type AttendanceRow = { id: string; date: string; checkIn: string; checkOut: string; status: string; confirmation: string };
type PayrollRow = { id: string; period: string; net: number; status: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminEmployeeDetailsPage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [busyDocument, setBusyDocument] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      setError('');

      const { data, error: loadError } = await supabase
        .from('deployments')
        .select(`
          id,
          employee_id,
          role_title,
          start_date,
          status,
          agreed_salary,
          pay_basis,
          application_id,
          profiles:employee_id (full_name, email, phone),
          establishments:establishment_id (name),
          employer_profiles:employer_id (business_name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (loadError) {
        setError(errorMessage(loadError, 'Unable to load this employee.'));
        setLoading(false);
        return;
      }
      if (!data) {
        setEmployee(null);
        setLoading(false);
        return;
      }

      const profile = one(data.profiles as { full_name: string; email: string; phone: string | null } | { full_name: string; email: string; phone: string | null }[] | null);
      const establishment = one(data.establishments as { name: string } | { name: string }[] | null);
      const employer = one(data.employer_profiles as { business_name: string } | { business_name: string }[] | null);

      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('address, state, lga, country, bank_name, account_number, account_name')
        .eq('user_id', data.employee_id)
        .maybeSingle();

      setEmployee({
        id: data.id,
        employee_id: data.employee_id,
        role_title: data.role_title,
        start_date: data.start_date,
        status: data.status,
        agreed_salary: Number(data.agreed_salary ?? 0),
        pay_basis: data.pay_basis ?? 'monthly',
        application_id: data.application_id,
        employee_name: profile?.full_name ?? 'Employee',
        establishment: establishment?.name ?? '—',
        employer: employer?.business_name ?? '—',
        email: profile?.email ?? '—',
        phone: profile?.phone ?? null,
        address: staffProfile?.address ?? null,
        state: staffProfile?.state ?? null,
        lga: staffProfile?.lga ?? null,
        country: staffProfile?.country ?? null,
        bank_name: staffProfile?.bank_name ?? null,
        account_number: staffProfile?.account_number ?? null,
        account_name: staffProfile?.account_name ?? null,
      });

      if (data.application_id) {
        const { data: documentData } = await supabase
          .from('application_documents')
          .select('id, document_kind, file_path, original_name')
          .eq('application_id', data.application_id)
          .order('created_at', { ascending: false });
        setDocuments(documentData ?? []);
      }

      const [attendanceRes, payrollRes] = await Promise.all([
        supabase
          .from('attendance_events')
          .select('id, attendance_date, check_in_at, check_out_at, status, confirmation_status')
          .eq('deployment_id', data.id)
          .order('attendance_date', { ascending: false })
          .limit(60),
        supabase
          .from('payroll_items')
          .select('id, net_pay, payment_status, payroll_runs:payroll_run_id (period_start, period_end)')
          .eq('deployment_id', data.id)
          .order('created_at', { ascending: false }),
      ]);

      setAttendance(
        (attendanceRes.data ?? []).map((item) => ({
          id: item.id,
          date: new Date(item.attendance_date).toLocaleDateString('en-NG'),
          checkIn: item.check_in_at ? new Date(item.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          checkOut: item.check_out_at ? new Date(item.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          status: item.status,
          confirmation: item.confirmation_status,
        })),
      );

      setPayroll(
        (payrollRes.data ?? []).map((item) => {
          const run = one(item.payroll_runs as { period_start: string; period_end: string } | { period_start: string; period_end: string }[] | null);
          return {
            id: item.id,
            period: run ? `${run.period_start} – ${run.period_end}` : '—',
            net: Number(item.net_pay ?? 0),
            status: item.payment_status,
          };
        }),
      );

      setLoading(false);
    }

    void load();
  }, [id]);

  async function downloadDocument(document: DocumentRow) {
    setBusyDocument(document.id);
    try {
      const { data, error: urlError } = await getApplicationDocumentUrl(document.file_path);
      if (urlError || !data?.signedUrl) throw urlError ?? new Error('Unable to create secure download link.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(errorMessage(err, 'Unable to download document.'));
    } finally {
      setBusyDocument(null);
    }
  }

  const attendanceColumns: Column<AttendanceRow>[] = [
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'confirmation', header: 'Confirmation', render: (row) => <StatusBadge status={row.confirmation} /> },
  ];

  const payrollColumns: Column<PayrollRow>[] = [
    { key: 'period', header: 'Period' },
    { key: 'net', header: 'Net pay', align: 'right', render: (row) => formatCurrency(row.net) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  if (!loading && !employee) {
    return (
      <EmptyState
        title="Employee not found"
        description="This deployment may have been transferred or removed."
        action={<Link className="btn btn-primary" to="/admin/employees">Back to employees</Link>}
      />
    );
  }

  return (
    <section>
      <Link to="/admin/employees" className="back-link">
        <ArrowLeft size={15} /> All employees
      </Link>

      {error ? <div className="error-message">{error}</div> : null}

      {loading ? (
        <div className="content-card"><p className="muted">Loading employee...</p></div>
      ) : employee ? (
        <>
          <PageHeader
            eyebrow={`${employee.employer} · ${employee.establishment}`}
            title={employee.employee_name}
            description={`${employee.role_title} · ${employee.pay_basis} pay`}
            actions={<StatusBadge status={employee.status} />}
          />

          <div className="stat-grid">
            <StatCard label="Role" value={employee.role_title} hint="Current position" />
            <StatCard label="Establishment" value={employee.establishment} hint={employee.employer} />
            <StatCard label="Start date" value={employee.start_date ? new Date(employee.start_date).toLocaleDateString('en-NG') : '—'} hint="First day" />
            <StatCard label="Agreed pay" value={formatCurrency(employee.agreed_salary)} hint={employee.pay_basis} />
          </div>

          <div className="dashboard-grid">
            <div className="content-card">
              <h2>Contact & identity</h2>
              <dl className="detail-grid">
                <div><dt><Mail size={12} /> Email</dt><dd>{employee.email}</dd></div>
                <div><dt><Phone size={12} /> Phone</dt><dd>{employee.phone ?? 'Not provided'}</dd></div>
                <div><dt><MapPin size={12} /> Address</dt><dd>{employee.address ?? 'Not provided'}</dd></div>
                <div><dt>State / LGA</dt><dd>{[employee.state, employee.lga].filter(Boolean).join(' / ') || 'Not provided'}</dd></div>
                <div><dt>Country</dt><dd>{employee.country ?? 'Not provided'}</dd></div>
              </dl>
            </div>

            <div className="content-card">
              <h2><Banknote size={19} style={{ verticalAlign: '-3px' }} /> Payout details</h2>
              {employee.bank_name || employee.account_number ? (
                <dl className="detail-grid">
                  <div><dt>Bank</dt><dd>{employee.bank_name ?? 'Not provided'}</dd></div>
                  <div><dt>Account number</dt><dd>{employee.account_number ?? 'Not provided'}</dd></div>
                  <div><dt>Account name</dt><dd>{employee.account_name ?? 'Not provided'}</dd></div>
                </dl>
              ) : (
                <p className="muted">This employee has not added payout details to their profile yet.</p>
              )}
            </div>
          </div>

          <div className="content-card">
            <h2>Application documents</h2>
            {documents.length === 0 ? (
              <p className="muted">No application documents are available.</p>
            ) : (
              documents.map((document) => (
                <div className="list-row" key={document.id}>
                  <FileText size={18} />
                  <div>
                    <strong>{document.original_name || document.document_kind.replace(/_/g, ' ')}</strong>
                    <p>{document.document_kind.replace(/_/g, ' ')}</p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    disabled={busyDocument === document.id}
                    onClick={() => void downloadDocument(document)}
                  >
                    {busyDocument === document.id ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    Download
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="content-card">
            <h2>Attendance history</h2>
            <DataTable columns={attendanceColumns} rows={attendance} emptyTitle="No attendance yet" emptyDescription="Records appear once this employee checks in." />
          </div>

          <div className="content-card">
            <h2>Payroll history</h2>
            <DataTable columns={payrollColumns} rows={payroll} emptyTitle="No payroll yet" emptyDescription="Payslips appear once payroll is run for this employee." />
          </div>
        </>
      ) : null}
    </section>
  );
}
