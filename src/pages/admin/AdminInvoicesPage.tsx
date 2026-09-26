import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Settings2, Send, XCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { confirmPayment, issueInvoice, setPlatformFee } from '@/lib/invoices';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type Row = {
  id: string;
  reference: string;
  employer: string;
  period: string;
  subtotal: number;
  fees: number;
  amount: number;
  status: string;
  dueDate: string | null;
};

type ItemRow = { id: string; description: string; kind: string; amount: number };
type PaymentRow = { id: string; amount: number; reference: string; paidOn: string; status: string; note: string | null };

export default function AdminInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showFeeSettings, setShowFeeSettings] = useState(false);
  const [feeAmount, setFeeAmount] = useState('15000');
  const [feeEnabled, setFeeEnabled] = useState(true);
  const [currentFee, setCurrentFee] = useState<{ default_fee: number; is_enabled: boolean; effective_from: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    const [invoicesRes, feeRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, period_start, period_end, subtotal, service_fee, total, status, due_date, employer_profiles:employer_id (business_name)')
        .order('created_at', { ascending: false }),
      supabase.from('platform_fee_settings').select('default_fee, is_enabled, effective_from').lte('effective_from', new Date().toISOString().slice(0, 10)).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (invoicesRes.error) setError(errorMessage(invoicesRes.error));
    else {
      setRows(
        (invoicesRes.data ?? []).map((item) => {
          const employer = Array.isArray(item.employer_profiles) ? item.employer_profiles[0] : item.employer_profiles;
          return {
            id: item.id,
            reference: item.invoice_number,
            employer: employer?.business_name ?? 'Unknown employer',
            period: `${item.period_start} – ${item.period_end}`,
            subtotal: Number(item.subtotal ?? 0),
            fees: Number(item.service_fee ?? 0),
            amount: Number(item.total ?? 0),
            status: item.status,
            dueDate: item.due_date,
          };
        }),
      );
    }

    if (feeRes.data) {
      setCurrentFee(feeRes.data);
      setFeeAmount(String(feeRes.data.default_fee));
      setFeeEnabled(feeRes.data.is_enabled);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function loadDetail() {
      if (!selected) {
        setItems([]);
        setPayments([]);
        return;
      }
      const [itemsRes, paymentsRes] = await Promise.all([
        supabase.from('invoice_items').select('id, description, kind, total_amount').eq('invoice_id', selected).order('kind'),
        supabase.from('invoice_payments').select('id, amount, payment_reference, paid_on, status, note').eq('invoice_id', selected).order('created_at', { ascending: false }),
      ]);
      setItems((itemsRes.data ?? []).map((item) => ({ id: item.id, description: item.description, kind: item.kind, amount: Number(item.total_amount) })));
      setPayments(
        (paymentsRes.data ?? []).map((item) => ({
          id: item.id,
          amount: Number(item.amount),
          reference: item.payment_reference,
          paidOn: item.paid_on,
          status: item.status,
          note: item.note,
        })),
      );
    }
    void loadDetail();
  }, [selected]);

  function done(message: string) {
    setNotice(message);
    flushEmailOutbox();
    void load();
  }

  async function handleIssue(id: string) {
    setBusy(`issue-${id}`);
    const { error: issueError } = await issueInvoice(id);
    setBusy(null);
    if (issueError) setError(issueError);
    else done('Invoice issued and the employer notified by email and dashboard.');
  }

  async function handlePayment(id: string, action: 'confirm' | 'reject') {
    setBusy(`${id}-${action}`);
    const { error: confirmError } = await confirmPayment(id, action);
    setBusy(null);
    if (confirmError) setError(confirmError);
    else {
      done(action === 'confirm' ? 'Payment confirmed - the invoice status was updated automatically.' : 'Payment marked as not confirmed.');
    }
  }

  async function handleFeeUpdate(event: FormEvent) {
    event.preventDefault();
    setBusy('fee');
    const amount = Number(feeAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid fee amount.');
      setBusy(null);
      return;
    }
    const { error: feeError } = await setPlatformFee(amount, feeEnabled);
    setBusy(null);
    if (feeError) setError(feeError);
    else done('Platform fee updated. It applies to invoices generated from now on.');
  }

  const columns: Column<Row>[] = [
    { key: 'reference', header: 'Reference' },
    { key: 'employer', header: 'Employer' },
    { key: 'period', header: 'Period' },
    { key: 'amount', header: 'Total', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="table-link" type="button" onClick={() => setSelected(row.id)}>
            Details
          </button>
          {row.status === 'draft' ? (
            <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handleIssue(row.id)}>
              <Send size={13} /> Issue
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const outstanding = rows.filter((row) => row.status !== 'paid' && row.status !== 'draft').reduce((total, row) => total + row.amount, 0);
  const collected = rows.filter((row) => row.status === 'paid').reduce((total, row) => total + row.amount, 0);
  const selectedRow = rows.find((row) => row.id === selected);
  const pendingPayments = payments.filter((payment) => payment.status === 'pending');

  return (
    <section>
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        description="Workforce service invoices issued to employers, itemised with salary charges and the platform fee."
        actions={<button className="btn btn-secondary" type="button" onClick={() => setShowFeeSettings((v) => !v)}><Settings2 size={15} /> Platform fee</button>}
      />
      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      {showFeeSettings ? (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2>Platform fee</h2>
          <p className="hint">
            Current default: {currentFee ? `${formatCurrency(currentFee.default_fee)} (${currentFee.is_enabled ? 'enabled' : 'disabled'}) since ${currentFee.effective_from}` : 'not set'}.
            Applied per active deployment when an invoice is generated, unless a deployment or employer has its own override.
          </p>
          <form className="form" onSubmit={handleFeeUpdate}>
            <div className="row-2">
              <label>
                Default fee (NGN)
                <input type="number" min={0} value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} />
              </label>
              <label className="check" style={{ alignSelf: 'end', minHeight: 48 }}>
                <input type="checkbox" checked={feeEnabled} onChange={(event) => setFeeEnabled(event.target.checked)} /> Fee enabled
              </label>
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy === 'fee'} style={{ width: 'fit-content' }}>
              {busy === 'fee' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Save fee setting
            </button>
          </form>
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard label="Outstanding" value={loading ? '—' : formatCurrency(outstanding)} hint="Issued, unpaid" />
        <StatCard label="Collected" value={loading ? '—' : formatCurrency(collected)} hint="Confirmed paid" />
        <StatCard label="Invoices" value={loading ? '—' : rows.length} hint="All time" />
      </div>

      <div className="content-card" style={{ marginBottom: 20 }}>
        {loading ? <p className="muted">Loading invoices...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No invoices issued" emptyDescription="Invoices appear after payroll for a period is approved and generated." />
        )}
      </div>

      {selectedRow ? (
        <div className="content-card">
          <h2>{selectedRow.reference} - {selectedRow.employer}</h2>
          <p className="hint">{selectedRow.period}</p>
          {items.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.description}</strong>
                <p>{item.kind === 'platform_fee' ? 'EnigteeWorld fee' : item.kind === 'salary' ? 'Salary charge' : 'Adjustment'}</p>
              </div>
              <span className="muted small">{formatCurrency(item.amount)}</span>
            </div>
          ))}
          <div className="list-row">
            <strong>Total</strong>
            <span className="muted small" style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--ink)' }}>{formatCurrency(selectedRow.amount)}</span>
          </div>

          <h2 className="section-gap">Payments</h2>
          {payments.length === 0 ? (
            <p className="muted">No payments submitted yet.</p>
          ) : (
            payments.map((payment) => (
              <div className="list-row" key={payment.id}>
                <div>
                  <strong>{formatCurrency(payment.amount)} - ref {payment.reference}</strong>
                  <p>Paid on {payment.paidOn}{payment.note ? ` · ${payment.note}` : ''}</p>
                </div>
                {payment.status === 'pending' ? (
                  <div className="inline-actions">
                    <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handlePayment(payment.id, 'confirm')}>
                      <CheckCircle2 size={13} /> Confirm
                    </button>
                    <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void handlePayment(payment.id, 'reject')}>
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                ) : (
                  <StatusBadge status={payment.status} />
                )}
              </div>
            ))
          )}
          {pendingPayments.length === 0 && payments.length > 0 ? <p className="hint">All submitted payments have been reviewed.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
