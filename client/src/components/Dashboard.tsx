import type { MarketQuote, Simulation, SimulationInput, SimulationUpdate, User } from "../types";
import { SimulationForm } from "./SimulationForm";
import { SimulationList } from "./SimulationList";
import { Watchlist } from "./Watchlist";

interface DashboardProps {
  user: User;
  watchlist: MarketQuote[];
  simulations: Simulation[];
  onRefreshWatchlist: () => void;
  onCreateSimulation: (payload: SimulationInput) => Promise<void> | void;
  onUpdateSimulation: (id: string, payload: SimulationUpdate) => Promise<void> | void;
  onDeleteSimulation: (id: string) => Promise<void> | void;
  onLogout: () => void;
  loading: boolean;
  error?: string | null;
}

export function Dashboard({
  user,
  watchlist,
  simulations,
  onRefreshWatchlist,
  onCreateSimulation,
  onUpdateSimulation,
  onDeleteSimulation,
  onLogout,
  loading,
  error,
}: DashboardProps) {
  return (
    <main>
      <div className="header">
        <div>
          <h1>Welcome, {user.name}</h1>
          <p style={{ color: "rgba(226,232,240,0.7)", margin: "0.4rem 0 0" }}>
            Track real-time market moves and iterate on your trading strategies.
          </p>
        </div>
        <button type="button" onClick={onLogout} style={{ background: "#ef4444" }}>
          Log out
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="section-grid">
        <Watchlist quotes={watchlist} onRefresh={onRefreshWatchlist} loading={loading} />
        <SimulationForm onSubmit={onCreateSimulation} loading={loading} />
      </div>

      <SimulationList
        simulations={simulations}
        onUpdate={onUpdateSimulation}
        onDelete={onDeleteSimulation}
        loading={loading}
      />
    </main>
  );
}
