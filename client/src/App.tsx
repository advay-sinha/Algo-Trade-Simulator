import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSimulation,
  deleteSimulation,
  fetchSimulations,
  fetchWatchlist,
  login,
  signup,
  updateSimulation,
  type AuthResponse,
} from "./api";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { SignupForm } from "./components/SignupForm";
import type { MarketQuote, Simulation, SimulationInput, SimulationUpdate, User } from "./types";

const WATCHLIST_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"];

type View = "login" | "signup" | "dashboard";

interface SessionState {
  token: string;
  user: User;
}

export default function App() {
  const [view, setView] = useState<View>("login");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<MarketQuote[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("algo-trade-session");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SessionState;
        if (parsed.token && parsed.user) {
          setToken(parsed.token);
          setUser(parsed.user);
          setView("dashboard");
        }
      } catch (storageError) {
        console.warn("Failed to parse stored session", storageError);
        window.localStorage.removeItem("algo-trade-session");
      }
    }
  }, []);

  useEffect(() => {
    if (token && user) {
      const payload: SessionState = { token, user };
      window.localStorage.setItem("algo-trade-session", JSON.stringify(payload));
    } else {
      window.localStorage.removeItem("algo-trade-session");
    }
  }, [token, user]);

  const loadDashboardData = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [quotes, storedSimulations] = await Promise.all([
        fetchWatchlist(WATCHLIST_SYMBOLS),
        fetchSimulations(token),
      ]);
      setWatchlist(quotes);
      setSimulations(storedSimulations);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (view === "dashboard" && token) {
      void loadDashboardData();
    }
  }, [view, token, loadDashboardData]);

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    setToken(response.token);
    setUser(response.user);
    setView("dashboard");
  }, []);

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await login({ email, password });
        handleAuthSuccess(response);
      } catch (authError) {
        console.error(authError);
        setError(authError instanceof Error ? authError.message : "Unable to sign in.");
      } finally {
        setLoading(false);
      }
    },
    [handleAuthSuccess],
  );

  const handleSignup = useCallback(
    async (name: string, email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await signup({ name, email, password });
        handleAuthSuccess(response);
      } catch (authError) {
        console.error(authError);
        setError(authError instanceof Error ? authError.message : "Unable to create account.");
      } finally {
        setLoading(false);
      }
    },
    [handleAuthSuccess],
  );

  const handleCreateSimulation = useCallback(
    async (payload: SimulationInput) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const created = await createSimulation(token, payload);
        setSimulations((previous) => [created, ...previous]);
      } catch (simulationError) {
        console.error(simulationError);
        setError(
          simulationError instanceof Error ? simulationError.message : "Unable to create simulation.",
        );
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const handleUpdateSimulation = useCallback(
    async (id: string, update: SimulationUpdate) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const updated = await updateSimulation(token, id, update);
        setSimulations((previous) =>
          previous.map((simulation) => (simulation.id === updated.id ? updated : simulation)),
        );
      } catch (updateError) {
        console.error(updateError);
        setError(updateError instanceof Error ? updateError.message : "Unable to update simulation.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const handleDeleteSimulation = useCallback(
    async (id: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        await deleteSimulation(token, id);
        setSimulations((previous) => previous.filter((simulation) => simulation.id !== id));
      } catch (deleteError) {
        console.error(deleteError);
        setError(deleteError instanceof Error ? deleteError.message : "Unable to delete simulation.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setSimulations([]);
    setWatchlist([]);
    setView("login");
  }, []);

  const authError = useMemo(() => (view === "dashboard" ? null : error), [view, error]);

  if (!token || !user || view !== "dashboard") {
    return view === "signup" ? (
      <SignupForm
        loading={loading}
        error={authError}
        onSubmit={handleSignup}
        onSwitchToLogin={() => {
          setError(null);
          setView("login");
        }}
      />
    ) : (
      <LoginForm
        loading={loading}
        error={authError}
        onSubmit={handleLogin}
        onSwitchToSignup={() => {
          setError(null);
          setView("signup");
        }}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      watchlist={watchlist}
      simulations={simulations}
      onRefreshWatchlist={loadDashboardData}
      onCreateSimulation={handleCreateSimulation}
      onUpdateSimulation={handleUpdateSimulation}
      onDeleteSimulation={handleDeleteSimulation}
      onLogout={handleLogout}
      loading={loading}
      error={error}
    />
  );
}
