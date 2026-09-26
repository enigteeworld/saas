import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authPaths, homeForRole } from '@/routes/routeConfig';
import type { UserRole } from '@/types';

export interface RoleRouteProps {
  allow: UserRole[];
  children?: ReactNode;
}

export function RoleRoute({ allow, children }: RoleRouteProps) {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const location = useLocation();

  if (isLoading) {
    return <div className="route-loading">Loading EnigteeWorld…</div>;
  }

  if (!user) {
    return <Navigate to={authPaths.login} state={{ from: location.pathname }} replace />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default RoleRoute;
