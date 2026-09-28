import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { employerWorkspace, publicPaths } from '@/routes/routeConfig';
import { Logo } from './PublicLayout';
import NotificationBell from '@/components/shared/NotificationBell';
import PortalHeaderTitle from './PortalHeaderTitle';
import MobileBottomNav from '@/components/shared/MobileBottomNav';

export function EmployerLayout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1'
  );
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const config = employerWorkspace;

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', prev ? '0' : '1');
      return !prev;
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate(publicPaths.home, { replace: true });
  }

  const mobileItems = config.nav.filter(({ to }) =>
    ['/employer/dashboard', '/employer/employees', '/employer/attendance', '/employer/invoices'].includes(to),
  );

  return (
    <div className="portal portal-employer">
      {open ? <button className="mobile-drawer-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${open ? ' mobile-open' : ''}`}>
        <div className="sidebar-head">
          <Logo />
          <button className="sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
          <button className="mobile-menu" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="user-chip">
          <div className="avatar">{user?.avatar_url ? <img src={user.avatar_url} alt="" /> : (user?.full_name ?? 'E').charAt(0).toUpperCase()}</div>
          <div><strong>{user?.full_name ?? 'Employer'}</strong><span>{config.label}</span></div>
        </div>
        <nav className="side-nav" onClick={() => setOpen(false)}>
          {config.nav.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} title={label}><Icon size={17} /> <span>{label}</span></NavLink>
          ))}
        </nav>
        <button className="side-home" onClick={handleSignOut}><LogOut size={15} /> <span>Sign out</span></button>
      </aside>

      <main className="portal-main">
        <div className="portal-header">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></button>
          <PortalHeaderTitle role="Employer" nav={config.nav} />
          <div className="portal-tools"><NotificationBell to="/employer/notifications" /><Link to={publicPaths.home} className="muted">Public site</Link></div>
        </div>
        <div className="portal-content"><Outlet /></div>
      </main>

      <MobileBottomNav items={mobileItems} onMenu={() => setOpen(true)} />
    </div>
  );
}

export default EmployerLayout;
