import { supabase } from './supabase';
import { errorMessage } from './errors';
import { uploadReceipt } from './storage';

export async function generateInvoice(runId: string, employerId: string, dueDate?: string | null) {
  const { data, error } = await supabase.rpc('admin_generate_invoice', {
    p_run_id: runId,
    p_employer_id: employerId,
    p_due_date: dueDate ?? null,
  });
  return { data, error: error ? errorMessage(error, 'Unable to generate invoice.') : null };
}

export async function issueInvoice(invoiceId: string) {
  const { data, error } = await supabase.rpc('admin_issue_invoice', { p_invoice_id: invoiceId });
  return { data, error: error ? errorMessage(error, 'Unable to issue invoice.') : null };
}

export async function submitPayment(input: {
  invoiceId: string;
  amount: number;
  reference: string;
  paidOn: string;
  note?: string;
  receiptFile?: File | null;
  userId?: string;
}) {
  let receiptPath: string | null = null;

  if (input.receiptFile && input.userId) {
    const { path, error: uploadError } = await uploadReceipt(input.userId, input.receiptFile);
    if (uploadError) return { data: null, error: errorMessage(uploadError, 'Unable to upload the receipt.') };
    receiptPath = path;
  }

  const { data, error } = await supabase.rpc('submit_invoice_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_reference: input.reference,
    p_paid_on: input.paidOn,
    p_note: input.note ?? null,
    p_receipt_path: receiptPath,
  });
  return { data, error: error ? errorMessage(error, 'Unable to submit payment.') : null };
}

export async function confirmPayment(paymentId: string, action: 'confirm' | 'reject') {
  const { data, error } = await supabase.rpc('admin_confirm_payment', { p_payment_id: paymentId, p_action: action });
  return { data, error: error ? errorMessage(error) : null };
}

export async function setPlatformFee(defaultFee: number, isEnabled: boolean, effectiveFrom?: string) {
  const { data, error } = await supabase.rpc('admin_set_platform_fee', {
    p_default_fee: defaultFee,
    p_is_enabled: isEnabled,
    p_effective_from: effectiveFrom ?? null,
  });
  return { data, error: error ? errorMessage(error, 'Unable to update the platform fee.') : null };
}

export async function refreshInvoiceOverdueStatuses() {
  const { data, error } = await supabase.rpc('refresh_invoice_overdue_statuses');
  return { data, error: error ? errorMessage(error, 'Unable to refresh invoice statuses.') : null };
}

export async function employerDisputeInvoice(invoiceId: string, reason: string, details?: string) {
  const { data, error } = await supabase.rpc('employer_dispute_invoice', {
    p_invoice_id: invoiceId,
    p_reason: reason,
    p_details: details?.trim() || null,
  });
  return { data, error: error ? errorMessage(error, 'Unable to submit the invoice dispute.') : null };
}

export async function adminIssueCreditNote(invoiceId: string, amount: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_issue_credit_note', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_reason: reason,
  });
  return { data, error: error ? errorMessage(error, 'Unable to issue the credit note.') : null };
}

export async function adminResolveInvoiceDispute(disputeId: string, action: 'resolve' | 'reject', note?: string) {
  const { data, error } = await supabase.rpc('admin_resolve_invoice_dispute', {
    p_dispute_id: disputeId,
    p_action: action,
    p_resolution_note: note?.trim() || null,
  });
  return { data, error: error ? errorMessage(error, 'Unable to update the invoice dispute.') : null };
}
