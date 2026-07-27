import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/App.css";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LangProvider } from "./contexts/LangContext";
import { CookieConsentProvider } from "./contexts/CookieConsentContext";

import Header from "./components/Header";
import MobileNav from "./components/MobileNav";
import InstallPrompt from "./components/InstallPrompt";
import HomeownerCompletionReminder from "./components/HomeownerCompletionReminder";
import ProJobCompletionPopup from "./components/ProJobCompletionPopup";

import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";

// Legal / privacy pages (public)
import PrivacyPolicyPage from "./pages/legal/PrivacyPolicyPage";
import TermsPage from "./pages/legal/TermsPage";
import ImprintPage from "./pages/legal/ImprintPage";
import DataRightsPage from "./pages/legal/DataRightsPage";
import RemovalPage from "./pages/legal/RemovalPage";

// Homeowner pages
import HomeownerHome from "./pages/homeowner/HomePage";
import PostJobPage from "./pages/homeowner/PostJobPage";
import FindProsPage from "./pages/homeowner/FindProsPage";
import HomeownerDashboard from "./pages/homeowner/DashboardPage";
import HomeownerProjectsPage from "./pages/homeowner/HomeownerProjectsPage";
import HomeownerProjectDetailPage from "./pages/homeowner/HomeownerProjectDetailPage";
import JobDetailPage from "./pages/homeowner/JobDetailPage";
import SettingsPage from "./pages/homeowner/SettingsPage";

// Pro pages
import ProHomePage from "./pages/pro/ProHomePage";
import BrowseJobsPage from "./pages/pro/BrowseJobsPage";
import MyQuotesPage from "./pages/pro/MyQuotesPage";
import ProDashboard from "./pages/pro/ProDashboardPage";
import BillingPage from "./pages/pro/BillingPage";
import MyInvoicesPage from "./pages/pro/MyInvoicesPage";
import ProCalendarPage from "./pages/pro/ProCalendarPage";
import ProInvoiceEditorPage from "./pages/pro/ProInvoiceEditorPage";
import TaxToolkitPage from "./pages/pro/TaxToolkitPage";
import PMProjectsPage from "./pages/pro/PMProjectsPage";
import MySchedulePage from "./pages/pro/MySchedulePage";
import PMProjectDetailPage from "./pages/pro/PMProjectDetailPage";
import InvoiceFromProjectRedirect from "./pages/pro/InvoiceFromProjectRedirect";
import ProSettingsPage from "./pages/pro/ProSettingsPage";

// Shared pages
import InboxPage from "./pages/shared/InboxPage";
import ProDetailPage from "./pages/shared/ProDetailPage";
import BusinessMapPage from "./pages/shared/BusinessMapPage";

// Admin
import AdminPage from "./pages/admin/AdminPage";

// Search
import SearchPage from "./pages/SearchPage";

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
  if (user.role === "tradesperson") return <ProHomePage />;
  return <HomeownerHome />;
}

function RoleDashboard() {
  const { user } = useAuth();
  if (user.role === "tradesperson") return <ProDashboard />;
  return <HomeownerDashboard />;
}

function RoleSettings() {
  const { user } = useAuth();
  if (user.role === "tradesperson") return <ProSettingsPage />;
  return <SettingsPage />;
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
      {showChrome && user?.role === 'homeowner' && <HomeownerCompletionReminder user={user} />}
      {showChrome && user?.role === 'tradesperson' && <ProJobCompletionPopup user={user} />}

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

        {/* Homeowner-only */}
        <Route
          path="/post-job"
          element={
            <ProtectedRoute roles={["homeowner"]}>
              <PostJobPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:id/edit"
          element={
            <ProtectedRoute roles={["homeowner"]}>
              <PostJobPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/find-pros"
          element={
            <ProtectedRoute roles={["homeowner"]}>
              <FindProsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-projects"
          element={
            <ProtectedRoute roles={["homeowner"]}>
              <HomeownerProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-projects/:id"
          element={
            <ProtectedRoute roles={["homeowner"]}>
              <HomeownerProjectDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Pro-only */}
        <Route
          path="/browse-jobs"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <BrowseJobsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-quotes"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <MyQuotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute roles={["tradesperson"]}>
              <BillingPage />
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
              <RoleDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <RoleSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <InboxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:id"
          element={
            <ProtectedRoute>
              <JobDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pros/:proId"
          element={
            <ProtectedRoute>
              <ProDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <SearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/business-map"
          element={
            <ProtectedRoute roles={["homeowner", "tradesperson"]}>
              <BusinessMapPage />
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
