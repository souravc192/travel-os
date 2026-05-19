import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRouter from './router/index';
import './styles/globals.css';

// ─── React Query client ────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,          // 2 min
      gcTime: 10 * 60 * 1000,            // 10 min
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Apply stored theme before first render ───────────────────
const storedAuth = sessionStorage.getItem('travel-os-auth');
if (storedAuth) {
  try {
    const { state } = JSON.parse(storedAuth);
    if (state?.user?.theme) {
      document.documentElement.setAttribute('data-theme', state.user.theme);
    }
  } catch { /* ignore */ }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </React.StrictMode>
);
