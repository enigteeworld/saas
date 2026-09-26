import { supabase } from './supabase';
import { errorMessage } from './errors';

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

export async function submitPayment(input: { invoiceId: string; amount: number; reference: string; paidOn: string; note?: string }) {
  const { data, error } = await supabase.rpc('submit_invoice_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_reference: input.reference,
    p_paid_on: input.paidOn,
    p_note: input.note ?? null,
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
