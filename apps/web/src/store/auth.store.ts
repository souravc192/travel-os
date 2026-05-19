import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppTheme, UserRole } from '@travel-os/shared-types';

// ─── Types ────────────────────────────────────────────────────
interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  theme: AppTheme;
  lastLoginAt: string | null;
}

interface AuthEmployee {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  gradeLevel: string | null;
  departmentId: string | null;
  departmentName: string | null;
  costCentreId: string | null;
  onboardingComplete: boolean;
  avatarUrl: string | null;
  l1Approver: { id: string; name: string } | null;
  l2Approver: { id: string; name: string } | null;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  employee: AuthEmployee | null;
  requiresOnboarding: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (data: {
    accessToken: string;
    user: AuthUser;
    employee: AuthEmployee | null;
    requiresOnboarding: boolean;
  }) => void;
  setEmployee: (employee: AuthEmployee) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  markOnboardingComplete: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      employee: null,
      requiresOnboarding: false,
      isAuthenticated: false,
      isLoading: false,

      setAuth: ({ accessToken, user, employee, requiresOnboarding }) =>
        set({
          accessToken,
          user,
          employee,
          requiresOnboarding,
          isAuthenticated: true,
          isLoading: false,
        }),

      setEmployee: (employee) => set({ employee }),

      setAccessToken: (accessToken) => set({ accessToken }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          employee: null,
          requiresOnboarding: false,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      markOnboardingComplete: () =>
        set((state) => ({
          requiresOnboarding: false,
          employee: state.employee
            ? { ...state.employee, onboardingComplete: true }
            : null,
        })),
    }),
    {
      name: 'travel-os-auth',
      storage: createJSONStorage(() => sessionStorage), // sessionStorage: cleared on tab close
      partialize: (state) => ({
        user: state.user,
        employee: state.employee,
        requiresOnboarding: state.requiresOnboarding,
        isAuthenticated: state.isAuthenticated,
        // NOTE: Never persist accessToken in localStorage/sessionStorage for XSS safety
        // It is kept in memory (zustand) and refreshed via httpOnly cookie on page load
      }),
    }
  )
);

// ─── Selectors ────────────────────────────────────────────────
export const selectUser = (s: AuthState) => s.user;
export const selectEmployee = (s: AuthState) => s.employee;
export const selectRole = (s: AuthState) => s.user?.role;
export const selectIsAuthenticated = (s: AuthState) => s.isAuthenticated;
export const selectRequiresOnboarding = (s: AuthState) => s.requiresOnboarding;
