import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';

/** Header bell with a live unread badge. */
export default function NotificationBell({ to }: { to: string }) {
  const user = useAuthStore((state) => state.user);
  const { unread } = useNotifications(user?.id, 30);

  return (
    <Link to={to} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} className="bell-link">
      <Bell size={18} />
      {unread > 0 ? <span className="bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
    </Link>
  );
}
