import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import DashboardPage from "@/pages/dashboard-page";
import AuthPage from "@/pages/auth-page";
import MarketPage from "@/pages/market-page";
import SimulationPage from "@/pages/simulation-page";
import HistoryPage from "@/pages/history-page";
import ReportsPage from "@/pages/reports-page";
import ProfilePage from "@/pages/profile-page";
import ApiKeysPage from "@/pages/api-keys-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/market" component={MarketPage} />
      <ProtectedRoute path="/simulation" component={SimulationPage} />
      <ProtectedRoute path="/history" component={HistoryPage} />
      <ProtectedRoute path="/reports" component={ReportsPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/api-keys" component={ApiKeysPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
