import { supabase } from './supabase';
import { errorMessage } from './errors';

export type AttendancePoint = {
  id: string;
  establishment_id: string;
  employer_id: string;
  name: string;
  qr_token: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type AttendanceEvent = {
  id: string;
  deployment_id: string;
  employee_id: string;
  establishment_id: string;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  source: string;
  confirmation_status: string;
  reason: string | null;
  notes: string | null;
  attendance_point_id: string | null;
};

/** Builds the URL a QR image should encode: opening it lands the employee on a pre-filled check-in. */
export function attendanceScanUrl(token: string) {
  return `${window.location.origin}/employee/attendance?code=${token}`;
}

export async function createAttendancePoint(establishmentId: string, name: string) {
  const { data, error } = await supabase.rpc('create_attendance_point', {
    p_establishment_id: establishmentId,
    p_name: name,
  });
  return { data: data as AttendancePoint | null, error: error ? errorMessage(error, 'Unable to create attendance point.') : null };
}

export async function setAttendancePointStatus(pointId: string, isActive: boolean) {
  const { error } = await supabase.rpc('set_attendance_point_status', { p_point_id: pointId, p_is_active: isActive });
  return { error: error ? errorMessage(error) : null };
}

export async function regenerateAttendancePoint(pointId: string) {
  const { data, error } = await supabase.rpc('regenerate_attendance_point', { p_point_id: pointId });
  return { data: data as AttendancePoint | null, error: error ? errorMessage(error) : null };
}

export async function scanAttendance(token: string) {
  const { data, error } = await supabase.rpc('employee_attendance_scan', { p_token: token.trim().toUpperCase() });
  return { data: data as AttendanceEvent | null, error: error ? errorMessage(error, 'Unable to record your attendance.') : null };
}

export async function checkoutAttendance(token: string) {
  const { data, error } = await supabase.rpc('employee_attendance_checkout', { p_token: token.trim().toUpperCase() });
  return { data: data as AttendanceEvent | null, error: error ? errorMessage(error, 'Unable to check you out.') : null };
}

export async function reviewAttendance(eventId: string, action: 'confirm' | 'reject', status?: string, notes?: string) {
  const { data, error } = await supabase.rpc('review_attendance', {
    p_event_id: eventId,
    p_action: action,
    p_status: status ?? null,
    p_notes: notes ?? null,
  });
  return { data: data as AttendanceEvent | null, error: error ? errorMessage(error) : null };
}

export async function employerManualCheckin(input: {
  deploymentId: string;
  workDate: string;
  checkInAt: string;
  checkOutAt?: string | null;
  reason: string;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc('employer_manual_checkin', {
    p_deployment_id: input.deploymentId,
    p_work_date: input.workDate,
    p_check_in_at: input.checkInAt,
    p_check_out_at: input.checkOutAt ?? null,
    p_reason: input.reason,
    p_notes: input.notes ?? null,
  });
  return { data: data as AttendanceEvent | null, error: error ? errorMessage(error, 'Unable to record attendance.') : null };
}

// ---------------------------------------------------------------------------
// Work schedules - employer or admin sets it; employee (and both) can view it.
// ---------------------------------------------------------------------------
export type EmploymentSchedule = {
  id: string;
  deployment_id: string;
  schedule_type: string;
  working_days: number[];
  expected_hours: number;
  shift_start: string | null;
  shift_end: string | null;
  overnight: boolean;
  grace_minutes: number;
  timezone: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Turns [1,2,3,4,5] into "Mon–Fri", or a comma list when the days aren't a clean run. */
export function describeWorkingDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return 'No working days set';
  if (sorted.length === 7) return 'Every day';

  let isRun = true;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isRun = false;
      break;
    }
  }
  if (isRun && sorted.length > 1) {
    return `${DAY_LABELS[sorted[0]]}\u2013${DAY_LABELS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((day) => DAY_LABELS[day]).join(', ');
}

export function describeSchedule(schedule: EmploymentSchedule | null): string {
  if (!schedule) return 'No approved schedule set yet';
  const days = describeWorkingDays(schedule.working_days);
  const time =
    schedule.shift_start && schedule.shift_end
      ? `, ${schedule.shift_start.slice(0, 5)}\u2013${schedule.shift_end.slice(0, 5)}`
      : '';
  return `${days}${time}${schedule.overnight ? ' (overnight)' : ''}`;
}

export async function getCurrentSchedule(deploymentId: string) {
  const { data, error } = await supabase
    .from('employment_schedules')
    .select('*')
    .eq('deployment_id', deploymentId)
    .is('effective_to', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as EmploymentSchedule | null, error: error ? errorMessage(error) : null };
}

export async function setEmploymentSchedule(input: {
  deploymentId: string;
  scheduleType: string;
  workingDays: number[];
  expectedHours: number;
  shiftStart: string | null;
  shiftEnd: string | null;
  overnight: boolean;
  graceMinutes: number;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc('set_employment_schedule', {
    p_deployment_id: input.deploymentId,
    p_schedule_type: input.scheduleType,
    p_working_days: input.workingDays,
    p_expected_hours: input.expectedHours,
    p_shift_start: input.shiftStart,
    p_shift_end: input.shiftEnd,
    p_overnight: input.overnight,
    p_grace_minutes: input.graceMinutes,
    p_notes: input.notes ?? null,
  });
  return { data: data as EmploymentSchedule | null, error: error ? errorMessage(error, 'Unable to save the work schedule.') : null };
}
