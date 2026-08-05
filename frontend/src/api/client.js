import axios from 'axios';

// On Vercel the API is same-origin under /api, so the base must be ''. A
// plain `||` would treat '' as falsy and fall back to localhost, which is
// exactly the bug that only shows up once deployed.
const RAW_BASE = process.env.REACT_APP_BACKEND_URL;
const API_BASE = RAW_BASE !== undefined && RAW_BASE !== null
  ? RAW_BASE
  : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8001');

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
    /* Some calls are best-effort mirrors that a logged-out visitor is
       expected to fail: the cookie banner writes its choice to localStorage
       and then tries to mirror it to the server for the GDPR audit trail.
       That POST 401s for anonymous visitors — which is fine and its own
       catch says so — but this interceptor fired first and navigated the
       page. The result: answering the cookie banner threw every logged-out
       visitor onto the sign-in form, from the privacy policy, from
       forgot-password, and from the payment, quote and accountant links sent
       to people who have no account at all. */
    const optional = error?.config?.skipAuthRedirect === true;
    if (status === 401 && !isAuthBootstrap && !optional
        && !redirecting && typeof window !== 'undefined') {
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
/* A server's default reason phrase is not a message for a person. FastAPI
   answers a missing route with `detail: "Not Found"`, and several screens
   printed that verbatim — a pro clicking "Claim your badge" was shown the
   words "Not Found" and nothing else. */
const GENERIC = new Set([
  'Not Found', 'Internal Server Error', 'Method Not Allowed', 'Bad Request',
  'Unprocessable Entity', 'Forbidden', 'Unauthorized', 'Service Unavailable',
]);

export function formatError(e) {
  const detail = e?.response?.data?.detail;
  if (!detail) return e?.message || 'Something went wrong. Please try again.';
  if (typeof detail === 'string') {
    return GENERIC.has(detail.trim())
      ? 'This is not available right now. Please try again later.'
      : detail;
  }
  if (Array.isArray(detail)) return detail.map(d => d?.msg || String(d)).filter(Boolean).join(' ');
  return String(detail);
}

export default api;
