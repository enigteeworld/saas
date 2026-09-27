import { supabase } from './supabase';
import { errorMessage } from './errors';

export async function runPayroll(periodStart: string, periodEnd: string, employerId?: string | null) {
  try {
    const { data, error } = await supabase.rpc('admin_run_payroll', {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_employer_id: employerId ?? null,
    });
    return { data, error: error ? errorMessage(error, 'Unable to run payroll.') : null };
  } catch (err) {
    console.error('Payroll RPC transport error:', err);
    return { data: null, error: errorMessage(err, 'EnigteeWorld could not connect to Supabase while running payroll. Check the connection and try again.') };
  }
}

export async function approvePayroll(runId: string) {
  const { data, error } = await supabase.rpc('admin_approve_payroll', { p_run_id: runId });
  return { data, error: error ? errorMessage(error, 'Unable to approve payroll.') : null };
}

export async function proposeAdjustment(input: { deploymentId: string; category: string; amount: number; reason: string }) {
  const { data, error } = await supabase.rpc('propose_payroll_adjustment', {
    p_deployment_id: input.deploymentId,
    p_category: input.category,
    p_amount: input.amount,
    p_reason: input.reason,
  });
  return { data, error: error ? errorMessage(error, 'Unable to submit adjustment.') : null };
}

export async function reviewAdjustment(adjustmentId: string, action: 'approve' | 'reject') {
  const { data, error } = await supabase.rpc('review_payroll_adjustment', { p_adjustment_id: adjustmentId, p_action: action });
  return { data, error: error ? errorMessage(error) : null };
}

export async function markPayrollPaid(runId: string) {
  const { data, error } = await supabase.rpc('admin_mark_payroll_paid', { p_run_id: runId });
  return { data, error: error ? errorMessage(error, 'Unable to mark payroll as paid.') : null };
}
