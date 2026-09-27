import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Send } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { employerDisputeInvoice, refreshInvoiceOverdueStatuses, submitPayment } from '@/lib/invoices';
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
  credited: number;
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<{ bank_name: string; account_number: string; account_name: string; instructions: string | null } | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [creditNotes, setCreditNotes] = useState<Array<{ id: string; credit_note_number: string; amount: number; reason: string; status: string }>>([]);

  useEffect(() => {
    async function loadPayoutAccount() {
      const { data } = await supabase
        .from('company_payout_settings')
        .select('bank_name, account_number, account_name, instructions')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPayoutAccount(data ?? null);
    }
    void loadPayoutAccount();
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    await refreshInvoiceOverdueStatuses();
    setError('');
    const { data, error: queryError } = await supabase
      .from('invoices')
      .select('id, invoice_number, period_start, period_end, total, credited_amount, status, due_date')
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
          credited: Number(item.credited_amount ?? 0),
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
      const [itemsRes, paymentsRes, creditsRes] = await Promise.all([
        supabase.from('invoice_items').select('id, description, kind, total_amount').eq('invoice_id', selected).order('kind'),
        supabase.from('invoice_payments').select('id, amount, payment_reference, paid_on, status').eq('invoice_id', selected).order('created_at', { ascending: false }),
        supabase.from('invoice_credit_notes').select('id, credit_note_number, amount, reason, status').eq('invoice_id', selected).order('created_at', { ascending: false }),
      ]);
      setItems((itemsRes.data ?? []).map((item) => ({ id: item.id, description: item.description, kind: item.kind, amount: Number(item.total_amount) })));
      setCreditNotes((creditsRes.data ?? []).map((item) => ({ id: item.id, credit_note_number: item.credit_note_number, amount: Number(item.amount), reason: item.reason, status: item.status })));
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
    const { error: submitError } = await submitPayment({
      invoiceId: selected,
      amount: numericAmount,
      reference,
      paidOn,
      note,
      receiptFile,
      userId: user?.id,
    });
    setBusy(false);
    if (submitError) setError(submitError);
    else {
      setNotice('Payment submitted. Admin will confirm it once verified, and the invoice will update automatically.');
      setAmount('');
      setReference('');
      setNote('');
      setReceiptFile(null);
      flushEmailOutbox();
      const [{ data: paymentsData }] = await Promise.all([
        supabase.from('invoice_payments').select('id, amount, payment_reference, paid_on, status').eq('invoice_id', selected).order('created_at', { ascending: false }),
      ]);
      setPayments((paymentsData ?? []).map((item) => ({ id: item.id, amount: Number(item.amount), reference: item.payment_reference, paidOn: item.paid_on, status: item.status })));
    }
  }

  async function handleDispute(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!disputeReason.trim()) {
      setError('Enter a reason for the dispute.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: disputeError } = await employerDisputeInvoice(selected, disputeReason, disputeDetails);
    setBusy(false);
    if (disputeError) setError(disputeError);
    else {
      setNotice('Invoice dispute submitted. EnigteeWorld Admin will review it.');
      setDisputeReason('');
      setDisputeDetails('');
      await load();
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
          {row.status === 'paid' || row.status === 'credited' ? 'View' : 'View & pay'}
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
        <StatCard label="Outstanding" value={loading ? '—' : formatCurrency(rows.filter((row) => !['paid','credited'].includes(row.status)).reduce((total, row) => total + Math.max(row.amount - row.credited, 0), 0))} hint="Awaiting payment" />
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
              <strong>Original total</strong>
              <span className="muted small" style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--ink)' }}>{formatCurrency(selectedRow.amount)}</span>
            </div>

            {creditNotes.length > 0 ? (
              <div className="section-gap">
                <h2>Credit notes</h2>
                {creditNotes.map((note) => (
                  <div className="list-row" key={note.id}>
                    <div><strong>{note.credit_note_number}</strong><p>{note.reason}</p></div>
                    <span className="muted small">-{formatCurrency(note.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}

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

          {!['paid','credited','disputed'].includes(selectedRow.status) ? (
            <div className="content-card">
              {payoutAccount ? (
                <div className="notice-card" style={{ marginBottom: 18 }}>
                  <h3><Landmark size={16} style={{ verticalAlign: '-2px' }} /> Pay into this account</h3>
                  <p>
                    <strong>{payoutAccount.bank_name}</strong> · {payoutAccount.account_number} · {payoutAccount.account_name}
                  </p>
                  {payoutAccount.instructions ? <p>{payoutAccount.instructions}</p> : null}
                </div>
              ) : null}

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
                <label>
                  Receipt (optional, but helps admin confirm faster)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={15} />} Submit payment
                </button>
              </form>

              <div className="section-gap invoice-dispute-card">
                <h2><AlertTriangle size={18} style={{ verticalAlign: '-3px' }} /> Need a correction?</h2>
                <p className="hint">If the issued invoice contains an error, dispute it here. Admin can review it and issue a credit note where appropriate.</p>
                <form className="form" onSubmit={handleDispute}>
                  <label>
                    Reason
                    <input value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="e.g. Employee left before period end" required />
                  </label>
                  <label>
                    Details (optional)
                    <textarea rows={3} value={disputeDetails} onChange={(event) => setDisputeDetails(event.target.value)} placeholder="Explain what needs to be corrected." />
                  </label>
                  <button className="btn btn-secondary" type="submit" disabled={busy}>
                    {busy ? <Loader2 size={15} className="spin" /> : <AlertTriangle size={15} />} Submit dispute
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
