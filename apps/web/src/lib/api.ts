import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

// ─── Create Instance ──────────────────────────────────────────
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Send httpOnly refresh token cookie
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor: Attach Access Token ─────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Auto Token Refresh ─────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401 from a non-auth endpoint
    const is401 = error.response?.status === 401;
    const isAuthEndpoint = originalRequest.url?.includes('/auth/');
    const alreadyRetried = originalRequest._retry;

    if (is401 && !isAuthEndpoint && !alreadyRetried) {
      if (isRefreshing) {
        // Queue subsequent requests while refresh is in-flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post<{ success: boolean; data: { accessToken: string } }>(
          '/auth/refresh'
        );
        const newToken = data.data.accessToken;
        useAuthStore.getState().setAccessToken(newToken);
        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        // Refresh failed — clear auth and redirect to login
        useAuthStore.getState().clearAuth();
        window.location.href = '/login?session=expired';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Typed API Methods ────────────────────────────────────────
export const authApi = {
  login:              (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  refresh:            () => api.post('/auth/refresh'),
  logout:             () => api.post('/auth/logout'),
  logoutAll:          () => api.post('/auth/logout-all'),
  me:                 () => api.get('/auth/me'),
  completeOnboarding: (data: unknown) => api.post('/auth/onboarding', data),
  updateTheme:        (theme: string) => api.patch('/auth/theme', { theme }),
};

export const budgetApi = {
  summary:          (params?: { departmentId?: string; fiscalYear?: string }) =>
    api.get('/budget/summary', { params }),
  orgOverview:      (params?: { fiscalYear?: string }) =>
    api.get('/budget/org-overview', { params }),
  getById:          (id: string) => api.get(`/budget/${id}`),
  history:          (budgetId: string, params?: { limit?: number }) =>
    api.get(`/budget/${budgetId}/history`, { params }),
  upsertAllocation: (data: { departmentId: string; fiscalYear: string; allocatedAnnual: number }) =>
    api.post('/budget', data),
  adjust:           (id: string, data: { delta: number; note: string }) =>
    api.post(`/budget/${id}/adjust`, data),
  consume:          (id: string, data: { amount: number; travelRequestId?: string; note?: string }) =>
    api.post(`/budget/${id}/consume`, data),
  listAdditions:    (params?: { status?: string }) =>
    api.get('/budget/addition-requests', { params }),
  requestAddition:  (data: { departmentBudgetId: string; amount: number; reason: string }) =>
    api.post('/budget/addition-requests', data),
  decideAddition:   (id: string, data: { action: 'APPROVE' | 'REJECT'; note?: string }) =>
    api.post(`/budget/addition-requests/${id}/decide`, data),
};

export const memberApi = {
  import:      (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/members/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes timeout for bulk imports
    });
  },
  lookup:      (employeeCode: string) =>
    api.get('/employees/lookup', { params: { employeeCode } }),
  list:        (params?: Record<string, unknown>) => api.get('/employees', { params }),
};

export const travelRequestApi = {
  list:    (params?: Record<string, unknown>) => api.get('/travel-requests', { params }),
  get:     (id: string) => api.get(`/travel-requests/${id}`),
  create:  (data: unknown) => api.post('/travel-requests', data),
  approve: (id: string, data: { note?: string }) => api.post(`/travel-requests/${id}/approve`, data),
  reject:  (id: string, data: { note: string }) => api.post(`/travel-requests/${id}/reject`, data),
  cancel:  (id: string, data: { reason: string }) => api.post(`/travel-requests/${id}/cancel`, data),
  pendingApprovals: (params?: Record<string, unknown>) =>
    api.get('/travel-requests/pending-approvals', { params }),
};

export const notificationApi = {
  list:   (params?: { unreadOnly?: boolean }) => api.get('/notifications', { params }),
  markRead:    (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  count:       () => api.get('/notifications/count'),
};

export const departmentApi = {
  list: () => api.get('/departments'),
};

export default api;
