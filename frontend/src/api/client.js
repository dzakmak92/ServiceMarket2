import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Global 401 handler — silently redirect to /auth when the session expires,
// rather than leaving every page to handle it. Skip the /auth/me bootstrap
// call so the AuthContext can decide whether the user is logged in or not.
let redirecting = false;
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const isAuthBootstrap = url.includes('/api/auth/me') || url.includes('/api/auth/login') || url.includes('/api/auth/register');
    if (status === 401 && !isAuthBootstrap && !redirecting && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/auth') {
        redirecting = true;
        // Defer to next tick so any in-flight setState completes first.
        setTimeout(() => {
          redirecting = false;
          window.location.assign(`/auth?next=${encodeURIComponent(path)}`);
        }, 50);
      }
    }
    return Promise.reject(error);
  }
);

// Format API error detail (handles string or array)
export function formatError(e) {
  const detail = e?.response?.data?.detail;
  if (!detail) return e?.message || 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => d?.msg || String(d)).filter(Boolean).join(' ');
  return String(detail);
}

export default api;
