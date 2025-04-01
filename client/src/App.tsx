import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ErrorBoundary } from "react-error-boundary";

import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import DashboardPage from "@/pages/dashboard-page";
import SimulatorPage from "@/pages/simulator-page";
import PerformancePage from "@/pages/performance-page";
import StrategiesPage from "@/pages/strategies-page";
import SettingsPage from "@/pages/settings-page";
import MarketPage from "@/pages/market-page";
import TradingPage from "./pages/Trading";
import { ProtectedRoute } from "@/lib/protected-route";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Reload Page
      </button>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Switch>
        <Route path="/" component={HomePage} />
        <ProtectedRoute path="/dashboard" component={DashboardPage} />
        <ProtectedRoute path="/simulator" component={SimulatorPage} />
        <ProtectedRoute path="/performance" component={PerformancePage} />
        <ProtectedRoute path="/strategies" component={StrategiesPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/market" component={MarketPage} />
        <ProtectedRoute path="/trading" component={TradingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="algotrade-theme">
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
