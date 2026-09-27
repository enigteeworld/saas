import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Loader2, Mail, MapPin, Phone, Receipt, Send } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import { supabase } from '@/lib/supabase';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';
import { proposeAdjustment } from '@/lib/payroll';
import WorkScheduleEditor from '@/components/shared/WorkScheduleEditor';

type Employee = {
  id: string;
  employee_id: string;
  role_title: string;
  start_date: string | null;
  status: string;
  agreed_salary: number;
  application_id: string | null;
  employee_name: string;
  establishment: string;
  email: string;
  phone: string | null;
  address: string | null;
  state: string | null;
  lga: string | null;
};

type DocumentRow = { id: string; document_kind: string; file_path: string; original_name: string | null };

type AttendanceRow = {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

export default function EmployerEmployeeDetailsPage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [busyDocument, setBusyDocument] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustmentCategory, setAdjustmentCategory] = useState<'overtime' | 'allowance' | 'bonus' | 'deduction'>('overtime');
  const [deductionAmount, setDeductionAmount] = useState('');
  const [deductionReason, setDeductionReason] = useState('');
  const [submittingDeduction, setSubmittingDeduction] = useState(false);
  const [deductionMessage, setDeductionMessage] = useState('');
  const [deductionError, setDeductionError] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;

      const { data, error } = await supabase
        .from('deployments')
        .select(`
          id,
          employee_id,
          role_title,
          start_date,
          status,
          agreed_salary,
          application_id,
          profiles:employee_id (full_name, email, phone),
          establishments:establishment_id (name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      if (!data) {
        setEmployee(null);
        setLoading(false);
        return;
      }

      const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
      const establishment = Array.isArray(data.establishments) ? data.establishments[0] : data.establishments;

      const { data: staffProfile, error: staffProfileError } = await supabase.rpc(
        'get_employer_employee_profile',
        { p_deployment_id: data.id },
      );

      if (staffProfileError) {
        console.error(staffProfileError);
      }

      const safeProfile = Array.isArray(staffProfile)
        ? staffProfile[0]
        : staffProfile;

      setEmployee({
        id: data.id,
        employee_id: data.employee_id,
        role_title: data.role_title,
        start_date: data.start_date,
        status: data.status,
        agreed_salary: Number(data.agreed_salary ?? 0),
        application_id: data.application_id,
        employee_name: safeProfile?.full_name ?? profile?.full_name ?? 'Employee',
        establishment: establishment?.name ?? '—',
        email: safeProfile?.email ?? profile?.email ?? '—',
        phone: safeProfile?.phone ?? profile?.phone ?? null,
        address: safeProfile?.address ?? null,
        state: safeProfile?.state ?? null,
        lga: safeProfile?.lga ?? null,
      });

      if (data.application_id) {
        const { data: documentData, error: documentError } = await supabase
          .from('application_documents')
          .select('id, document_kind, file_path, original_name')
          .eq('application_id', data.application_id)
          .order('created_at', { ascending: false });

        if (documentError) console.error(documentError);
        else setDocuments(documentData ?? []);
      }

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_events')
        .select('id, attendance_date, check_in_at, check_out_at, status')
        .eq('deployment_id', data.id)
        .order('attendance_date', { ascending: false });

      if (attendanceError) console.error(attendanceError);
      else {
        setAttendance((attendanceData ?? []).map((item) => ({
          id: item.id,
          date: new Date(item.attendance_date).toLocaleDateString('en-NG'),
          checkIn: item.check_in_at ? new Date(item.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          checkOut: item.check_out_at ? new Date(item.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          status: item.status,
        })));
      }

      setLoading(false);
    }

    void load();
  }, [id]);

  async function downloadDocument(document: DocumentRow) {
    setBusyDocument(document.id);
    try {
      const { data, error } = await getApplicationDocumentUrl(document.file_path);
      if (error || !data?.signedUrl) {
        throw error ?? new Error('Unable to create secure download link.');
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error(err);
    } finally {
      setBusyDocument(null);
    }
  }

  async function submitDeduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeductionError('');
    setDeductionMessage('');

    const amount = Number(deductionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDeductionError('Enter an amount greater than zero.');
      return;
    }
    if (!deductionReason.trim()) {
      setDeductionError('A reason is required for every adjustment.');
      return;
    }

    setSubmittingDeduction(true);
    const { error } = await proposeAdjustment({
      deploymentId: employee?.id ?? '',
      category: adjustmentCategory,
      amount,
      reason: deductionReason.trim(),
    });
    setSubmittingDeduction(false);

    if (error) {
      setDeductionError(error);
      return;
    }

    setDeductionAmount('');
    setDeductionReason('');
    setDeductionMessage(
      `The ${adjustmentCategory} was submitted to EnigteeWorld for admin review. Once approved, it will be included in the applicable payroll run.`,
    );
  }

  const columns: Column<AttendanceRow>[] = [
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  if (!loading && !employee) {
    return (
      <EmptyState
        title="Employee not found"
        description="This deployment may have been transferred or removed."
        action={<Link className="btn btn-primary" to="/employer/employees">Back to employees</Link>}
      />
    );
  }

  return (
    <section>
      <Link to="/employer/employees" className="back-link">
        <ArrowLeft size={15} /> All employees
      </Link>

      {loading ? <div className="content-card"><p className="muted">Loading employee...</p></div> : employee ? (
        <>
          <PageHeader
            eyebrow={`Deployment ${employee.id}`}
            title={employee.employee_name}
            description={`${employee.role_title} · ${employee.establishment}`}
            actions={<StatusBadge status={employee.status} />}
          />

          <div className="stat-grid">
            <StatCard label="Role" value={employee.role_title} hint="Current position" />
            <StatCard label="Establishment" value={employee.establishment} hint="Deployment site" />
            <StatCard label="Start date" value={employee.start_date ? new Date(employee.start_date).toLocaleDateString('en-NG') : '—'} hint="First day" />
            <StatCard label="Salary" value={new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(employee.agreed_salary)} hint="Agreed monthly" />
          </div>

          <div className="dashboard-grid">
            <div className="content-card">
              <h2>Contact</h2>
              <dl className="detail-grid">
                <div><dt><Mail size={12} /> Email</dt><dd>{employee.email}</dd></div>
                <div><dt><Phone size={12} /> Phone</dt><dd>{employee.phone ?? 'Not provided'}</dd></div>
                <div><dt><MapPin size={12} /> Address</dt><dd>{employee.address ?? 'Not provided'}</dd></div>
                <div><dt>State / LGA</dt><dd>{[employee.state, employee.lga].filter(Boolean).join(' / ') || 'Not provided'}</dd></div>
              </dl>
            </div>

            <WorkScheduleEditor deploymentId={employee.id} />

            <div className="content-card">
              <h2><Receipt size={19} style={{ verticalAlign: '-3px' }} /> Payroll adjustment</h2>
              <p className="muted">
                Propose overtime, an allowance, a bonus or a deduction against this employee's deployment.
                EnigteeWorld admin reviews it before it affects payroll.
              </p>

              <form className="form" onSubmit={submitDeduction}>
                <label>
                  Type
                  <select
                    value={adjustmentCategory}
                    onChange={(event) =>
                      setAdjustmentCategory(event.target.value as 'overtime' | 'allowance' | 'bonus' | 'deduction')
                    }
                  >
                    <option value="overtime">Overtime payment</option>
                    <option value="allowance">Allowance</option>
                    <option value="bonus">Bonus</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </label>

                <label>
                  Amount (NGN)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={deductionAmount}
                    onChange={(event) => setDeductionAmount(event.target.value)}
                    placeholder="15000"
                    required
                  />
                </label>

                <label>
                  Reason
                  <textarea
                    rows={3}
                    value={deductionReason}
                    onChange={(event) => setDeductionReason(event.target.value)}
                    placeholder="Reason for this adjustment"
                    required
                  />
                </label>

                {deductionError ? <p className="error">{deductionError}</p> : null}
                {deductionMessage ? <p className="success-message">{deductionMessage}</p> : null}

                <button className="btn btn-primary" type="submit" disabled={submittingDeduction}>
                  {submittingDeduction ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                  {submittingDeduction ? 'Submitting…' : 'Submit adjustment'}
                </button>
              </form>
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
                    className="btn btn-secondary"
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
            <DataTable columns={columns} rows={attendance} emptyTitle="No attendance yet" emptyDescription="Records appear once this employee checks in." />
          </div>
        </>
      ) : null}
    </section>
  );
}
