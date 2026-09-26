import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { submitPayment } from '@/lib/invoices';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  reference: string;
  period: string;
  amount: number;
  status: string;
  dueDate: string | null;
};

type ItemRow = { id: string; description: string; kind: string; amount: number };
type PaymentRow = { id: string; amount: number; reference: string; paidOn: string; status: string };

export default function EmployerInvoicesPage() {
  const user = useAuthStore((state) => state.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError('');
    const { data, error: queryError } = await supabase
      .from('invoices')
      .select('id, invoice_number, period_start, period_end, total, status, due_date')
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (queryError) setError(errorMessage(queryError));
    else
      setRows(
        (data ?? []).map((item) => ({
          id: item.id,
          reference: item.invoice_number,
          period: `${item.period_start} – ${item.period_end}`,
          amount: Number(item.total ?? 0),
          status: item.status,
          dueDate: item.due_date,
        })),
      );
    setLoading(false);
  }, [user?.id]);

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
        supabase.from('invoice_payments').select('id, amount, payment_reference, paid_on, status').eq('invoice_id', selected).order('created_at', { ascending: false }),
      ]);
      setItems((itemsRes.data ?? []).map((item) => ({ id: item.id, description: item.description, kind: item.kind, amount: Number(item.total_amount) })));
      setPayments((paymentsRes.data ?? []).map((item) => ({ id: item.id, amount: Number(item.amount), reference: item.payment_reference, paidOn: item.paid_on, status: item.status })));
    }
    void loadDetail();
  }, [selected]);

  async function handleSubmitPayment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Enter a valid amount.');
    if (!reference.trim()) return setError('Enter the payment reference.');

    setBusy(true);
    setError('');
    const { error: submitError } = await submitPayment({ invoiceId: selected, amount: numericAmount, reference, paidOn, note });
    setBusy(false);
    if (submitError) setError(submitError);
    else {
      setNotice('Payment submitted. Admin will confirm it once verified, and the invoice will update automatically.');
      setAmount('');
      setReference('');
      setNote('');
      flushEmailOutbox();
      const [{ data: paymentsData }] = await Promise.all([
        supabase.from('invoice_payments').select('id, amount, payment_reference, paid_on, status').eq('invoice_id', selected).order('created_at', { ascending: false }),
      ]);
      setPayments((paymentsData ?? []).map((item) => ({ id: item.id, amount: Number(item.amount), reference: item.payment_reference, paidOn: item.paid_on, status: item.status })));
    }
  }

  const columns: Column<Row>[] = [
    { key: 'reference', header: 'Reference' },
    { key: 'period', header: 'Period' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button className="table-link" type="button" onClick={() => setSelected(row.id)}>
          {row.status === 'paid' ? 'View' : 'View & pay'}
        </button>
      ),
    },
  ];

  const selectedRow = rows.find((row) => row.id === selected);

  return (
    <section>
      <PageHeader eyebrow="Billing" title="Invoices" description="Monthly workforce service invoices for your establishments - salary charges plus the EnigteeWorld platform fee, itemised." />
      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="stat-grid">
        <StatCard label="Outstanding" value={loading ? '—' : formatCurrency(rows.filter((row) => row.status !== 'paid').reduce((total, row) => total + row.amount, 0))} hint="Awaiting payment" />
        <StatCard label="Paid" value={loading ? '—' : formatCurrency(rows.filter((row) => row.status === 'paid').reduce((total, row) => total + row.amount, 0))} hint="Settled invoices" />
        <StatCard label="Invoices" value={loading ? '—' : rows.length} hint="All time" />
      </div>

      <div className="content-card" style={{ marginBottom: 20 }}>
        {loading ? <p className="muted">Loading invoices...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No invoices yet" emptyDescription="Invoices will appear when EnigteeWorld issues them." />
        )}
      </div>

      {selectedRow ? (
        <div className="dashboard-grid">
          <div className="content-card">
            <h2>{selectedRow.reference}</h2>
            <p className="hint">{selectedRow.period}{selectedRow.dueDate ? ` · due ${selectedRow.dueDate}` : ''}</p>
            {items.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.description}</strong>
                  <p>{item.kind === 'platform_fee' ? 'EnigteeWorld platform fee' : item.kind === 'salary' ? 'Salary charge' : 'Adjustment'}</p>
                </div>
                <span className="muted small">{formatCurrency(item.amount)}</span>
              </div>
            ))}
            <div className="list-row">
              <strong>Total</strong>
              <span className="muted small" style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--ink)' }}>{formatCurrency(selectedRow.amount)}</span>
            </div>

            {payments.length > 0 ? (
              <>
                <h2 className="section-gap">Payments submitted</h2>
                {payments.map((payment) => (
                  <div className="list-row" key={payment.id}>
                    <div>
                      <strong>{formatCurrency(payment.amount)} - ref {payment.reference}</strong>
                      <p>Paid on {payment.paidOn}</p>
                    </div>
                    <StatusBadge status={payment.status} />
                  </div>
                ))}
              </>
            ) : null}
          </div>

          {selectedRow.status !== 'paid' ? (
            <div className="content-card">
              <h2><Send size={19} style={{ verticalAlign: '-3px' }} /> Submit a payment</h2>
              <p className="hint">Tell us what you paid and we'll confirm it against our records - this does not mark the invoice paid by itself.</p>
              <form className="form" onSubmit={handleSubmitPayment}>
                <label>
                  Amount paid (NGN)
                  <input type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} required />
                </label>
                <label>
                  Payment reference
                  <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank transfer reference or receipt no." required />
                </label>
                <label>
                  Date paid
                  <input type="date" value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setPaidOn(event.target.value)} required />
                </label>
                <label>
                  Note (optional)
                  <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={15} />} Submit payment
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
