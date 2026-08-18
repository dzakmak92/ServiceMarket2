import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/App.css";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import api from "./api/client";
import { startAutoFlush } from "./offline/queue";
import { LangProvider, useLang } from "./contexts/LangContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { CookieConsentProvider, useCookieConsent } from "./contexts/CookieConsentContext";

import Header from "./components/Header";
import MobileNav from "./components/MobileNav";
import InstallPrompt from "./components/InstallPrompt";
import UpdatePrompt from "./components/UpdatePrompt";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";

// Legal / privacy pages (public)
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicyPage";
import TermsPage from "./pages/legal/TermsPage";
import ImprintPage from "./pages/legal/ImprintPage";
import DataRightsPage from "./pages/legal/DataRightsPage";
import RemovalPage from "./pages/legal/RemovalPage";

// Pro pages
import ProHomePage from "./pages/pro/ProHomePage";
import ProDashboard from "./pages/pro/ProDashboardPage";
import BillingPage from "./pages/pro/BillingPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import OverduePage from "./pages/pro/OverduePage";
import MyInvoicesPage from "./pages/pro/MyInvoicesPage";
import CustomersPage from "./pages/pro/CustomersPage";
import CustomerDetailPage from "./pages/pro/CustomerDetailPage";
import QuotesPage from "./pages/pro/QuotesPage";
import QuoteEditorPage from "./pages/pro/QuoteEditorPage";
import LeadCapturePage from "./pages/pro/LeadCapturePage";
import RecurringPage from "./pages/pro/RecurringPage";
import EstimatePage from "./pages/pro/EstimatePage";
import ProInvoiceEditorPage from "./pages/pro/ProInvoiceEditorPage";
import TaxToolkitPage from "./pages/pro/TaxToolkitPage";
import PMProjectsPage from "./pages/pro/PMProjectsPage";
import MySchedulePage from "./pages/pro/MySchedulePage";
import PMProjectDetailPage from "./pages/pro/PMProjectDetailPage";
import InvoiceFromProjectRedirect from "./pages/pro/InvoiceFromProjectRedirect";
import ProSettingsPage from "./pages/pro/ProSettingsPage";

// Admin
import AdminPage from "./pages/admin/AdminPage";

// PM public status page (read-only, no auth)
import PMPublicStatusPage from "./pages/PMPublicStatusPage";
import SubContractorPage from "./pages/SubContractorPage";
import AccountantSharePage from "./pages/AccountantSharePage";
import PayInvoicePage from "./pages/PayInvoicePage";
import PaySuccessPage from "./pages/PaySuccessPage";
import FeedbackPage from "./pages/FeedbackPage";
import { Toaster } from "sonner";

const Loader = () => (
  <div className="min-h-screen bg-cream flex items-center justify-center" data-testid="app-loader">
    <div className="w-10 h-10 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
  </div>
);

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (!user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <ProHomePage />;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (user) {
    if (!user.onboarding_complete) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/" replace />;
  }
  return <AuthPage />;
}

function OnboardingRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (user.onboarding_complete) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}

