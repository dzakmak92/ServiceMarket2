import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/App.css";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import api from "./api/client";
import { startAutoFlush } from "./offline/queue";
import { LangProvider } from "./contexts/LangContext";
import { CookieConsentProvider } from "./contexts/CookieConsentContext";

import Header from "./components/Header";
import MobileNav from "./components/MobileNav";
import InstallPrompt from "./components/InstallPrompt";
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
import MyInvoicesPage from "./pages/pro/MyInvoicesPage";
import CustomersPage from "./pages/pro/CustomersPage";
import QuotesPage from "./pages/pro/QuotesPage";
import LeadCapturePage from "./pages/pro/LeadCapturePage";
import ProCalendarPage from "./pages/pro/ProCalendarPage";
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
    location.pathname === "/privacy" ||
    location.pathname === "/terms" ||
    location.pathname === "/imprint" ||
    location.pathname === "/data-rights" ||
    location.pathname === "/remove";
  const showChrome = !!user && !hideChrome;

  return (
    <div className="App min-h-screen bg-cream">
      {showChrome && <Header />}

      <Routes>
        <Route path="/auth" element={<AuthRoute />} />
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
          path="/leads/new"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <LeadCapturePage />
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
          path="/my-invoices"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <MyInvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pro-calendar"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <ProCalendarPage />
            </ProtectedRoute>
          }
        />
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

      {showChrome && <MobileNav />}
      {showChrome && <InstallPrompt />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LangProvider>
        <AuthProvider>
          <CookieConsentProvider>
            <AppShell />
            <Toaster position="top-right" richColors closeButton />
          </CookieConsentProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  );
}
