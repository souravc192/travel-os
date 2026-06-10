import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

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
  complete: (id: string) => api.post(`/travel-requests/${id}/complete`),
  pendingApprovals: (params?: Record<string, unknown>) =>
    api.get('/travel-requests/pending-approvals', { params }),
};

export const feedbackApi = {
  byRequest: (requestId: string) => api.get(`/feedback/by-request/${requestId}`),
  create:    (data: unknown) => api.post('/feedback', data),
  list:      () => api.get('/feedback'),
};

export const complaintApi = {
  list:            (params?: Record<string, unknown>) => api.get('/complaints', { params }),
  get:             (id: string) => api.get(`/complaints/${id}`),
  create:          (data: unknown) => api.post('/complaints', data),
  assign:          (id: string, data: { resolutionOwnerUserId: string; note?: string }) =>
    api.post(`/complaints/${id}/assign`, data),
  updateStatus:    (id: string, data: { status: string }) => api.post(`/complaints/${id}/status`, data),
  resolve:         (id: string, data: { note: string }) => api.post(`/complaints/${id}/resolve`, data),
  close:           (id: string, data: { note?: string }) => api.post(`/complaints/${id}/close`, data),
  addComment:      (id: string, data: { body: string }) => api.post(`/complaints/${id}/comments`, data),
  assignableUsers: () => api.get('/complaints/assignable-users'),
  vendorAnalytics: () => api.get('/complaints/analytics/vendors'),
};

export const bookingApi = {
  list:    (params?: Record<string, unknown>) => api.get('/bookings', { params }),
  byRequest: (requestId: string) => api.get(`/bookings/by-request/${requestId}`),
  get:     (id: string) => api.get(`/bookings/${id}`),
  create:  (data: unknown) => api.post('/bookings', data),
  update:  (id: string, data: unknown) => api.patch(`/bookings/${id}`, data),
  confirm: (id: string) => api.post(`/bookings/${id}/confirm`),
  cancel:  (id: string, data: { cancellationFee: number; reason: string }) =>
    api.post(`/bookings/${id}/cancel`, data),
  reschedule: (id: string, data: { note?: string }) =>
    api.post(`/bookings/${id}/reschedule`, data),
  uploadInvoice: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/bookings/${id}/invoice`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  invoiceUrl: (id: string) => `${BASE_URL}/bookings/${id}/invoice`,
};

export const reimbursementApi = {
  // Categories
  listCategories:   (params?: { includeInactive?: boolean }) =>
    api.get('/reimbursements/categories', { params }),
  createCategory:   (data: { name: string; description?: string }) =>
    api.post('/reimbursements/categories', data),
  updateCategory:   (id: string, data: { name?: string; description?: string; isActive?: boolean }) =>
    api.patch(`/reimbursements/categories/${id}`, data),

  // Headers
  list:    (params?: Record<string, unknown>) => api.get('/reimbursements', { params }),
  get:     (id: string) => api.get(`/reimbursements/${id}`),
  create:  (data: unknown) => api.post('/reimbursements', data),
  update:  (id: string, data: unknown) => api.patch(`/reimbursements/${id}`, data),
  submit:  (id: string) => api.post(`/reimbursements/${id}/submit`),
  cancel:  (id: string, data: { reason?: string }) =>
    api.post(`/reimbursements/${id}/cancel`, data),
  decide:  (id: string, data: {
    action: 'APPROVE' | 'REJECT';
    note?: string;
    itemApprovals?: Array<{ id: string; approvedAmount: number }>;
  }) => api.post(`/reimbursements/${id}/decide`, data),
  pay:     (id: string, data: { paidReference: string }) =>
    api.post(`/reimbursements/${id}/pay`, data),

  // Items
  addItem:        (id: string, data: unknown) => api.post(`/reimbursements/${id}/items`, data),
  updateItem:     (itemId: string, data: unknown) => api.patch(`/reimbursements/items/${itemId}`, data),
  deleteItem:     (itemId: string) => api.delete(`/reimbursements/items/${itemId}`),
  uploadReceipt:  (itemId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/reimbursements/items/${itemId}/receipt`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  receiptUrl:     (itemId: string) => `${BASE_URL}/reimbursements/items/${itemId}/receipt`,
};

export const policyApi = {
  list:           () => api.get('/policies'),
  get:            (id: string) => api.get(`/policies/${id}`),
  create:         (data: { category: string; title: string; description?: string }) =>
    api.post('/policies', data),
  update:         (id: string, data: { category?: string; title?: string; description?: string; isActive?: boolean }) =>
    api.patch(`/policies/${id}`, data),
  listVersions:   (id: string) => api.get(`/policies/${id}/versions`),
  getVersion:     (versionId: string) => api.get(`/policies/versions/${versionId}`),
  uploadVersion:  (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/policies/${id}/versions`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  publishVersion: (versionId: string) => api.post(`/policies/versions/${versionId}/publish`),
  deleteVersion:  (versionId: string) => api.delete(`/policies/versions/${versionId}`),
  pdfUrl:         (versionId: string) => `${BASE_URL}/policies/versions/${versionId}/pdf`,
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

// ─── Helpers ─────────────────────────────────────────────────
//
// Open an authenticated PDF (or any auth-gated binary endpoint) in a new tab.
// Plain <a href="…"> tags don't attach the JWT (we keep it in memory, not in a
// cookie), so the API would reject them with NO_TOKEN. We instead fetch the
// resource with the auth header, wrap it in a blob:// URL, and open that.
export async function openAuthPdf(absoluteOrRelativeUrl: string): Promise<void> {
  // Strip the BASE_URL prefix so axios can re-add baseURL + the auth header.
  const relUrl = absoluteOrRelativeUrl.startsWith(BASE_URL)
    ? absoluteOrRelativeUrl.slice(BASE_URL.length)
    : absoluteOrRelativeUrl;
  try {
    const res = await api.get(relUrl, { responseType: 'blob' });
    const blob = res.data instanceof Blob
      ? res.data
      : new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newTab) {
      // Popup blocked — trigger a download fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    // Revoke shortly after; the new tab/download has copied the bytes by then.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error('Failed to open authenticated file', err);
    const e = err as { response?: { data?: unknown } };
    const msg = typeof e.response?.data === 'string'
      ? e.response.data
      : 'Could not open the file. Please try again.';
    alert(msg);
  }
}

// Fetch a PDF and return the blob URL — for embedding in <iframe> or <embed>.
// Caller is responsible for revoking the URL.
export async function fetchAuthPdfBlobUrl(absoluteOrRelativeUrl: string): Promise<string> {
  const relUrl = absoluteOrRelativeUrl.startsWith(BASE_URL)
    ? absoluteOrRelativeUrl.slice(BASE_URL.length)
    : absoluteOrRelativeUrl;
  const res  = await api.get(relUrl, { responseType: 'blob' });
  const blob = res.data instanceof Blob
    ? res.data
    : new Blob([res.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export default api;
