import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AnimatePresence, motion } from "framer-motion";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import LoginPage from "@/pages/login";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import TermsOfServicePage from "@/pages/terms-of-service";
import Dashboard from "@/pages/dashboard";
import SearchPage from "@/pages/search";
import OwnersPage from "@/pages/owners";
import OwnerDossierPage from "@/pages/owner-dossier";
import PropertiesPage from "@/pages/properties";
import DossiersPage from "@/pages/dossiers";
import LLCsPage from "@/pages/llcs";
import LlcDossierPage from "@/pages/llc-dossier";
import UnifiedDossierPage from "@/pages/unified-dossier";
import SettingsPage from "@/pages/settings";
import AdminBugReportsPage from "@/pages/admin-bug-reports";
import AdminApiUsagePage from "@/pages/admin-api-usage";
import AdminFirmsTiersPage from "@/pages/admin-firms-tiers";
import SignupPage from "@/pages/signup";
import MapView from "@/pages/map-view";
import BulkEnrichmentPage from "@/pages/bulk-enrichment";
import { BugReportWidget } from "@/components/bug-report-widget";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { CookieConsent } from "@/components/cookie-consent";
import { NoFirmAccess } from "@/components/no-firm-access";
import { UsageIndicator, UsageBanner } from "@/components/usage-indicator";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      {/* Skip to content link for keyboard navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        data-testid="link-skip-to-content"
      >
        Skip to main content
      </a>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" aria-label="Toggle sidebar" />
            <div className="flex items-center gap-2">
              <UsageIndicator />
              <KeyboardShortcutsModal />
              <ThemeToggle />
            </div>
          </header>
          <UsageBanner />
          <main id="main-content" className="flex-1 overflow-auto p-6" tabIndex={-1}>{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  const isAdmin = user?.role === "admin";
  const hasFirmAccess = !!user?.firmId || isAdmin;

  if (!hasFirmAccess) {
    return <NoFirmAccess />;
  }

  return (
    <AuthenticatedLayout>
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/search" component={SearchPage} />
            <Route path="/owners" component={OwnersPage} />
            <Route path="/owners/:id" component={OwnerDossierPage} />
            <Route path="/properties" component={PropertiesPage} />
            <Route path="/dossiers" component={DossiersPage} />
            <Route path="/llcs" component={LLCsPage} />
            <Route path="/llcs/:id" component={LlcDossierPage} />
            <Route path="/dossier/:id" component={UnifiedDossierPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/admin/bug-reports" component={AdminBugReportsPage} />
            <Route path="/admin/api-usage" component={AdminApiUsagePage} />
            <Route path="/admin/firms-tiers" component={AdminFirmsTiersPage} />
            <Route path="/map" component={MapView} />
            <Route path="/bulk-enrichment" component={BulkEnrichmentPage} />
            <Route path="/privacy" component={PrivacyPolicyPage} />
            <Route path="/terms" component={TermsOfServicePage} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
      <BugReportWidget />
    </AuthenticatedLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="freyja-iq-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
          <CookieConsent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
