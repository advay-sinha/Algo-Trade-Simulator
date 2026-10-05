import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { devAuthBypass, type DevAuthBypassPayload } from "./api";
import { AppShell } from "./components/layout/AppShell";
import { SkeletonRows } from "./components/ui/primitives";
import { AuthPage } from "./pages/AuthPage";
import { SessionProvider, useSession } from "./lib/session";

// Route-level code splitting: each section loads on first visit.
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const MonitorPage = lazy(() => import("./pages/MonitorPage").then((m) => ({ default: m.MonitorPage })));
const EnginesPage = lazy(() => import("./pages/EnginesPage").then((m) => ({ default: m.EnginesPage })));
const EngineDetailPage = lazy(() => import("./pages/EngineDetailPage").then((m) => ({ default: m.EngineDetailPage })));
const LabPage = lazy(() => import("./pages/LabPage").then((m) => ({ default: m.LabPage })));
const DatasetsPage = lazy(() => import("./pages/DatasetsPage").then((m) => ({ default: m.DatasetsPage })));
const ModelsPage = lazy(() => import("./pages/ModelsPage").then((m) => ({ default: m.ModelsPage })));
const ModelDetailPage = lazy(() => import("./pages/ModelDetailPage").then((m) => ({ default: m.ModelDetailPage })));
const BacktestsPage = lazy(() => import("./pages/BacktestsPage").then((m) => ({ default: m.BacktestsPage })));
const BacktestDetailPage = lazy(() => import("./pages/BacktestDetailPage").then((m) => ({ default: m.BacktestDetailPage })));
const StrategyLabPage = lazy(() => import("./pages/StrategyLabPage").then((m) => ({ default: m.StrategyLabPage })));
const ResearchRunPage = lazy(() => import("./pages/ResearchRunPage").then((m) => ({ default: m.ResearchRunPage })));
const RankingModelPage = lazy(() => import("./pages/RankingModelPage").then((m) => ({ default: m.RankingModelPage })));
const MarketFlowsPage = lazy(() => import("./pages/MarketFlowsPage").then((m) => ({ default: m.MarketFlowsPage })));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage })));
const SimulationDetailPage = lazy(() => import("./pages/SimulationDetailPage").then((m) => ({ default: m.SimulationDetailPage })));
const SimulationsPage = lazy(() => import("./pages/SimulationsPage").then((m) => ({ default: m.SimulationsPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const PriceHistoryPage = lazy(() => import("./pages/PriceHistoryPage").then((m) => ({ default: m.PriceHistoryPage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const SafetyPage = lazy(() => import("./pages/SafetyPage").then((m) => ({ default: m.SafetyPage })));

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const LOGIN_BYPASS_ENABLED = TRUTHY.has((import.meta.env.VITE_ENABLE_LOGIN_BYPASS ?? "").trim().toLowerCase());

function PageFallback() {
  return (
    <div className="page" aria-busy="true">
      <SkeletonRows rows={6} />
    </div>
  );
}

/** Local-development convenience: auto sign-in via the backend's dev bypass when enabled. */
function useDevBypass(): boolean {
  const { token, signIn } = useSession();
  const [pending, setPending] = useState(LOGIN_BYPASS_ENABLED && !token);
  const attempted = useRef(false);

  useEffect(() => {
    if (!LOGIN_BYPASS_ENABLED || token || attempted.current) {
      setPending(false);
      return;
    }
    attempted.current = true;
    const email = import.meta.env.VITE_LOGIN_BYPASS_EMAIL?.trim();
    const name = import.meta.env.VITE_LOGIN_BYPASS_NAME?.trim();
    const payload: DevAuthBypassPayload | undefined = email || name ? { email: email || undefined, name: name || undefined } : undefined;
    devAuthBypass(payload)
      .then(signIn)
      .catch(() => undefined) // Falls back to the normal sign-in screen.
      .finally(() => setPending(false));
  }, [token, signIn]);

  return pending;
}

function AppRoutes() {
  const { token, user } = useSession();
  const bypassPending = useDevBypass();

  if (bypassPending) return <div className="splash">Signing you in…</div>;
  if (!token || !user) return <AuthPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <OverviewPage />
            </Suspense>
          }
        />
        {[
          { path: "monitor", element: <MonitorPage /> },
          { path: "flows", element: <MarketFlowsPage /> },
          { path: "engines", element: <EnginesPage /> },
          { path: "engines/:engineId", element: <EngineDetailPage /> },
          { path: "lab", element: <LabPage /> },
          { path: "lab/datasets", element: <DatasetsPage /> },
          { path: "lab/models", element: <ModelsPage /> },
          { path: "lab/models/:modelId", element: <ModelDetailPage /> },
          { path: "lab/strategies", element: <StrategyLabPage /> },
          { path: "lab/runs/:runId", element: <ResearchRunPage /> },
          { path: "lab/ranking/:experimentId", element: <RankingModelPage /> },
          { path: "backtests", element: <BacktestsPage /> },
          { path: "backtests/:backtestId", element: <BacktestDetailPage /> },
          { path: "simulations", element: <SimulationsPage /> },
          { path: "simulations/:simulationId", element: <SimulationDetailPage /> },
          { path: "portfolio", element: <PortfolioPage /> },
          { path: "research", element: <ResearchPage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "history/prices", element: <PriceHistoryPage /> },
          { path: "safety", element: <SafetyPage /> },
        ].map((route) => (
          <Route key={route.path} path={route.path} element={<Suspense fallback={<PageFallback />}>{route.element}</Suspense>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}
