import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, LogIn, LogOut, QrCode } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import StatCard from '@/components/shared/StatCard';
import { supabase } from '@/lib/supabase';
import { scanAttendance } from '@/lib/attendance';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type Row = {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  confirmation: string;
  method: string;
};

const methodLabel: Record<string, string> = { qr: 'QR scan', employer_manual: 'Marked by employer', admin_manual: 'Marked by admin' };

export default function EmployeeAttendancePage() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [establishmentName, setEstablishmentName] = useState('');
  const [openSession, setOpenSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;

    const { data: deployment } = await supabase
      .from('deployments')
      .select('id, establishments:establishment_id (name)')
      .eq('employee_id', user.id)
      .in('status', ['active', 'pending_start', 'onboarding'])
      .order('status', { ascending: false })
      .limit(1)
      .maybeSingle();

    const est = Array.isArray(deployment?.establishments) ? deployment?.establishments[0] : deployment?.establishments;
    setDeploymentId(deployment?.id ?? null);
    setEstablishmentName(est?.name ?? '');

    if (deployment) {
      const { data, error: queryError } = await supabase
        .from('attendance_events')
        .select('id, attendance_date, check_in_at, check_out_at, status, confirmation_status, source')
        .eq('employee_id', user.id)
        .eq('deployment_id', deployment.id)
        .order('attendance_date', { ascending: false })
        .order('check_in_at', { ascending: false });

      if (queryError) {
        console.error(queryError);
      } else {
        const mapped = (data ?? []).map((item) => ({
          id: item.id,
          date: new Date(item.attendance_date).toLocaleDateString('en-NG'),
          checkIn: item.check_in_at ? new Date(item.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          checkOut: item.check_out_at ? new Date(item.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          status: item.status,
          confirmation: item.confirmation_status,
          method: methodLabel[item.source] ?? item.source,
        }));
        setRows(mapped);
        setOpenSession((data ?? []).some((item) => item.check_in_at && !item.check_out_at));
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCode(event?: FormEvent) {
    event?.preventDefault();
    if (!code.trim()) return;
    setScanning(true);
    setError('');
    setNotice('');

    const { data, error: scanError } = await scanAttendance(code);
    setScanning(false);

    if (scanError || !data) {
      setError(scanError ?? 'Unable to record your attendance.');
      return;
    }

    setNotice(
      data.check_out_at
        ? 'Checked out. Thanks for your work today - your employer will confirm this session.'
        : 'Checked in. Your employer will confirm this session shortly.',
    );
    setCode('');
    if (searchParams.get('code')) {
      searchParams.delete('code');
      setSearchParams(searchParams, { replace: true });
    }
    await load();
  }

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Date' },
    { key: 'checkIn', header: 'Check in' },
    { key: 'checkOut', header: 'Check out' },
    { key: 'method', header: 'Method' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'confirmation', header: 'Confirmation', render: (row) => <StatusBadge status={row.confirmation} /> },
  ];

  const today = new Date().toDateString();
  const todayRows = rows.filter((row) => row.date === new Date().toLocaleDateString('en-NG'));
  void today;

  return (
    <section>
      <PageHeader eyebrow="Attendance" title="Check in and history" description="Scan or enter your establishment's attendance code to check in and out." />
      <div className="stat-grid">
        <StatCard label="Confirmed present" value={loading ? '—' : rows.filter((row) => row.confirmation === 'confirmed' && row.status === 'present').length} hint="This history" />
        <StatCard label="Late arrivals" value={loading ? '—' : rows.filter((row) => row.status === 'late').length} hint="This history" />
        <StatCard label="Pending confirmation" value={loading ? '—' : rows.filter((row) => row.confirmation === 'pending_confirmation').length} hint="Awaiting employer" />
        <StatCard label="Today" value={loading ? '—' : todayRows.length ? todayRows[0].status : 'Not recorded'} hint="Current day" />
      </div>

      <div className="dashboard-grid">
        <div className="content-card">
          <h2>
            <QrCode size={19} style={{ verticalAlign: '-3px' }} /> Check {openSession ? 'out' : 'in'}
          </h2>
          {!deploymentId ? (
            <p className="muted">You need an active deployment before you can check in.</p>
          ) : (
            <>
              <p className="muted">
                Point your camera at the QR code displayed at <strong>{establishmentName || 'your establishment'}</strong>, or ask your
                supervisor for the code and type it below.
              </p>
              <form className="form" onSubmit={submitCode}>
                <label>
                  Attendance code
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="e.g. 4F2A91C7D0"
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                </label>
                {error ? <p className="error">{error}</p> : null}
                {notice ? <p className="success-message"><CheckCircle2 size={15} /> {notice}</p> : null}
                <button className="btn btn-primary" type="submit" disabled={scanning || !code.trim()}>
                  {scanning ? (
                    <><Loader2 size={16} className="spin" /> Recording...</>
                  ) : openSession ? (
                    <><LogOut size={16} /> Check out</>
                  ) : (
                    <><LogIn size={16} /> Check in</>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="content-card">
          <h2>
            <Clock size={19} style={{ verticalAlign: '-3px' }} /> Recent records
          </h2>
          <DataTable columns={columns} rows={rows} emptyTitle="No attendance yet" emptyDescription="Your records appear after your first check-in." />
        </div>
      </div>
    </section>
  );
}
