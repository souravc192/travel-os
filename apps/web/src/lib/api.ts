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

export const employeeApi = {
  list:   (params?: Record<string, unknown>) => api.get('/employees', { params }),
  get:    (id: string) => api.get(`/employees/${id}`),
  create: (data: unknown) => api.post('/employees', data),
  update: (id: string, data: unknown) => api.patch(`/employees/${id}`, data),
  import: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/employees/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const tripApi = {
  list:       (params?: Record<string, unknown>) => api.get('/trips', { params }),
  get:        (id: string) => api.get(`/trips/${id}`),
  create:     (data: unknown) => api.post('/trips', data),
  update:     (id: string, data: unknown) => api.patch(`/trips/${id}`, data),
  submit:     (id: string) => api.post(`/trips/${id}/submit`),
  cancel:     (id: string, reason: string) => api.post(`/trips/${id}/cancel`, { reason }),
  myTrips:    (params?: Record<string, unknown>) => api.get('/trips/my', { params }),
};

export const approvalApi = {
  pending:     (params?: Record<string, unknown>) => api.get('/approvals/pending', { params }),
  get:         (tripId: string) => api.get(`/approvals/${tripId}`),
  approve:     (tripId: string, data: { comment?: string; conditions?: string }) =>
    api.post(`/approvals/${tripId}/approve`, data),
  reject:      (tripId: string, data: { comment: string }) =>
    api.post(`/approvals/${tripId}/reject`, data),
  sendBack:    (tripId: string, data: { comment: string }) =>
    api.post(`/approvals/${tripId}/send-back`, data),
  bulkApprove: (tripIds: string[], comment?: string) =>
    api.post('/approvals/bulk-approve', { tripIds, comment }),
};

export const budgetApi = {
  summary:          (params?: { costCentreId?: string; fiscalYear?: string }) =>
    api.get('/budget/summary', { params }),
  orgOverview:      (params?: { fiscalYear?: string }) =>
    api.get('/budget/org-overview', { params }),
  getById:          (id: string) => api.get(`/budget/${id}`),
  history:          (budgetId: string, params?: { limit?: number }) =>
    api.get(`/budget/${budgetId}/history`, { params }),
  createAllocation: (data: { costCentreId: string; fiscalYear: string; allocated: number }) =>
    api.post('/budget', data),
  adjust:           (id: string, data: { delta: number; note: string }) =>
    api.post(`/budget/${id}/adjust`, data),
  consume:          (id: string, data: { amount: number; tripId?: string; note?: string }) =>
    api.post(`/budget/${id}/consume`, data),
  listSupplementary:     (params?: { status?: string }) =>
    api.get('/budget/supplementary', { params }),
  requestSupplementary:  (data: { amount: number; reason: string; costCentreId?: string; fiscalYear?: string }) =>
    api.post('/budget/supplementary', data),
  approveSupplementary:  (id: string, data: { action: 'APPROVE' | 'REJECT'; note?: string }) =>
    api.post(`/budget/supplementary/${id}/approve`, data),
  listAlerts:           (params?: { budgetId?: string }) =>
    api.get('/budget/alerts', { params }),
  listAlertThresholds:  () => api.get('/budget/alert-thresholds'),
  upsertAlertThreshold: (data: { thresholdPct: number; channel?: string; label?: string; isActive?: boolean }) =>
    api.post('/budget/alert-thresholds', data),
  deleteAlertThreshold: (id: string) => api.delete(`/budget/alert-thresholds/${id}`),
};

export const notificationApi = {
  list:   (params?: { unreadOnly?: boolean }) => api.get('/notifications', { params }),
  markRead:    (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  count:       () => api.get('/notifications/count'),
};

export const departmentApi = {
  list:        () => api.get('/departments'),
  costCentres: () => api.get('/departments/cost-centres'),
};

export default api;
