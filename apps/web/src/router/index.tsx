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
const DashboardPage    = lazy(() => import('../pages/dashboard/DashboardPage'));
const BudgetDashboard  = lazy(() => import('../pages/budget/BudgetDashboardPage'));
const NotFoundPage     = lazy(() => import('../pages/NotFoundPage'));

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

              // Employee routes
              {
                element: <RequireAuth allowedRoles={[UserRole.EMPLOYEE, UserRole.L1_APPROVER, UserRole.L2_APPROVER, UserRole.TRAVEL_DESK, UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: 'trips',        element: <PageLoader /> }, // Populated in Phase 3
                  { path: 'trips/new',    element: <PageLoader /> },
                  { path: 'trips/:id',    element: <PageLoader /> },
                  { path: 'profile',      element: <PageLoader /> },
                ],
              },

              // Approver routes
              {
                element: <RequireAuth allowedRoles={[UserRole.L1_APPROVER, UserRole.L2_APPROVER, UserRole.TRAVEL_DESK, UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: 'approvals',         element: <PageLoader /> },
                  { path: 'approvals/:tripId', element: <PageLoader /> },
                ],
              },

              // Travel Desk routes
              {
                element: <RequireAuth allowedRoles={[UserRole.TRAVEL_DESK, UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: 'bookings',   element: <PageLoader /> },
                  { path: 'vendors',    element: <PageLoader /> },
                  { path: 'rate-cards', element: <PageLoader /> },
                ],
              },

              // Finance routes
              {
                element: <RequireAuth allowedRoles={[UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: 'invoices',  element: <PageLoader /> },
                  { path: 'expenses',  element: <PageLoader /> },
                  { path: 'gst',       element: <PageLoader /> },
                ],
              },

              // Admin routes
              {
                element: <RequireAuth allowedRoles={[UserRole.SUPER_ADMIN]} />,
                children: [
                  { path: 'users',     element: <PageLoader /> },
                  { path: 'settings',  element: <PageLoader /> },
                  { path: 'analytics', element: <PageLoader /> },
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
