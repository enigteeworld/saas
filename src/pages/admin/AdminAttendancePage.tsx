import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Loader2, Plus, QrCode as QrCodeIcon, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { attendanceScanUrl, createAttendancePoint, regenerateAttendancePoint, reviewAttendance, setAttendancePointStatus, type AttendancePoint } from '@/lib/attendance';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';

type Row = {
  id: string;
  name: string;
  establishment: string;
  employer: string;
  date: string;
  checkIn: string;
  checkOut: string;
  method: string;
  status: string;
  confirmation: string;
};

type EstablishmentOption = { id: string; name: string; employer: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export default function AdminAttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [points, setPoints] = useState<(AttendancePoint & { establishment_name: string; employer_name: string; qrImage?: string })[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPoints, setShowPoints] = useState(false);
  const [newPointEstablishment, setNewPointEstablishment] = useState('');
  const [newPointName, setNewPointName] = useState('Main entrance');

  const load = useCallback(async () => {
    setError('');
    const [attendanceRes, pointRes, estRes] = await Promise.all([
      supabase
        .from('attendance_events')
        .select('id, attendance_date, check_in_at, check_out_at, status, source, confirmation_status, profiles:employee_id (full_name), establishments:establishment_id (name, employer_profiles:employer_id (business_name))')
        .order('attendance_date', { ascending: false })
        .order('check_in_at', { ascending: false })
        .limit(300),
      supabase
        .from('attendance_points')
        .select('id, establishment_id, employer_id, name, qr_token, is_active, expires_at, created_at, establishments:establishment_id (name, employer_profiles:employer_id (business_name))')
        .order('created_at', { ascending: false }),
      supabase.from('establishments').select('id, name, employer_profiles:employer_id (business_name)').eq('is_active', true).order('name'),
    ]);

    if (attendanceRes.error) setError(errorMessage(attendanceRes.error));
    else {
      setRows(
        (attendanceRes.data ?? []).map((item) => {
          const est = one(item.establishments as { name: string; employer_profiles: { business_name: string } | { business_name: string }[] | null } | { name: string; employer_profiles: { business_name: string } | { business_name: string }[] | null }[] | null);
          return {
            id: item.id,
            name: one(item.profiles)?.full_name ?? 'Employee',
            establishment: est?.name ?? '—',
            employer: one(est?.employer_profiles)?.business_name ?? '—',
            date: new Date(item.attendance_date).toLocaleDateString('en-NG'),
            checkIn: item.check_in_at ? new Date(item.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
            checkOut: item.check_out_at ? new Date(item.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
            method: item.source === 'qr' ? 'QR scan' : item.source === 'employer_manual' ? 'Employer manual' : 'Admin manual',
            status: item.status,
            confirmation: item.confirmation_status,
          };
        }),
      );
    }

    setEstablishments(
      (estRes.data ?? []).map((item) => ({ id: item.id, name: item.name, employer: one(item.employer_profiles)?.business_name ?? '—' })),
    );

    const pointList = (pointRes.data ?? []).map((item) => {
      const est = one(item.establishments as { name: string; employer_profiles: { business_name: string } | { business_name: string }[] | null } | { name: string; employer_profiles: { business_name: string } | { business_name: string }[] | null }[] | null);
      return {
        ...(item as unknown as AttendancePoint),
        establishment_name: est?.name ?? '—',
        employer_name: one(est?.employer_profiles)?.business_name ?? '—',
      };
    });
    const withQr = await Promise.all(
      pointList.map(async (point) => ({ ...point, qrImage: await QRCode.toDataURL(attendanceScanUrl(point.qr_token), { margin: 1, width: 200 }) })),
    );
    setPoints(withQr);
    setLoading(false);
  }, []);

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
    if (!newPointEstablishment) return setError('Choose an establishment.');
    setBusy('add-point');
    const { error: createError } = await createAttendancePoint(newPointEstablishment, newPointName);
    setBusy(null);
    if (createError) setError(createError);
    else {
      setNewPointName('Main entrance');
      done('Attendance point created.');
    }
  }

  async function togglePoint(point: AttendancePoint) {
    setBusy(point.id);
    const { error: toggleError } = await setAttendancePointStatus(point.id, !point.is_active);
    setBusy(null);
    if (toggleError) setError(toggleError);
    else done(point.is_active ? 'Deactivated.' : 'Activated.');
  }

  async function regenerate(point: AttendancePoint) {
    setBusy(`regen-${point.id}`);
    const { error: regenError } = await regenerateAttendancePoint(point.id);
    setBusy(null);
    if (regenError) setError(regenError);
    else done('New code generated.');
  }

  async function review(id: string, action: 'confirm' | 'reject') {
    setBusy(`${id}-${action}`);
    const { error: reviewError } = await reviewAttendance(id, action);
    setBusy(null);
    if (reviewError) setError(reviewError);
    else done(action === 'confirm' ? 'Attendance confirmed.' : 'Attendance rejected.');
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Employee' },
    { key: 'establishment', header: 'Establishment' },
    { key: 'employer', header: 'Employer' },
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'method', header: 'Method' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'confirmation',
      header: 'Confirmation',
      render: (row) =>
        row.confirmation === 'pending_confirmation' ? (
          <div className="inline-actions">
            <button className="btn btn-primary btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void review(row.id, 'confirm')}>
              Confirm
            </button>
            <button className="btn btn-danger btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void review(row.id, 'reject')}>
              Reject
            </button>
          </div>
        ) : (
          <StatusBadge status={row.confirmation} />
        ),
    },
  ];

  const today = new Date().toLocaleDateString('en-NG');
  const todayRows = rows.filter((row) => row.date === today);

  return (
    <section>
      <PageHeader eyebrow="Operations" title="Attendance" description="Attendance points and check-ins across every employer, captured through QR check-in." actions={
        <>
          <Link className="btn btn-secondary" to="/admin/payroll">View payroll</Link>
          <button className="btn btn-secondary" type="button" onClick={() => setShowPoints((value) => !value)}>
            {showPoints ? 'Hide attendance points' : 'Manage attendance points'}
          </button>
        </>
      } />
      {error ? <div className="error-message">{error}</div> : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="stat-grid">
        <StatCard label="Present today" value={loading ? '—' : todayRows.filter((row) => row.status === 'present').length} hint="Confirmed" />
        <StatCard label="Pending confirmation" value={loading ? '—' : rows.filter((row) => row.confirmation === 'pending_confirmation').length} hint="Needs employer review" />
        <StatCard label="Attendance points" value={loading ? '—' : points.length} hint="Across all employers" />
      </div>

      {showPoints ? (
        <div className="content-card" style={{ marginBottom: 20 }}>
          <h2><QrCodeIcon size={19} style={{ verticalAlign: '-3px' }} /> Attendance points</h2>
          <form className="form" onSubmit={addPoint}>
            <div className="row-2">
              <label>
                Establishment
                <select value={newPointEstablishment} onChange={(event) => setNewPointEstablishment(event.target.value)}>
                  <option value="">Select establishment</option>
                  {establishments.map((item) => (
                    <option value={item.id} key={item.id}>{item.name} - {item.employer}</option>
                  ))}
                </select>
              </label>
              <label>
                Point name
                <input value={newPointName} onChange={(event) => setNewPointName(event.target.value)} />
              </label>
            </div>
            <button className="btn btn-secondary btn-sm" type="submit" disabled={busy === 'add-point'} style={{ width: 'fit-content' }}>
              {busy === 'add-point' ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add attendance point
            </button>
          </form>

          {points.length === 0 ? (
            <EmptyState icon={QrCodeIcon} title="No attendance points yet" description="Create one for any establishment above, or let employers create their own." />
          ) : (
            points.map((point) => (
              <div className="list-row" key={point.id} style={{ alignItems: 'flex-start' }}>
                {point.qrImage ? <img src={point.qrImage} alt="" width={64} height={64} style={{ borderRadius: 8, border: '1px solid var(--line)' }} /> : null}
                <div>
                  <strong>{point.name}</strong>
                  <p>{point.establishment_name} · {point.employer_name} · code {point.qr_token}</p>
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
      ) : null}

      <div className="content-card">
        {loading ? <p className="muted">Loading attendance...</p> : (
          <DataTable columns={columns} rows={rows} emptyTitle="No attendance records" emptyDescription="Records appear as employees check in on site." />
        )}
      </div>
    </section>
  );
}
