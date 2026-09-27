import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, PlayCircle, Receipt, ThumbsDown, ThumbsUp } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { approvePayroll, markPayrollPaid, reviewAdjustment, runPayroll } from '@/lib/payroll';
import { generateInvoice } from '@/lib/invoices';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type ItemRow = {
  id: string;
  employee: string;
  employer: string;
  employerId: string;
  payBasis: string;
  daysPresent: number;
  hours: number;
  base: number;
  overtime: number;
  allowance: number;
  deductions: number;
  net: number;
  notes: string | null;
};

type RunRow = {
  id: string;
  period: string;
  employer: string;
  status: string;
  createdAt: string;
  itemCount: number;
};

type AdjustmentRow = {
  id: string;
  employee: string;
  employer: string;
  category: string;
  amount: number;
  reason: string;
  status: string;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminPayrollPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [employers, setEmployers] = useState<{ id: string; business_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [periodStart, setPeriodStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10));
  const [runEmployer, setRunEmployer] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [runsRes, employersRes, adjustmentsRes] = await Promise.all([
      supabase
        .from('payroll_runs')
        .select('id, period_start, period_end, status, created_at, employer_profiles:employer_id (business_name), payroll_items(count)')
        .order('created_at', { ascending: false }),
      supabase.from('employer_profiles').select('id, business_name').order('business_name'),
      supabase
        .from('payroll_adjustments')
        .select('id, category, amount, reason, status, deployments:deployment_id (profiles:employee_id (full_name), employer_profiles:employer_id (business_name))')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (runsRes.error) setError(errorMessage(runsRes.error));
    else {
      setRuns(
        (runsRes.data ?? []).map((item) => ({
          id: item.id,
          period: `${item.period_start} – ${item.period_end}`,
          employer: one(item.employer_profiles)?.business_name ?? 'All employers',
          status: item.status,
          createdAt: new Date(item.created_at).toLocaleDateString('en-NG'),
          itemCount: Array.isArray(item.payroll_items) ? (item.payroll_items[0] as { count: number } | undefined)?.count ?? 0 : 0,
        })),
      );
    }

    setEmployers((employersRes.data ?? []) as { id: string; business_name: string }[]);

    setAdjustments(
      (adjustmentsRes.data ?? []).map((item) => {
        const deployment = one(item.deployments as { profiles: { full_name: string } | { full_name: string }[] | null; employer_profiles: { business_name: string } | { business_name: string }[] | null } | { profiles: { full_name: string } | { full_name: string }[] | null; employer_profiles: { business_name: string } | { business_name: string }[] | null }[] | null);
        return {
          id: item.id,
          employee: one(deployment?.profiles)?.full_name ?? 'Employee',
          employer: one(deployment?.employer_profiles)?.business_name ?? '—',
          category: item.category,
          amount: Number(item.amount),
          reason: item.reason,
          status: item.status,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function loadItems() {
      if (!selectedRun) {
        setItems([]);
        return;
      }
      const { data } = await supabase
        .from('payroll_items')
        .select('id, pay_basis, days_present, hours_worked, salary_snapshot, overtime_amount, allowance_amount, deductions, net_pay, calculation_notes, profiles:employee_id (full_name), employer_profiles:employer_id (id, business_name)')
        .eq('payroll_run_id', selectedRun);

      setItems(
        (data ?? []).map((item) => {
          const employer = one(item.employer_profiles as { id: string; business_name: string } | { id: string; business_name: string }[] | null);
          return {
            id: item.id,
            employee: one(item.profiles)?.full_name ?? 'Employee',
            employer: employer?.business_name ?? '—',
            employerId: employer?.id ?? '',
            payBasis: item.pay_basis ?? '—',
            daysPresent: item.days_present ?? 0,
            hours: Number(item.hours_worked ?? 0),
            base: Number(item.salary_snapshot ?? 0),
            overtime: Number(item.overtime_amount ?? 0),
            allowance: Number(item.allowance_amount ?? 0),
            deductions: Number(item.deductions ?? 0),
            net: Number(item.net_pay ?? 0),
            notes: item.calculation_notes,
          };
        }),
      );
    }
    void loadItems();
  }, [selectedRun]);

  function done(message: string) {
    setNotice(message);
    flushEmailOutbox();
    void load();
  }

  async function handleRun(event: FormEvent) {
    event.preventDefault();
    setBusy('run');
    setError('');
    const { data, error: runError } = await runPayroll(periodStart, periodEnd, runEmployer || null);
    setBusy(null);
    if (runError) setError(runError);
    else {
      setSelectedRun((data as { id: string } | null)?.id ?? null);
      done('Payroll calculated from confirmed attendance and approved adjustments.');
    }
  }

  async function handleApprove(runId: string) {
    setBusy(`approve-${runId}`);
    const { error: approveError } = await approvePayroll(runId);
    setBusy(null);
    if (approveError) setError(approveError);
    else done('Payroll approved and locked. Employees have been notified.');
  }

  async function handleGenerateInvoices(run: RunRow) {
    setBusy(`invoice-${run.id}`);
    setError('');
    try {
      const { data: runEmployers } = await supabase.from('payroll_items').select('employer_id').eq('payroll_run_id', run.id);
      const uniqueEmployers = Array.from(new Set((runEmployers ?? []).map((item) => item.employer_id))) as string[];
      let created = 0;
      for (const empId of uniqueEmployers) {
        const { error: genError } = await generateInvoice(run.id, empId);
        if (genError && !genError.includes('already exists')) throw new Error(genError);
        if (!genError) created += 1;
      }
      done(created > 0 ? `Generated ${created} invoice(s) as drafts. Review and issue them from Invoices.` : 'Invoices already exist for this payroll run.');
    } catch (err) {
      setError(errorMessage(err, 'Unable to generate invoices.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdjustment(id: string, action: 'approve' | 'reject') {
    setBusy(`${id}-${action}`);
    const { error: reviewError } = await reviewAdjustment(id, action);
    setBusy(null);
    if (reviewError) setError(reviewError);
    else done(action === 'approve' ? 'Adjustment approved - it will be included in the next payroll run.' : 'Adjustment rejected.');
  }

  async function handleMarkPaid(runId: string) {
    if (!window.confirm('Only confirm this once you have actually transferred pay to each employee\'s payout account. This will mark every payslip in this run as paid and notify employees.')) {
      return;
    }
    setBusy(`paid-${runId}`);
    const { error: paidError } = await markPayrollPaid(runId);
    setBusy(null);
    if (paidError) setError(paidError);
    else done('Payroll marked as paid. Employees have been notified.');
  }

  const runColumns: Column<RunRow>[] = [
    { key: 'period', header: 'Period' },
    { key: 'employer', header: 'Scope' },
    { key: 'itemCount', header: 'Items', align: 'right' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="table-link" type="button" onClick={() => setSelectedRun(row.id)}>
            View items
          </button>
          {row.status === 'calculated' ? (
            <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleApprove(row.id)}>
              Approve & lock
            </button>
          ) : null}
          {row.status === 'approved' ? (
            <button className="btn btn-secondary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleGenerateInvoices(row)}>
              <Receipt size={13} /> Generate invoices
            </button>
          ) : null}
          {row.status === 'approved' ? (
            <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleMarkPaid(row.id)}>
              Mark payroll paid
            </button>
          ) : null}
          {row.status === 'paid' ? <StatusBadge status="paid" /> : null}
        </div>
      ),
    },
  ];

  const itemColumns: Column<ItemRow>[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'employer', header: 'Employer' },
    { key: 'payBasis', header: 'Basis' },
    { key: 'daysPresent', header: 'Days', align: 'right' },
    { key: 'base', header: 'Base pay', align: 'right', render: (row) => formatCurrency(row.base) },
    { key: 'overtime', header: 'Overtime/allowance', align: 'right', render: (row) => formatCurrency(row.overtime + row.allowance) },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.deductions) },
    { key: 'net', header: 'Net pay', align: 'right', render: (row) => formatCurrency(row.net) },
  ];

  const adjustmentColumns: Column<AdjustmentRow>[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'employer', header: 'Employer' },
    { key: 'category', header: 'Type' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'reason', header: 'Reason' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleAdjustment(row.id, 'approve')}>
            <ThumbsUp size={13} /> Approve
          </button>
          <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleAdjustment(row.id, 'reject')}>
            <ThumbsDown size={13} /> Reject
          </button>
        </div>
      ),
    },
  ];

  const totalNet = runs.length && items.length ? items.reduce((total, item) => total + item.net, 0) : 0;

  return (
    <section>
      <PageHeader
        eyebrow="Finance"
        title="Payroll"
        description="Run payroll from confirmed attendance and approved adjustments, then approve, lock and invoice."
        actions={<Link className="btn btn-secondary" to="/admin/attendance">View attendance</Link>}
      />

      <div className="notice-card" style={{ marginBottom: 20 }}>
        <h3>Two separate payments happen here</h3>
        <p>
          1) The <strong>employer</strong> pays EnigteeWorld against an issued invoice (Admin → Invoices).{' '}
          2) <strong>EnigteeWorld pays each employee</strong> from that money into their payout account - once you've actually made
          those transfers, come back to an approved run below and click <strong>"Mark payroll paid"</strong>. That's the step
          that changes an employee's payslip from "Pending" to "Paid" - nothing does it automatically.
        </p>
      </div>
      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="stat-grid">
        <StatCard label="Payroll runs" value={loading ? '—' : runs.length} hint="All time" />
        <StatCard label="Pending adjustments" value={loading ? '—' : adjustments.length} hint="Awaiting review" />
        <StatCard label="Selected run net" value={loading ? '—' : formatCurrency(totalNet)} hint={selectedRun ? 'Loaded items' : 'Select a run'} />
      </div>

      <div className="content-card" style={{ marginBottom: 20 }}>
        <h2><PlayCircle size={19} style={{ verticalAlign: '-3px' }} /> Run payroll</h2>
        <p className="hint">Uses each active deployment's own agreed rate and pay basis, plus confirmed attendance and approved adjustments for the period - never the original job-opening salary. Monthly salaries are not prorated by default. The EnigteeWorld platform fee is only added when the deployment covers the full payroll period; an employee who leaves before the period ends does not attract that month's platform fee.</p>
        <form className="form" onSubmit={handleRun}>
          <div className="row-2">
            <label>
              Period start
              <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
            </label>
            <label>
              Period end
              <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
            </label>
          </div>
          <label>
            Scope (optional)
            <select value={runEmployer} onChange={(event) => setRunEmployer(event.target.value)}>
              <option value="">All employers</option>
              {employers.map((employer) => (
                <option value={employer.id} key={employer.id}>{employer.business_name}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy === 'run'}>
            {busy === 'run' ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={15} />} Calculate payroll
          </button>
        </form>
      </div>

      {adjustments.length > 0 ? (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2>Adjustments awaiting review</h2>
          <p className="hint">Overtime, allowances, bonuses and deductions proposed by employers. Approved items are included in the next payroll run for that deployment.</p>
          <DataTable columns={adjustmentColumns} rows={adjustments} emptyTitle="Nothing pending" emptyDescription="Employer-proposed adjustments appear here." />
        </div>
      ) : null}

      <div className="content-card" style={{ marginBottom: 20 }}>
        <h2>Payroll runs</h2>
        {loading ? <p className="muted">Loading...</p> : (
          <DataTable columns={runColumns} rows={runs} emptyTitle="No payroll runs yet" emptyDescription="Calculate your first payroll run above." />
        )}
      </div>

      {selectedRun ? (
        <div className="content-card">
          <h2>Payroll items</h2>
          {items.length === 0 ? (
            <EmptyState title="No items" description="This run has no eligible deployments for the period." />
          ) : (
            <>
              <DataTable columns={itemColumns} rows={items} emptyTitle="No items" emptyDescription="" />
              <p className="hint" style={{ marginTop: 12 }}>
                Every amount has a source - hover isn't needed, the calculation note is stored per item (e.g. base pay basis, confirmed attendance count, adjustments applied).
              </p>
            </>
          )}
        </div>
      ) : null}

      <p className="hint section-gap">
        Generated invoices start as drafts - open <Link className="table-link" to="/admin/invoices">Invoices</Link> to review and issue them to employers.
      </p>
    </section>
  );
}
