import {
  LayoutDashboard,
  ClipboardList,
  UserRound,
  FileText,
  CalendarDays,
  BriefcaseBusiness,
  QrCode,
  WalletCards,
  Receipt,
  Bell,
  Building2,
  Users,
  Settings,
  Send,
  FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface WorkspaceConfig {
  role: UserRole;
  label: string;
  home: string;
  nav: NavItem[];
}

export const publicPaths = {
  home: '/',
  about: '/about',
  howItWorks: '/how-it-works',
  jobs: '/jobs',
  jobDetails: (id: string | number = ':id') => `/jobs/${id}`,
  employers: '/employers',
  contact: '/contact',
} as const;

export const authPaths = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  verifyEmail: '/verify-email',
} as const;

export const employeeWorkspace: WorkspaceConfig = {
  role: 'employee',
  label: 'Employee workspace',
  home: '/employee/dashboard',
  nav: [
    { label: 'Dashboard', to: '/employee/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Onboarding', to: '/employee/onboarding', icon: ClipboardList },
    { label: 'Profile', to: '/employee/profile', icon: UserRound },
    { label: 'My applications', to: '/employee/applications', icon: FileText },
    { label: 'Interviews', to: '/employee/interviews', icon: CalendarDays },
    { label: 'Documents', to: '/employee/documents', icon: FolderOpen },
    { label: 'Employment', to: '/employee/employment', icon: BriefcaseBusiness },
    { label: 'Attendance', to: '/employee/attendance', icon: QrCode },
    { label: 'Payroll', to: '/employee/payroll', icon: WalletCards },
    { label: 'Notifications', to: '/employee/notifications', icon: Bell },
  ],
};

export const employerWorkspace: WorkspaceConfig = {
  role: 'employer',
  label: 'Employer workspace',
  home: '/employer/dashboard',
  nav: [
    { label: 'Dashboard', to: '/employer/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Company profile', to: '/employer/profile', icon: UserRound },
    { label: 'Establishments', to: '/employer/establishments', icon: Building2 },
    { label: 'Job requests', to: '/employer/jobs', icon: BriefcaseBusiness },
    { label: 'Candidates', to: '/employer/candidates', icon: Users },
    { label: 'Employees', to: '/employer/employees', icon: Users },
    { label: 'Attendance', to: '/employer/attendance', icon: QrCode },
    { label: 'Invoices', to: '/employer/invoices', icon: Receipt },
    { label: 'Notifications', to: '/employer/notifications', icon: Bell },
  ],
};

export const adminWorkspace: WorkspaceConfig = {
  role: 'admin',
  label: 'HR administration',
  home: '/admin/dashboard',
  nav: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Jobs', to: '/admin/jobs', icon: BriefcaseBusiness },
    { label: 'Applications', to: '/admin/applications', icon: FileText },
    { label: 'Interviews', to: '/admin/interviews', icon: CalendarDays },
    { label: 'Candidates', to: '/admin/candidates', icon: Users },
    { label: 'Employers', to: '/admin/employers', icon: Building2 },
    { label: 'Establishments', to: '/admin/establishments', icon: Building2 },
    { label: 'Employees', to: '/admin/employees', icon: Users },
    { label: 'Deployments', to: '/admin/deployments', icon: Send },
    { label: 'Attendance', to: '/admin/attendance', icon: QrCode },
    { label: 'Payroll', to: '/admin/payroll', icon: WalletCards },
    { label: 'Invoices', to: '/admin/invoices', icon: Receipt },
    { label: 'Documents', to: '/admin/documents', icon: FolderOpen },
    { label: 'Notifications', to: '/admin/notifications', icon: Bell },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ],
};

export const workspaces: Record<UserRole, WorkspaceConfig> = {
  employee: employeeWorkspace,
  employer: employerWorkspace,
  admin: adminWorkspace,
};

export function homeForRole(role: UserRole | null | undefined): string {
  if (!role) return authPaths.login;
  return workspaces[role].home;
}
