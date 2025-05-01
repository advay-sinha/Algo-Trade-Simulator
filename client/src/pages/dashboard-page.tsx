import Layout from "@/components/layout/layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import MarketOverview from "@/components/dashboard/market-overview";
import ActiveSimulations from "@/components/dashboard/active-simulations";
import TradeActivity from "@/components/dashboard/trade-activity";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import Trading from "@/pages/Trading";

interface DashboardStats {
  portfolioValue: number;
  portfolioChange: number;
  dailyPnL: number;
  dailyPnLChange: number;
  activeStrategies: number;
  totalTrades: number;
  tradeChange: number;
}

export default function DashboardPage() {
  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ["dashboardStats"],
    queryFn: () =>
      fetch("/api/simulation/simulations/active")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch data");
          return res.json();
        })
        .then((activeSimulations) => {
          const simulationsArray = Array.isArray(activeSimulations) ? activeSimulations : [];
          
          return {
            portfolioValue: simulationsArray.reduce((sum, sim) => sum + (sim.initialInvestment || 0), 0) || 128750,
            portfolioChange: 8.2,
            dailyPnL: simulationsArray.reduce((sum, sim) => sum + (sim.profitLoss || 0), 0) || 2450,
            dailyPnLChange: 1.9,
            activeStrategies: simulationsArray.length || 3,
            totalTrades: simulationsArray.reduce((sum, sim) => sum + (sim.totalTrades || 0), 0) || 42,
            tradeChange: 12,
          };
        })
  });

  if (error) return <div>Error loading dashboard: {error.message}</div>;

  return (
    <Layout title="Dashboard">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      
        {isLoading
          ? Array(4)
              .fill(null)
              .map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg p-5">
                  <div className="flex items-center">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="ml-5 w-0 flex-1">
                      <Skeleton className="h-5 w-32 mb-2" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                </div>
              ))
          : stats && (
              <>
                <StatsCard
                  title="Total Portfolio Value"
                  value={`₹${stats.portfolioValue.toLocaleString("en-IN")}`}
                  change={`${stats.portfolioChange}%`}
                  changeType="positive"
                  icon="portfolio"
                />
                <StatsCard
                  title="Today's P&L"
                  value={`₹${stats.dailyPnL.toLocaleString("en-IN")}`}
                  change={`${stats.dailyPnLChange}%`}
                  changeType="positive"
                  icon="pnl"
                />
                <StatsCard title="Active Strategies" value={stats.activeStrategies} icon="strategies" />
                <StatsCard title="Total Trades" value={stats.totalTrades} change={stats.tradeChange} changeType="positive" icon="trades" />
              </>
            )}
      </div>

      {/* Market Overview */}
      <MarketOverview />
      <div className="mt-6">
        <Trading />
      </div>
      {/* Active Simulations */}
      <ActiveSimulations />
      {/* Recent Trade Activity */}
      {/* <TradeActivity /> */}

      {/* Manual Trading */}
      
    </Layout>
  );
}
