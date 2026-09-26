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

export async function reviewAttendance(eventId: string, action: 'confirm' | 'reject', status = 'present', notes?: string) {
  const { data, error } = await supabase.rpc('review_attendance', {
    p_event_id: eventId,
    p_action: action,
    p_status: status,
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
