export type UserRole = 'admin' | 'employee' | 'employer';

export interface Profile {
  id: string;
  email: string;
  phone?: string | null;
  full_name: string;
  avatar_url?: string | null;
  role: UserRole;
  is_active: boolean;
}

export type JobType = 'Full-time' | 'Part-time' | 'Contract' | 'On-site';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: JobType;
  posted: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
}

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'deployed'
  | 'rejected';

export interface Application {
  id: string;
  jobTitle: string;
  candidate: string;
  employer: string;
  status: ApplicationStatus;
  submitted: string;
}

export interface Interview {
  id: string;
  candidate: string;
  jobTitle: string;
  date: string;
  time: string;
  mode: string;
  status: string;
}

export interface EmployeeRecord {
  id: string;
  name: string;
  role: string;
  establishment: string;
  startDate: string;
  status: string;
}

export interface Establishment {
  id: string;
  name: string;
  address: string;
  employees: number;
  status: string;
}

export interface Invoice {
  id: string;
  reference: string;
  employer: string;
  period: string;
  amount: number;
  status: string;
}

export interface AttendanceRecord {
  id: string;
  name: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
}

export interface PayrollRecord {
  id: string;
  employee: string;
  period: string;
  gross: number;
  deductions: number;
  net: number;
  status: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  owner: string;
  type: string;
  uploaded: string;
  status: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}