function AppShell() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  // Replay anything captured offline as soon as the connection returns.
  React.useEffect(() => startAutoFlush(api), []);
  const location = useLocation();

  if (loading) return <Loader />;

  const hideChrome =
    location.pathname === "/auth" ||
    location.pathname === "/onboarding" ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/p/") ||
    location.pathname.startsWith("/sub/") ||
    location.pathname.startsWith("/accountant/") ||
    location.pathname.startsWith("/pay/") ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/privacy" ||
    location.pathname === "/terms" ||
    location.pathname === "/imprint" ||
    location.pathname === "/data-rights" ||
    location.pathname === "/remove";
  const showChrome = !!user && !hideChrome;

  return (
    <div className="App min-h-screen bg-cream">
      {showChrome && <Header />}

      {/* One boundary around the whole route tree. React unmounts the entire
          app on an uncaught render error, so a single bad field reference —
          `monthly_fees` coming back as a list and being handed to toFixed —
          left a tradesperson looking at a blank browser window with no way
          back but the back button. Keyed on the path so navigating away
          clears it. */}
      <ErrorBoundary t={t} key={location.pathname}>
      <Routes>
        <Route path="/auth" element={<AuthRoute />} />
        {/* Public by necessity: the person using these is locked out. Both
            the request form and the redemption form live on one component —
            the mail lands back on /reset-password?token=…. */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ForgotPasswordPage />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />

        {/* Legal & privacy pages — public, reachable by anyone */}
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/imprint" element={<ImprintPage />} />
        <Route path="/data-rights" element={<DataRightsPage />} />
        <Route path="/remove" element={<RemovalPage />} />

        {/* PM public customer status page — no auth required */}
        <Route path="/p/:shareToken" element={<PMPublicStatusPage />} />
        {/* PM sub-contractor scoped page — no auth required */}
        <Route path="/sub/:subToken" element={<SubContractorPage />} />
        {/* Accountant share view — no auth required */}
        <Route path="/accountant/:token" element={<AccountantSharePage />} />
        {/* Customer-facing pay-invoice flow — no auth required */}
        <Route path="/pay/:token" element={<PayInvoicePage />} />
        <Route path="/pay/:token/success" element={<PaySuccessPage />} />
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <FeedbackPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleHome />
            </ProtectedRoute>
          }
        />

        {/* Pro-only */}
        <Route
          path="/billing"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:customerId"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <CustomerDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads/new"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <LeadCapturePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recurring"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <RecurringPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/estimate"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <EstimatePage />
            </ProtectedRoute>
          }
        />
        {/* One component, two states, distinguished by the URL: /estimate is
            the trade cards and /estimate/maler is that trade's templates. A
            real route rather than component state, so back works, the page can
            be shared, and a reload does not drop the pro at the start. */}
        <Route
          path="/estimate/:trade"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <EstimatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotes"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <QuotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotes/:quoteId"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <QuoteEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-invoices"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <MyInvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/overdue"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <OverduePage />
            </ProtectedRoute>
          }
        />
        {/* /pro-calendar is gone. It was superseded by /schedule and had been
            dead for some time: its loader did Promise.all over /api/bookings,
            a router that does not exist, so the whole thing rejected into an
            empty catch and the page never learned its own pro id. All 84
            availability cells were inert — clicking one produced no request
            and no change — and a failed load rendered as the cheerful line
            "Your schedule is beautifully clear". Redirected rather than
            dropped, so an old bookmark still lands somewhere useful. */}
        <Route path="/pro-calendar" element={<Navigate to="/schedule" replace />} />
        <Route
          path="/jobs/:jobId/invoice"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <ProInvoiceEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tax"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <TaxToolkitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <PMProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <MySchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <PMProjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoice-from-project/:id"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <InvoiceFromProjectRedirect />
            </ProtectedRoute>
          }
        />

        {/* Shared */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ProDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <ProSettingsPage />
            </ProtectedRoute>
          }
        />
        {/* Admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>

      {showChrome && <MobileNav />}

      {showChrome && <BottomPrompts />}
    </div>
  );
}

/**
 * The bottom-left stack: install nudge, then update banner.
 *
 * Three separate components were each positioning themselves `fixed bottom-20`
 * — the cookie banner, the install prompt and the update banner — so whenever
 * two of them had something to say they were drawn on the same strip of screen.
 * The update banner is the one with the highest z-index, which meant it landed
 * on top of the cookie banner and covered the accept buttons of a legal gate.
 *
 * These two now share one column so they stack instead of overlapping, and the
 * column yields entirely while the cookie banner is up: consent is a gate, it
 * is answered once, and nothing may sit over it. `pointer-events-none` on the
 * column keeps the gap between the cards from swallowing taps meant for the
 * page underneath; each card turns them back on for itself.
 */
function BottomPrompts() {
  const { bannerVisible } = useCookieConsent();
  if (bannerVisible) return null;
  return (
    <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:max-w-sm
                    z-[300] flex flex-col gap-2 pointer-events-none">
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}

/**
 * Applies the language the account was created in.
 *
 * It has to live here rather than inside `LangProvider`, because the language
 * provider wraps the auth one — the interface needs words before it knows who
 * is looking at it. So the account's answer arrives later, and this carries it
 * across. It renders nothing.
 */
function AccountLanguage() {
  const { user } = useAuth();
  const { adoptAccountLang } = useLang();
  useEffect(() => {
    if (user?.lang) adoptAccountLang(user.lang);
  }, [user?.lang, adoptAccountLang]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LangProvider>
        <AuthProvider>
          <AccountLanguage />
          <CookieConsentProvider>
            <AppShell />
            <Toaster position="top-right" richColors closeButton />
          </CookieConsentProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  );
}
