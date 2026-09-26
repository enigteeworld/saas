import { Bell, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  eyebrow?: string;
  title?: string;
  description: string;
};

/** Shared notification centre used by the employee, employer and admin portals. */
export default function NotificationsList({ eyebrow = 'Notifications', title = 'Your updates', description }: Props) {
  const user = useAuthStore((state) => state.user);
  const { items, loading, error, unread, markRead, markAllRead } = useNotifications(user?.id);

  return (
    <section>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <button className="btn btn-secondary" type="button" disabled={unread === 0} onClick={() => void markAllRead()}>
            Mark all as read
          </button>
        }
      />

      {error ? <div className="error-message">{error}</div> : null}

      <div className="content-card">
        <div className="card-heading">
          <h2>Recent activity</h2>
          <span className="muted small">{unread} unread</span>
        </div>

        {loading ? (
          <p className="muted">Loading notifications...</p>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" description="Updates about your account will appear here." />
        ) : (
          items.map((item) => {
            const link = item.data?.link;
            return (
              <div className={`list-row notice-row${item.is_read ? '' : ' unread'}`} key={item.id}>
                {item.is_read ? <CheckCircle2 size={18} className="success" /> : <Bell size={18} />}
                <div>
                  <strong>{item.title}</strong>
                  <p className="notice-text">{item.message}</p>
                  {link ? (
                    <Link className="table-link" to={link} onClick={() => void markRead(item.id)}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <div className="notice-meta">
                  <span className="muted small">{new Date(item.created_at).toLocaleString('en-NG')}</span>
                  {!item.is_read ? (
                    <button className="table-link" type="button" onClick={() => void markRead(item.id)}>
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
