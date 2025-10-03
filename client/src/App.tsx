import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSimulation,
  deleteSimulation,
  fetchSimulations,
  fetchWatchlist,
  login,
  signup,
  updateSimulation,
  devAuthBypass,
  type AuthResponse,
  type DevAuthBypassPayload,
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

const TRUTHY_ENV_FLAGS = new Set(["1", "true", "yes", "on"]);

function isEnvFlagEnabled(value: string | undefined) {
  if (!value) {
    return false;
  }
  return TRUTHY_ENV_FLAGS.has(value.trim().toLowerCase());
}

const LOGIN_BYPASS_ENABLED = isEnvFlagEnabled(import.meta.env.VITE_ENABLE_LOGIN_BYPASS);
const LOGIN_BYPASS_EMAIL = import.meta.env.VITE_LOGIN_BYPASS_EMAIL;
const LOGIN_BYPASS_NAME = import.meta.env.VITE_LOGIN_BYPASS_NAME;
const LOGIN_BYPASS_PATH = "/dev/auth/bypass";

export default function App() {
  const [view, setView] = useState<View>("login");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<MarketQuote[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bypassRequestedFromPath] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.location.pathname === LOGIN_BYPASS_PATH;
  });
  const loginBypassEnabled = LOGIN_BYPASS_ENABLED || bypassRequestedFromPath;
  const [initializingBypass, setInitializingBypass] = useState(loginBypassEnabled);
  const [bypassInProgress, setBypassInProgress] = useState(false);
  const [bypassFailed, setBypassFailed] = useState(false);

  const bypassPayload = useMemo<DevAuthBypassPayload | undefined>(() => {
    const email = LOGIN_BYPASS_EMAIL?.trim();
    const name = LOGIN_BYPASS_NAME?.trim();
    if (!email && !name) {
      return undefined;
    }
    return {
      email: email || undefined,
      name: name || undefined,
    };
  }, []);

  const shouldAttemptBypass = loginBypassEnabled && !bypassFailed && !token && !user;

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

  useEffect(() => {
    // Attempt developer login bypass when enabled via env flag.
    if (!loginBypassEnabled) {
      setInitializingBypass(false);
      return;
    }

    if (!shouldAttemptBypass) {
      setInitializingBypass(false);
      return;
    }

    if (bypassInProgress) {
      return;
    }

    setBypassInProgress(true);
    setInitializingBypass(true);
    setError(null);
    setLoading(true);

    let cancelled = false;

    const run = async () => {
      try {
        const response = await devAuthBypass(bypassPayload);
        if (cancelled) {
          return;
        }
        if (bypassRequestedFromPath) {
          window.history.replaceState(null, "", "/");
        }
        setBypassFailed(false);
        handleAuthSuccess(response);
      } catch (bypassError) {
        if (cancelled) {
          return;
        }
        console.error(bypassError);
        setBypassFailed(true);
        setError(
          bypassError instanceof Error
            ? `Login bypass failed: ${bypassError.message}`
            : "Login bypass is unavailable. Please sign in manually.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setBypassInProgress(false);
          setInitializingBypass(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loginBypassEnabled, shouldAttemptBypass, bypassInProgress, bypassPayload, handleAuthSuccess, bypassRequestedFromPath]);

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

  if (initializingBypass) {
    return (
      <div
        style={{
          alignItems: "center",
          color: "#e2e8f0",
          display: "flex",
          fontSize: "1.1rem",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        Signing you in...
      </div>
    );
  }

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
