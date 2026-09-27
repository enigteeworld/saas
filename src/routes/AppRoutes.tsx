
import { Navigate, Route, Routes } from 'react-router-dom';

import PublicLayout from '@/components/layouts/PublicLayout';
import EmployeeLayout from '@/components/layouts/EmployeeLayout';
import EmployerLayout from '@/components/layouts/EmployerLayout';
import AdminLayout from '@/components/layouts/AdminLayout';
import RoleRoute from '@/routes/RoleRoute';

// Public pages
import HomePage from '@/pages/public/HomePage';
import AboutPage from '@/pages/public/AboutPage';
import HowItWorksPage from '@/pages/public/HowItWorksPage';
import JobsPage from '@/pages/public/JobsPage';
import JobDetailsPage from '@/pages/public/JobDetailsPage';
import EmployersPage from '@/pages/public/EmployersPage';
import ContactPage from '@/pages/public/ContactPage';

// Authentication pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage';

// Employee pages
import EmployeeDashboardPage from '@/pages/employee/EmployeeDashboardPage';
import EmployeeOnboardingPage from '@/pages/employee/EmployeeOnboardingPage';
import EmployeeProfilePage from '@/pages/employee/EmployeeProfilePage';
import EmployeeApplicationsPage from '@/pages/employee/EmployeeApplicationsPage';
import EmployeeApplicationDetailsPage from '@/pages/employee/EmployeeApplicationDetailsPage';
import EmployeeJobApplicationPage from '@/pages/employee/EmployeeJobApplicationPage';
import EmployeeInterviewsPage from '@/pages/employee/EmployeeInterviewsPage';
import EmployeeDocumentsPage from '@/pages/employee/EmployeeDocumentsPage';
import EmployeeEmploymentPage from '@/pages/employee/EmployeeEmploymentPage';
import EmployeeAttendancePage from '@/pages/employee/EmployeeAttendancePage';
import EmployeePayrollPage from '@/pages/employee/EmployeePayrollPage';
import EmployeeNotificationsPage from '@/pages/employee/EmployeeNotificationsPage';

// Employer pages
import EmployerDashboardPage from '@/pages/employer/EmployerDashboardPage';
import EmployerProfilePage from '@/pages/employer/EmployerProfilePage';
import EmployerEstablishmentsPage from '@/pages/employer/EmployerEstablishmentsPage';
import EmployerJobsPage from '@/pages/employer/EmployerJobsPage';
import EmployerCandidatesPage from '@/pages/employer/EmployerCandidatesPage';
import EmployerEmployeesPage from '@/pages/employer/EmployerEmployeesPage';
import EmployerEmployeeDetailsPage from '@/pages/employer/EmployerEmployeeDetailsPage';
import EmployerAttendancePage from '@/pages/employer/EmployerAttendancePage';
import EmployerInvoicesPage from '@/pages/employer/EmployerInvoicesPage';
import EmployerNotificationsPage from '@/pages/employer/EmployerNotificationsPage';

