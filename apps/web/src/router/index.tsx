import { Suspense, lazy, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { UserRole } from '@travel-os/shared-types';
import { authApi } from '../lib/api';
import AppLayout from '../components/layout/AppLayout';
import PageLoader from '../components/ui/PageLoader';

// ─── Lazy-loaded Pages ────────────────────────────────────────
const LoginPage        = lazy(() => import('../pages/auth/LoginPage'));
const OnboardingPage   = lazy(() => import('../pages/onboarding/OnboardingPage'));
const DashboardPage           = lazy(() => import('../pages/dashboard/DashboardPage'));
const BudgetDashboard         = lazy(() => import('../pages/budget/BudgetDashboardPage'));
const NewTravelRequestPage    = lazy(() => import('../pages/travel/NewTravelRequestPage'));
const MyTravelRequestsPage    = lazy(() => import('../pages/travel/MyTravelRequestsPage'));
const TravelRequestDetailPage = lazy(() => import('../pages/travel/TravelRequestDetailPage'));
const ApprovalsInboxPage      = lazy(() => import('../pages/approvals/ApprovalsInboxPage'));
const MembersAdminPage        = lazy(() => import('../pages/admin/MembersAdminPage'));
const BookingsListPage        = lazy(() => import('../pages/bookings/BookingsListPage'));
const PolicyListPage          = lazy(() => import('../pages/policy/PolicyListPage'));
const PolicyDetailPage        = lazy(() => import('../pages/policy/PolicyDetailPage'));
const PolicyAdminPage         = lazy(() => import('../pages/admin/PolicyAdminPage'));
const ReimbursementsListPage      = lazy(() => import('../pages/reimbursement/ReimbursementsListPage'));
const NewReimbursementPage        = lazy(() => import('../pages/reimbursement/NewReimbursementPage'));
const ReimbursementDetailPage     = lazy(() => import('../pages/reimbursement/ReimbursementDetailPage'));
const ReimbursementCategoriesPage = lazy(() => import('../pages/admin/ReimbursementCategoriesAdminPage'));
const NotFoundPage            = lazy(() => import('../pages/NotFoundPage'));

// ─── Auth Initializer (runs on every app load) ────────────────
// Silently refreshes the access token using the httpOnly refresh cookie
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) return; // Already authenticated in this session

    const tryRefresh = async () => {
      setLoading(true);
      try {
        const refreshRes = await authApi.refresh();
        const { accessToken } = refreshRes.data.data;
        useAuthStore.getState().setAccessToken(accessToken);

        // Get full user profile
        const meRes = await authApi.me();
        const { user, employee } = meRes.data.data;

        setAuth({
          accessToken,
          user,
          employee,
          requiresOnboarding: employee ? !employee.onboardingComplete : false,
        });
      } catch {
        // No valid session — user needs to log in
        clearAuth();
      } finally {
        setLoading(false);
      }
    };

    tryRefresh();
  }, []); // eslint-disable-line

  return <>{children}</>;
}

// ─── Protected Route Guard ────────────────────────────────────
function RequireAuth({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { isAuthenticated, isLoading, user, requiresOnboarding } = useAuthStore();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiresOnboarding) return <Navigate to="/onboarding" replace />;

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

// ─── Guest Route (redirect if logged in) ─────────────────────
function GuestOnly() {
  const { isAuthenticated, isLoading, requiresOnboarding } = useAuthStore();

  if (isLoading) return <PageLoader />;
  if (isAuthenticated) {
    return <Navigate to={requiresOnboarding ? '/onboarding' : '/dashboard'} replace />;
  }
  return <Outlet />;
}

// ─── Router Definition ────────────────────────────────────────
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthInitializer>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </AuthInitializer>
    ),
    children: [
      // Guest-only routes
      {
        element: <GuestOnly />,
        children: [
          { index: true, element: <Navigate to="/login" replace /> },
          { path: 'login', element: <LoginPage /> },
        ],
      },

      // Onboarding (auth required, no onboarding check)
      {
        path: 'onboarding',
        element: <OnboardingPage />,
      },

      // Protected application routes
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'budget',    element: <BudgetDashboard /> },

              // Travel module (all signed-in users)
              { path: 'travel/new',           element: <NewTravelRequestPage /> },
              { path: 'travel/requests',      element: <MyTravelRequestsPage /> },
              { path: 'travel/requests/:id',  element: <TravelRequestDetailPage /> },

              // Approval inbox (HOD/Travel Team/Admin/Owner)
              {
                element: <RequireAuth allowedRoles={[UserRole.HOD, UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER]} />,
                children: [
                  { path: 'approvals',       element: <ApprovalsInboxPage /> },
                  { path: 'approvals/:id',   element: <TravelRequestDetailPage /> },
                ],
              },

              // Policy (all authenticated users can read)
              { path: 'policy',         element: <PolicyListPage /> },
              { path: 'policy/:id',     element: <PolicyDetailPage /> },

              // Reimbursements (all authenticated users)
              { path: 'reimbursements',           element: <ReimbursementsListPage /> },
              { path: 'reimbursements/new',       element: <NewReimbursementPage /> },
              { path: 'reimbursements/:id',       element: <ReimbursementDetailPage /> },
              { path: 'reimbursements/:id/edit',  element: <NewReimbursementPage /> },

              // Travel Team routes (bookings live here too)
              {
                element: <RequireAuth allowedRoles={[UserRole.TRAVEL_TEAM, UserRole.OWNER, UserRole.ADMIN]} />,
                children: [
                  { path: 'bookings',   element: <BookingsListPage /> },
                  { path: 'vendors',    element: <PageLoader /> },
                ],
              },

              // Admin / Owner — members + policy admin
              {
                element: <RequireAuth allowedRoles={[UserRole.ADMIN, UserRole.OWNER]} />,
                children: [
                  { path: 'invoices',         element: <PageLoader /> },
                  { path: 'analytics',        element: <PageLoader /> },
                  { path: 'admin/members',    element: <MembersAdminPage /> },
                  { path: 'admin/policies',   element: <PolicyAdminPage /> },
                  { path: 'admin/reimbursement-categories', element: <ReimbursementCategoriesPage /> },
                ],
              },

              // Owner only
              {
                element: <RequireAuth allowedRoles={[UserRole.OWNER]} />,
                children: [
                  { path: 'users',     element: <PageLoader /> },
                  { path: 'settings',  element: <PageLoader /> },
                ],
              },
            ],
          },
        ],
      },

      // Catch-all
      { path: 'unauthorized', element: <NotFoundPage type="unauthorized" /> },
      { path: '*',            element: <NotFoundPage type="not-found" /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
