export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneByStatus: Record<string, StatusTone> = {
  // application pipeline
  submitted: 'info',
  under_review: 'info',
  screening: 'info',
  shortlisted: 'info',
  interview: 'info',
  interview_invited: 'warning',
  interview_scheduled: 'warning',
  interview_completed: 'info',
  invited: 'warning',
  scheduled: 'warning',
  rescheduled: 'warning',
  successful: 'success',
  selected: 'success',
  onboarding: 'warning',
  pending_start: 'warning',
  employed: 'success',
  offer: 'success',
  deployed: 'success',
  active: 'success',
  published: 'success',
  paid: 'success',
  present: 'success',
  verified: 'success',
  completed: 'success',
  sent: 'success',
  // waiting states
  pending: 'warning',
  processing: 'warning',
  probation: 'warning',
  late: 'warning',
  on_hold: 'warning',
  on_leave: 'warning',
  draft: 'neutral',
  sending: 'warning',
  // negative states
  unsuccessful: 'danger',
  rejected: 'danger',
  absent: 'danger',
  suspended: 'danger',
  terminated: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  withdrawn: 'neutral',
  closed: 'neutral',
};

export interface StatusBadgeProps {
  status: string;
  tone?: StatusTone;
}

export function StatusBadge({ status, tone }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const resolved = tone ?? toneByStatus[key] ?? 'neutral';
  const spaced = status.replace(/_/g, ' ');
  const label = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return <span className={`status-badge status-${resolved}`}>{label}</span>;
}

export default StatusBadge;
