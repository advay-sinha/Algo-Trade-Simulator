import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import MarketSummaryCard from "@/components/market-summary-card";
import SimulationForm from "@/components/simulation-form";
import PerformanceChart from "@/components/performance-chart";
import ActiveSimulations from "@/components/active-simulations";
import TradeHistory from "@/components/trade-history";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: marketData, isLoading: isLoadingMarketData } = useQuery({
    queryKey: ['/api/market/summary'],
  });

  const { data: activeSimulations, isLoading: isLoadingSimulations } = useQuery({
    queryKey: ['/api/simulations/active'],
  });

  const { data: tradeHistory, isLoading: isLoadingTrades } = useQuery({
    queryKey: ['/api/trades/recent'],
  });

  return (
    <DashboardLayout>
      {/* Dashboard Content */}
      <div className="p-6">
        {/* Market Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {isLoadingMarketData ? (
            <>
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </>
          ) : (
            marketData?.map((item: any) => (
              <MarketSummaryCard 
                key={item.symbol}
                symbol={item.symbol}
                price={item.price}
                change={item.change}
                changePercent={item.changePercent}
                chartData={item.chartData}
              />
            ))
          )}
        </div>
        
        {/* Simulation Panel & Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Simulation Control Panel */}
          <SimulationForm />
          
          {/* Performance Chart */}
          <div className="lg:col-span-2">
            <PerformanceChart />
          </div>
        </div>
        
        {/* Active Simulations and Trade History */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Simulations */}
          <ActiveSimulations 
            isLoading={isLoadingSimulations}
            simulations={activeSimulations || []}
          />
          
          {/* Trade History */}
          <TradeHistory 
            isLoading={isLoadingTrades}
            trades={tradeHistory || []}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
