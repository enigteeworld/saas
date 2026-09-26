import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, ExternalLink, MapPin, Video } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type InterviewItem = {
  id: string;
  application_id: string;
  scheduled_for: string | null;
  meeting_url: string | null;
  instructions: string | null;
  status: string;
  outcome_notes: string | null;
  mode: string | null;
  location: string | null;
  duration_minutes: number | null;
  job_applications: unknown;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

function when(value: string | null) {
  if (!value) return 'Date to be confirmed';
  return new Date(value).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EmployeeInterviewsPage() {
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const { data, error: queryError } = await supabase
        .from('interviews')
        .select(`
          id,
          application_id,
          scheduled_for,
          meeting_url,
          instructions,
          status,
          outcome_notes,
          mode,
          location,
          duration_minutes,
          job_applications:application_id (
            applicant_id,
            application_number,
            job_openings:job_id (title)
          )
        `)
        .order('scheduled_for', { ascending: false, nullsFirst: true });

      if (queryError) {
        console.error(queryError);
        setError(errorMessage(queryError));
      } else {
        setItems(
          ((data ?? []) as InterviewItem[]).filter((item) => {
            const application = one(item.job_applications as { applicant_id: string } | { applicant_id: string }[] | null);
            return !application || application.applicant_id === user.id;
          }),
        );
      }
      setLoading(false);
    }
    void load();
  }, [user?.id]);

  const active = items.filter((item) => ['invited', 'scheduled', 'rescheduled'].includes(item.status));
  const past = items.filter((item) => !['invited', 'scheduled', 'rescheduled'].includes(item.status));

  function card(item: InterviewItem, highlight: boolean) {
    const application = one(
      item.job_applications as
        | { application_number: string; job_openings: { title: string } | { title: string }[] | null }
        | { application_number: string; job_openings: { title: string } | { title: string }[] | null }[]
        | null,
    );
    const job = one(application?.job_openings);
    const mode = item.mode === 'in_person' ? 'In person' : item.mode === 'phone' ? 'Phone call' : 'Online (video call)';

    return (
      <div className={`notice-card${highlight ? ' warn' : ''}`} key={item.id}>
        <div className="card-heading">
          <h3>{job?.title ?? 'Interview'}</h3>
          <StatusBadge status={item.status} />
        </div>

        <p>
          <CalendarDays size={14} style={{ verticalAlign: '-2px' }} /> <strong>{when(item.scheduled_for)}</strong>
        </p>
        <p>
          {item.mode === 'in_person' ? <MapPin size={14} style={{ verticalAlign: '-2px' }} /> : <Video size={14} style={{ verticalAlign: '-2px' }} />} {mode}
          {item.location ? ` - ${item.location}` : ''}
        </p>
        {item.duration_minutes ? (
          <p>
            <Clock size={14} style={{ verticalAlign: '-2px' }} /> About {item.duration_minutes} minutes
          </p>
        ) : null}

        {item.instructions ? (
          <>
            <p style={{ marginTop: 10, fontWeight: 700 }}>Interview details from HR</p>
            <p>{item.instructions}</p>
          </>
        ) : null}

        {item.outcome_notes ? (
          <>
            <p style={{ marginTop: 10, fontWeight: 700 }}>Feedback</p>
            <p>{item.outcome_notes}</p>
          </>
        ) : null}

        <div className="notice-actions">
          {item.meeting_url && ['invited', 'scheduled', 'rescheduled'].includes(item.status) ? (
            <a className="btn btn-primary btn-sm" href={item.meeting_url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Join interview
            </a>
          ) : null}
          <Link className="btn btn-secondary btn-sm" to={`/employee/applications/${item.application_id}`}>
            View application
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section>
      <PageHeader eyebrow="My interviews" title="Interviews" description="Invitations, schedules and outcomes for every interview stage." />
      {error ? <div className="error-message">{error}</div> : null}

      {loading ? (
        <div className="content-card">
          <p className="muted">Loading interviews...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="content-card">
          <EmptyState icon={CalendarDays} title="No interviews scheduled" description="You will be notified by email and here as soon as an interview is arranged." />
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="content-card">
              <h2>Upcoming</h2>
              <div className="notice-board">{active.map((item) => card(item, true))}</div>
            </div>
          ) : null}
          {past.length > 0 ? (
            <div className="content-card">
              <h2>Past interviews</h2>
              <div className="notice-board">{past.map((item) => card(item, false))}</div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
