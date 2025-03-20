import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import MobileNav from "@/components/layout/mobile-nav";
import SimulationForm from "@/components/dashboard/simulation-form";
import StatsCard from "@/components/dashboard/stats-card";
import MarketChart from "@/components/dashboard/market-chart";
import RecentTrades from "@/components/dashboard/recent-trades";
import StrategyPerformance from "@/components/dashboard/strategy-performance";
import MarketOverview from "@/components/dashboard/market-overview";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Simulation, Trade } from "@shared/schema";
import { RupeeSign, TrendingUp, Percent, Coins } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();

  // Fetch user's active simulations
  const { data: simulations, isLoading: simulationsLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulations"],
    enabled: !!user,
  });

  // Fetch user's recent trades
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
    enabled: !!user,
  });

  // Get the latest simulation if available
  const latestSimulation = simulations && simulations.length > 0 
    ? simulations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
    : null;

  // Get the icon based on the stats type
  const getStatIcon = (type: string) => {
    switch (type) {
      case "balance":
        return <RupeeSign className="h-5 w-5" />;
      case "profit":
        return <TrendingUp className="h-5 w-5" />;
      case "success":
        return <Percent className="h-5 w-5" />;
      case "average":
        return <Coins className="h-5 w-5" />;
      default:
        return <TrendingUp className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <TopNavbar />
        
        {/* Dashboard Content */}
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Overview of your trading simulation and market insights
              </p>
            </div>
            
            {/* Simulation Form */}
            <SimulationForm />
            
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <StatsCard
                title="Current Balance"
                value={latestSimulation?.finalBalance ?? latestSimulation?.initialBalance ?? 100000}
                change={latestSimulation?.profitLossPercent ?? 0}
                suffix="₹"
                description={latestSimulation ? "Current simulation" : "Initial balance"}
                icon={getStatIcon("balance")}
                iconColor="bg-blue-50 text-primary dark:bg-blue-900 dark:bg-opacity-30"
                loading={simulationsLoading}
              />
              
              <StatsCard
                title="Profit/Loss"
                value={latestSimulation?.profitLoss ?? 0}
                suffix="₹"
                description={`Based on ${latestSimulation?.totalTrades ?? 0} trades`}
                icon={getStatIcon("profit")}
                iconColor="bg-green-50 text-green-500 dark:bg-green-900 dark:bg-opacity-30"
                valueColor={latestSimulation?.profitLoss && latestSimulation.profitLoss > 0 ? "text-green-500" : "text-red-500"}
                prefix={latestSimulation?.profitLoss && latestSimulation.profitLoss > 0 ? "+" : ""}
                loading={simulationsLoading}
              />
              
              <StatsCard
                title="Success Rate"
                value={latestSimulation?.successRate ?? 0}
                suffix="%"
                description={`${latestSimulation?.successfulTrades ?? 0} of ${latestSimulation?.totalTrades ?? 0} profitable trades`}
                icon={getStatIcon("success")}
                iconColor="bg-purple-50 text-purple-500 dark:bg-purple-900 dark:bg-opacity-30"
                loading={simulationsLoading}
              />
              
              <StatsCard
                title="Avg. Profit/Trade"
                value={latestSimulation?.avgProfitPerTrade ?? 0}
                suffix="₹"
                change={latestSimulation?.avgProfitPerTrade ? 3.2 : 0}
                description="Compared to previous"
                icon={getStatIcon("average")}
                iconColor="bg-yellow-50 text-yellow-500 dark:bg-yellow-900 dark:bg-opacity-30"
                loading={simulationsLoading}
              />
            </div>
            
            {/* Chart and Recent Trades */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Chart */}
              <div className="lg:col-span-2">
                <MarketChart 
                  symbol={latestSimulation?.symbol ?? "HDFCBANK.NS"} 
                  loading={simulationsLoading} 
                />
              </div>
              
              {/* Recent Trades */}
              <RecentTrades trades={trades} loading={tradesLoading} />
            </div>
            
            {/* Strategies Performance & Market Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StrategyPerformance loading={simulationsLoading} />
              <MarketOverview loading={simulationsLoading} />
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <MobileNav />
      </main>
    </div>
  );
}