// Admin pages
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import AdminJobsPage from '@/pages/admin/AdminJobsPage';
import AdminCreateJobPage from '@/pages/admin/AdminCreateJobPage';
import AdminApplicationsPage from '@/pages/admin/AdminApplicationsPage';
import AdminApplicationDetailsPage from '@/pages/admin/AdminApplicationDetailsPage';
import AdminInterviewsPage from '@/pages/admin/AdminInterviewsPage';
import AdminCandidatesPage from '@/pages/admin/AdminCandidatesPage';
import AdminEmployersPage from '@/pages/admin/AdminEmployersPage';
import AdminCreateEmployers from '@/pages/admin/AdminCreateEmployers';
import AdminEstablishmentsPage from '@/pages/admin/AdminEstablishmentsPage';
import AdminEmployeesPage from '@/pages/admin/AdminEmployeesPage';
import AdminEmployeeDetailsPage from '@/pages/admin/AdminEmployeeDetailsPage';
import AdminDeploymentsPage from '@/pages/admin/AdminDeploymentsPage';
import AdminAttendancePage from '@/pages/admin/AdminAttendancePage';
import AdminPayrollPage from '@/pages/admin/AdminPayrollPage';
import AdminInvoicesPage from '@/pages/admin/AdminInvoicesPage';
import AdminDocumentsPage from '@/pages/admin/AdminDocumentsPage';
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage';
import AdminNotificationsPage from '@/pages/admin/AdminNotificationsPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public site */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/about"
          element={<AboutPage />}
        />

        <Route
          path="/how-it-works"
          element={<HowItWorksPage />}
        />

        <Route
          path="/jobs"
          element={<JobsPage />}
        />

        <Route
          path="/jobs/:id"
          element={<JobDetailsPage />}
        />

        <Route
          path="/employers"
          element={<EmployersPage />}
        />

        <Route
          path="/contact"
          element={<ContactPage />}
        />
      </Route>

      {/* Authentication */}
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/register"
        element={<RegisterPage />}
      />

      <Route
        path="/forgot-password"
        element={<ForgotPasswordPage />}
      />

      <Route
        path="/reset-password"
        element={<ResetPasswordPage />}
      />

      <Route
        path="/verify-email"
        element={<VerifyEmailPage />}
      />

      {/* Employee workspace */}
      <Route
        element={<RoleRoute allow={['employee']} />}
      >
        <Route
          path="/employee"
          element={<EmployeeLayout />}
        >
          <Route
            index
            element={
              <Navigate
                to="/employee/dashboard"
                replace
              />
            }
          />

          <Route
            path="dashboard"
            element={<EmployeeDashboardPage />}
          />

          <Route
            path="onboarding"
            element={<EmployeeOnboardingPage />}
          />

          <Route
            path="profile"
            element={<EmployeeProfilePage />}
          />

          <Route
            path="applications"
            element={<EmployeeApplicationsPage />}
          />

          {/* Application review and submission */}
          <Route
            path="applications/job/:id"
            element={<EmployeeJobApplicationPage />}
          />

          {/* Existing application details */}
          <Route
            path="applications/:id"
            element={<EmployeeApplicationDetailsPage />}
          />

          <Route
            path="interviews"
            element={<EmployeeInterviewsPage />}
          />

          <Route
            path="documents"
            element={<EmployeeDocumentsPage />}
          />

          <Route
            path="employment"
            element={<EmployeeEmploymentPage />}
          />

          <Route
            path="attendance"
            element={<EmployeeAttendancePage />}
          />

          <Route
            path="payroll"
            element={<EmployeePayrollPage />}
          />

          <Route
            path="notifications"
            element={<EmployeeNotificationsPage />}
          />
        </Route>
      </Route>

      {/* Employer workspace */}
      <Route
        element={<RoleRoute allow={['employer']} />}
      >
        <Route
          path="/employer"
          element={<EmployerLayout />}
        >
          <Route
            index
            element={
              <Navigate
                to="/employer/dashboard"
                replace
              />
            }
          />

          <Route
            path="dashboard"
            element={<EmployerDashboardPage />}
          />

          <Route
            path="profile"
            element={<EmployerProfilePage />}
          />

          <Route
            path="establishments"
            element={<EmployerEstablishmentsPage />}
          />

          <Route
            path="jobs"
            element={<EmployerJobsPage />}
          />

          <Route
            path="candidates"
            element={<EmployerCandidatesPage />}
          />

          <Route
            path="employees"
            element={<EmployerEmployeesPage />}
          />

          <Route
            path="employees/:id"
            element={<EmployerEmployeeDetailsPage />}
          />

          <Route
            path="attendance"
            element={<EmployerAttendancePage />}
          />

          <Route
            path="invoices"
            element={<EmployerInvoicesPage />}
          />

          <Route
            path="notifications"
            element={<EmployerNotificationsPage />}
          />
        </Route>
      </Route>

      {/* HR administration */}
      <Route
        element={<RoleRoute allow={['admin']} />}
      >
        <Route
          path="/admin"
          element={<AdminLayout />}
        >
          <Route
            index
            element={
              <Navigate
                to="/admin/dashboard"
                replace
              />
            }
          />

          <Route
            path="dashboard"
            element={<AdminDashboardPage />}
          />

          <Route
            path="jobs"
            element={<AdminJobsPage />}
          />

          <Route
            path="jobs/new"
            element={<AdminCreateJobPage />}
          />

          <Route
            path="jobs/:id/edit"
            element={<AdminCreateJobPage />}
          />

          <Route
            path="applications"
            element={<AdminApplicationsPage />}
          />

          <Route
            path="applications/:id"
            element={<AdminApplicationDetailsPage />}
          />

          <Route
            path="interviews"
            element={<AdminInterviewsPage />}
          />

          <Route
            path="candidates"
            element={<AdminCandidatesPage />}
          />

          {/* Employer management */}
          <Route
            path="employers"
            element={<AdminEmployersPage />}
          />

          <Route
            path="employers/create"
            element={<AdminCreateEmployers />}
          />

          <Route
            path="establishments"
            element={<AdminEstablishmentsPage />}
          />

          <Route
            path="employees"
            element={<AdminEmployeesPage />}
          />

          <Route
            path="employees/:id"
            element={<AdminEmployeeDetailsPage />}
          />

          <Route
            path="deployments"
            element={<AdminDeploymentsPage />}
          />

          <Route
            path="attendance"
            element={<AdminAttendancePage />}
          />

          <Route
            path="payroll"
            element={<AdminPayrollPage />}
          />

          <Route
            path="invoices"
            element={<AdminInvoicesPage />}
          />

          <Route
            path="documents"
            element={<AdminDocumentsPage />}
          />

          <Route
            path="notifications"
            element={<AdminNotificationsPage />}
          />

          <Route
            path="settings"
            element={<AdminSettingsPage />}
          />
        </Route>
      </Route>

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default AppRoutes;