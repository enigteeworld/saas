import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';
import { describeSchedule, getCurrentSchedule, setEmploymentSchedule, type EmploymentSchedule } from '@/lib/attendance';

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const PRESETS: { value: string; label: string; days?: number[] }[] = [
  { value: 'fixed_weekdays', label: 'Monday - Friday', days: [1, 2, 3, 4, 5] },
  { value: 'all_week', label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { value: 'selected_days', label: 'Choose specific days' },
  { value: 'rotating', label: 'Rotating (day-in, day-out)' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Lets an employer (own establishments) or admin (any deployment) set the
 * approved work schedule for a deployment - which days, what hours, whether
 * it's an overnight shift. The employee sees the same data read-only.
 */
export default function WorkScheduleEditor({ deploymentId }: { deploymentId: string }) {
  const [current, setCurrent] = useState<EmploymentSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [scheduleType, setScheduleType] = useState('fixed_weekdays');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [expectedHours, setExpectedHours] = useState('8');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [overnight, setOvernight] = useState(false);
  const [graceMinutes, setGraceMinutes] = useState('15');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await getCurrentSchedule(deploymentId);
    setCurrent(data);
    if (data) {
      setScheduleType(data.schedule_type);
      setDays(data.working_days);
      setExpectedHours(String(data.expected_hours ?? 8));
      setShiftStart(data.shift_start?.slice(0, 5) ?? '08:00');
      setShiftEnd(data.shift_end?.slice(0, 5) ?? '17:00');
      setOvernight(data.overnight);
      setGraceMinutes(String(data.grace_minutes ?? 15));
      setNotes(data.notes ?? '');
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  function applyPreset(value: string) {
    setScheduleType(value);
    const preset = PRESETS.find((item) => item.value === value);
    if (preset?.days) setDays(preset.days);
  }

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (days.length === 0) {
      setError('Select at least one working day.');
      return;
    }
    setSaving(true);
    const { error: saveError } = await setEmploymentSchedule({
      deploymentId,
      scheduleType,
      workingDays: days,
      expectedHours: Number(expectedHours) || 8,
      shiftStart: shiftStart || null,
      shiftEnd: overnight ? null : shiftEnd || null,
      overnight,
      graceMinutes: Number(graceMinutes) || 15,
      notes,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setNotice('Work schedule saved. The employee has been notified.');
    setEditing(false);
    await load();
  }

  return (
    <div className="content-card">
      <div className="card-heading">
        <h2><CalendarClock size={19} style={{ verticalAlign: '-3px' }} /> Work schedule</h2>
        {!loading ? (
          <button className="table-link" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Cancel' : current ? 'Edit' : 'Set schedule'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : !editing ? (
        <p className={current ? '' : 'muted'}>{describeSchedule(current)}</p>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>
            Pattern
            <select value={scheduleType} onChange={(event) => applyPreset(event.target.value)}>
              {PRESETS.map((preset) => (
                <option value={preset.value} key={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="hint" style={{ display: 'block', marginBottom: 6 }}>Working days</span>
            <div className="inline-actions">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={`btn btn-sm ${days.includes(day.value) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row-2">
            <label>
              Shift start
              <input type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} disabled={overnight} />
            </label>
            <label>
              Shift end
              <input type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} disabled={overnight} />
            </label>
          </div>

          <label className="check">
            <input type="checkbox" checked={overnight} onChange={(event) => setOvernight(event.target.checked)} />
            Overnight shift (crosses midnight)
          </label>

          <div className="row-2">
            <label>
              Expected hours per shift
              <input type="number" min={1} max={24} value={expectedHours} onChange={(event) => setExpectedHours(event.target.value)} />
            </label>
            <label>
              Grace period (minutes)
              <input type="number" min={0} max={120} value={graceMinutes} onChange={(event) => setGraceMinutes(event.target.value)} />
            </label>
          </div>

          <label>
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. 1 hour lunch break, remote on Fridays" />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Save schedule
          </button>
        </form>
      )}

      {notice ? <p className="success-message" style={{ marginTop: 12 }}>{notice}</p> : null}
    </div>
  );
}
