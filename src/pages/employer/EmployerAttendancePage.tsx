import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Loader2, Plus, QrCode as QrCodeIcon, RefreshCw, UserPlus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { attendanceScanUrl, createAttendancePoint, employerManualCheckin, regenerateAttendancePoint, reviewAttendance, setAttendancePointStatus, type AttendancePoint } from '@/lib/attendance';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type PendingRow = {
  id: string;
  name: string;
  establishment: string;
  date: string;
  checkIn: string;
  checkOut: string;
  method: string;
};

type HistoryRow = PendingRow & { status: string; confirmation: string };

type Establishment = { id: string; name: string };
type DeployedEmployee = { deployment_id: string; employee_id: string; full_name: string; establishment_id: string; establishment_name: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function EmployerAttendancePage() {
  const user = useAuthStore((state) => state.user);
  const [employerId, setEmployerId] = useState<string | null>(null);
  const [points, setPoints] = useState<(AttendancePoint & { establishment_name: string; qrImage?: string })[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [employees, setEmployees] = useState<DeployedEmployee[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // new attendance point form
  const [newPointEstablishment, setNewPointEstablishment] = useState('');
  const [newPointName, setNewPointName] = useState('Main entrance');

  // manual check-in form
  const [mDeployment, setMDeployment] = useState('');
  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mTime, setMTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [mReason, setMReason] = useState('Employee unable to scan');
  const [mNotes, setMNotes] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError('');

    const { data: employer, error: employerError } = await supabase.from('employer_profiles').select('id').eq('user_id', user.id).single();
    if (employerError) {
      setError(errorMessage(employerError));
      setLoading(false);
      return;
    }
    setEmployerId(employer.id);

    const [estRes, pointRes, deployedRes] = await Promise.all([
      supabase.from('establishments').select('id, name').eq('employer_id', employer.id).eq('is_active', true).order('name'),
      supabase.from('attendance_points').select('id, establishment_id, employer_id, name, qr_token, is_active, expires_at, created_at, establishments:establishment_id (name)').eq('employer_id', employer.id).order('created_at', { ascending: false }),
      supabase
        .from('deployments')
        .select('id, employee_id, establishment_id, profiles:employee_id (full_name), establishments:establishment_id (name)')
        .eq('employer_id', employer.id)
        .in('status', ['active', 'pending_start', 'onboarding']),
    ]);

    if (estRes.error) {
      setError(errorMessage(estRes.error, 'Unable to load your establishments.'));
      setLoading(false);
      return;
    }

    setEstablishments((estRes.data ?? []) as Establishment[]);

    // Use the establishments already loaded for this employer. The previous
    // implementation performed a second, nested establishments query inside
    // Promise.all; if that query returned no IDs, the attendance query became
    // .in('establishment_id', []) and silently returned no pending requests.
    const establishmentIds = (estRes.data ?? []).map((item) => item.id);

    const attendanceRes = establishmentIds.length > 0
      ? await supabase
          .from('attendance_events')
          .select('id, attendance_date, check_in_at, check_out_at, status, source, confirmation_status, profiles:employee_id (full_name), establishments:establishment_id (name)')
          .in('establishment_id', establishmentIds)
          .order('attendance_date', { ascending: false })
          .order('check_in_at', { ascending: false })
          .limit(200)
      : { data: [], error: null };

    if (attendanceRes.error) {
      setError(errorMessage(attendanceRes.error, 'Unable to load attendance requests.'));
      setLoading(false);
      return;
    }
    setEmployees(
      (deployedRes.data ?? []).map((item) => ({
        deployment_id: item.id,
        employee_id: item.employee_id,
        full_name: one(item.profiles)?.full_name ?? 'Employee',
        establishment_id: item.establishment_id,
        establishment_name: one(item.establishments)?.name ?? '—',
      })),
    );

    const pointList = (pointRes.data ?? []).map((item) => ({
      ...(item as unknown as AttendancePoint),
      establishment_name: one(item.establishments as { name: string } | { name: string }[] | null)?.name ?? '—',
    }));
    const withQr = await Promise.all(
      pointList.map(async (point) => ({ ...point, qrImage: await QRCode.toDataURL(attendanceScanUrl(point.qr_token), { margin: 1, width: 220 }) })),
    );
    setPoints(withQr);

    const rows = (attendanceRes.data ?? []).map((item) => ({
      id: item.id,
      name: one(item.profiles)?.full_name ?? 'Employee',
      establishment: one(item.establishments)?.name ?? '—',
      date: new Date(item.attendance_date).toLocaleDateString('en-NG'),
      checkIn: item.check_in_at ? new Date(item.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
      checkOut: item.check_out_at ? new Date(item.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
      method: item.source === 'qr' ? 'QR scan' : item.source === 'employer_manual' ? 'Manual' : 'Admin',
      status: item.status,
      confirmation: item.confirmation_status,
    }));
    setPending(rows.filter((row) => row.confirmation === 'pending_confirmation'));
    setHistory(rows.filter((row) => row.confirmation !== 'pending_confirmation'));

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function done(message: string) {
    setNotice(message);
    flushEmailOutbox();
    void load();
  }

  async function addPoint(event: FormEvent) {
    event.preventDefault();
    if (!newPointEstablishment) return setError('Choose an establishment for this attendance point.');
    setBusy('add-point');
    setError('');
    const { error: createError } = await createAttendancePoint(newPointEstablishment, newPointName);
    setBusy(null);
    if (createError) setError(createError);
    else {
      setNewPointName('Main entrance');
      done('Attendance point created. Display its QR code at the entrance for employees to scan.');
    }
  }

  async function togglePoint(point: AttendancePoint) {
    setBusy(point.id);
    const { error: toggleError } = await setAttendancePointStatus(point.id, !point.is_active);
    setBusy(null);
    if (toggleError) setError(toggleError);
    else done(point.is_active ? 'Attendance point deactivated.' : 'Attendance point activated.');
  }

  async function regenerate(point: AttendancePoint) {
    setBusy(`regen-${point.id}`);
    const { error: regenError } = await regenerateAttendancePoint(point.id);
    setBusy(null);
    if (regenError) setError(regenError);
    else done('A new code was generated - the old QR image and code no longer work.');
  }

  async function review(id: string, action: 'confirm' | 'reject') {
    setBusy(`${id}-${action}`);
    const { error: reviewError } = await reviewAttendance(id, action);
    setBusy(null);
    if (reviewError) setError(reviewError);
    else done(action === 'confirm' ? 'Attendance confirmed.' : 'Attendance rejected.');
  }

  async function manualCheckin(event: FormEvent) {
    event.preventDefault();
    if (!mDeployment) return setError('Select the employee.');
    setBusy('manual');
    setError('');
    const { error: manualError } = await employerManualCheckin({
      deploymentId: mDeployment,
      workDate: mDate,
      checkInAt: new Date(`${mDate}T${mTime}`).toISOString(),
      reason: mReason,
      notes: mNotes,
    });
    setBusy(null);
    if (manualError) setError(manualError);
    else {
      setMReason('Employee unable to scan');
      setMNotes('');
      done('Manual attendance recorded and confirmed.');
    }
  }

  const pendingColumns: Column<PendingRow>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'method', header: 'Method' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void review(row.id, 'confirm')}>
            Confirm
          </button>
          <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void review(row.id, 'reject')}>
            Reject
          </button>
        </div>
      ),
    },
  ];

  const historyColumns: Column<HistoryRow>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'method', header: 'Method' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'confirmation', header: '', render: (row) => <StatusBadge status={row.confirmation} /> },
  ];

  return (
    <section>
      <PageHeader eyebrow="Attendance" title="Workforce attendance" description="Manage QR attendance points, confirm check-ins, and record manual attendance." />
      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="stat-grid">
        <StatCard label="Attendance points" value={loading ? '—' : points.length} hint="Across establishments" />
        <StatCard label="Awaiting confirmation" value={loading ? '—' : pending.length} hint="Needs review" />
        <StatCard label="Confirmed present today" value={loading ? '—' : history.filter((row) => row.date === new Date().toLocaleDateString('en-NG') && row.status === 'present').length} hint="Today" />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <div className="card-heading">
            <h2><QrCodeIcon size={19} style={{ verticalAlign: '-3px' }} /> Attendance points</h2>
          </div>
          <p className="hint">Print or display the QR code at each entrance. Employees scan it with their phone camera to check in and out.</p>

          {employerId ? (
            <form className="form" onSubmit={addPoint} style={{ marginBottom: 6 }}>
              <div className="row-2">
                <label>
                  Establishment
                  <select value={newPointEstablishment} onChange={(event) => setNewPointEstablishment(event.target.value)}>
                    <option value="">Select establishment</option>
                    {establishments.map((item) => (
                      <option value={item.id} key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Point name
                  <input value={newPointName} onChange={(event) => setNewPointName(event.target.value)} placeholder="Main entrance" />
                </label>
              </div>
              <button className="btn btn-secondary btn-sm" type="submit" disabled={busy === 'add-point'} style={{ width: 'fit-content' }}>
                {busy === 'add-point' ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add attendance point
              </button>
            </form>
          ) : null}

          {loading ? (
            <p className="muted">Loading...</p>
          ) : points.length === 0 ? (
            <EmptyState icon={QrCodeIcon} title="No attendance points yet" description="Add one above for each entrance employees check in at." />
          ) : (
            points.map((point) => (
              <div className="list-row" key={point.id} style={{ alignItems: 'flex-start' }}>
                {point.qrImage ? <img src={point.qrImage} alt={`QR code for ${point.name}`} width={72} height={72} style={{ borderRadius: 8, border: '1px solid var(--line)' }} /> : null}
                <div>
                  <strong>{point.name}</strong>
                  <p>{point.establishment_name} · code {point.qr_token}</p>
                  <span className={`status-badge ${point.is_active ? 'status-success' : 'status-neutral'}`}>{point.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="inline-actions">
                  <button className="btn btn-secondary btn-sm" type="button" disabled={busy === point.id} onClick={() => void togglePoint(point)}>
                    {point.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={busy === `regen-${point.id}`} onClick={() => void regenerate(point)}>
                    <RefreshCw size={13} /> New code
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="content-card">
          <h2><UserPlus size={19} style={{ verticalAlign: '-3px' }} /> Manual check-in</h2>
          <p className="hint">Use this when an employee cannot scan (phone, battery, network). Recorded and confirmed immediately, fully audited.</p>
          <form className="form" onSubmit={manualCheckin}>
            <label>
              Employee
              <select value={mDeployment} onChange={(event) => setMDeployment(event.target.value)} required>
                <option value="">Select employee</option>
                {employees.map((item) => (
                  <option value={item.deployment_id} key={item.deployment_id}>{item.full_name} - {item.establishment_name}</option>
                ))}
              </select>
            </label>
            <div className="row-2">
              <label>
                Date
                <input type="date" value={mDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setMDate(event.target.value)} required />
              </label>
              <label>
                Time
                <input type="time" value={mTime} onChange={(event) => setMTime(event.target.value)} required />
              </label>
            </div>
            <label>
              Reason
              <input value={mReason} onChange={(event) => setMReason(event.target.value)} required />
            </label>
            <label>
              Notes (optional)
              <textarea rows={2} value={mNotes} onChange={(event) => setMNotes(event.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy === 'manual'}>
              {busy === 'manual' ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Record attendance
            </button>
          </form>
        </div>
      </div>

      <div className="content-card section-gap">
        <h2>Awaiting your confirmation</h2>
        {loading ? <p className="muted">Loading...</p> : (
          <DataTable columns={pendingColumns} rows={pending} emptyTitle="Nothing pending" emptyDescription="QR check-ins appear here for you to confirm or reject." />
        )}
      </div>

      <div className="content-card section-gap">
        <h2>Attendance history</h2>
        {loading ? <p className="muted">Loading...</p> : (
          <DataTable columns={historyColumns} rows={history} emptyTitle="No attendance yet" emptyDescription="Confirmed and rejected records appear here." />
        )}
      </div>
    </section>
  );
}
