import { useEffect, useState } from 'react';
import { formatCurrency } from '@/utils/format';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  period: string;
  basis: string;
  base: number;
  overtime: number;
  allowance: number;
  deductions: number;
  net: number;
  status: string;
  notes: string | null;
  runStatus: string;
};

export default function EmployeePayrollPage() {
  const user = useAuthStore((state) => state.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('payroll_items')
        .select(`
          id,
          salary_snapshot,
          deductions,
          overtime_amount,
          allowance_amount,
          net_pay,
          payment_status,
          pay_basis,
          calculation_notes,
          payroll_runs:payroll_run_id (period_start, period_end, status)
        `)
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false });

      if (error) console.error(error);
      else {
        setRows(
          (data ?? []).map((item) => {
            const run = Array.isArray(item.payroll_runs) ? item.payroll_runs[0] : item.payroll_runs;
            return {
              id: item.id,
              period: run ? `${run.period_start} – ${run.period_end}` : '—',
              basis: item.pay_basis ?? '—',
              base: Number(item.salary_snapshot ?? 0),
              overtime: Number(item.overtime_amount ?? 0),
              allowance: Number(item.allowance_amount ?? 0),
              deductions: Number(item.deductions ?? 0),
              net: Number(item.net_pay ?? 0),
              status: item.payment_status,
              notes: item.calculation_notes,
              runStatus: run?.status ?? 'draft',
            };
          }),
        );
      }
      setLoading(false);
    }
    void load();
  }, [user?.id]);

  const columns: Column<Row>[] = [
    { key: 'period', header: 'Period' },
    { key: 'basis', header: 'Basis' },
    { key: 'base', header: 'Base pay', align: 'right', render: (row) => formatCurrency(row.base) },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.deductions) },
    { key: 'net', header: 'Net pay', align: 'right', render: (row) => formatCurrency(row.net) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button className="table-link" type="button" onClick={() => setOpen(open === row.id ? null : row.id)}>
          {open === row.id ? 'Hide' : 'Breakdown'}
        </button>
      ),
    },
  ];

  const selected = rows.find((row) => row.id === open);

  return (
    <section>
      <PageHeader eyebrow="My payroll" title="Payroll" description="Payslips and payment records for each completed period, calculated from your agreed rate and confirmed attendance." />
      <div className="stat-grid">
        <StatCard label="Last net pay" value={loading ? '—' : formatCurrency(rows[0]?.net ?? 0)} hint="Most recent payslip" />
        <StatCard label="Periods paid" value={loading ? '—' : rows.filter((row) => row.status === 'paid').length} hint="Completed payments" />
        <StatCard label="Pending" value={loading ? '—' : rows.filter((row) => row.status !== 'paid').length} hint="Being processed" />
      </div>

      {selected ? (
        <div className="content-card" style={{ marginBottom: 16 }}>
          <h2>Breakdown - {selected.period}</h2>
          <dl className="detail-grid">
            <div><dt>Pay basis</dt><dd>{selected.basis}</dd></div>
            <div><dt>Payroll status</dt><dd><StatusBadge status={selected.runStatus} /></dd></div>
            <div><dt>Base pay</dt><dd>{formatCurrency(selected.base)}</dd></div>
            <div><dt>Overtime</dt><dd>{formatCurrency(selected.overtime)}</dd></div>
            <div><dt>Allowances/bonus</dt><dd>{formatCurrency(selected.allowance)}</dd></div>
            <div><dt>Deductions</dt><dd>-{formatCurrency(selected.deductions)}</dd></div>
            <div><dt>Net pay</dt><dd>{formatCurrency(selected.net)}</dd></div>
          </dl>
          {selected.notes ? <p className="hint">{selected.notes}</p> : null}
        </div>
      ) : null}

      <div className="content-card">
        {loading ? <p className="muted">Loading payroll...</p> : <DataTable columns={columns} rows={rows} emptyTitle="No payroll records" emptyDescription="Payslips appear once your first payment period is completed." />}
      </div>
    </section>
  );
}
