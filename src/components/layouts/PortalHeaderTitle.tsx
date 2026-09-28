import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

type NavItem = { label: string; to: string; end?: boolean };

const TAGLINES: Record<string, string> = {
  Employee: 'Your applications, interviews and work life in one place.',
  Employer: 'Your team, establishments and invoices at a glance.',
  Admin: 'Recruitment, deployment and workforce operations.',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Portal header text: the current page's name as the title (instead of the
 * same "Employee Dashboard" label on every screen) and a friendly greeting
 * line underneath.
 */
export default function PortalHeaderTitle({ role, nav }: { role: 'Employee' | 'Employer' | 'Admin'; nav: NavItem[] }) {
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);

  const current = [...nav]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));

  const firstName = (user?.full_name ?? '').trim().split(' ')[0];
  const isHome = current?.end || !current;

  return (
    <div>
      <h1>{isHome ? `${greeting()}${firstName ? `, ${firstName}` : ''}` : current?.label}</h1>
      <p>{isHome ? TAGLINES[role] : `${role} workspace`}</p>
    </div>
  );
}
