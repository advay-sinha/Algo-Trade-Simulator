import { useState } from "react";
import DashboardLayout from "@/components/layouts/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import MetricsCard from "@/components/dashboard/metrics-card";
import PerformanceChart from "@/components/dashboard/performance-chart";
import AssetAllocationChart from "@/components/dashboard/asset-allocation-chart";
import RecentTrades from "@/components/dashboard/recent-trades";
import Watchlist from "@/components/dashboard/watchlist";

export default function DashboardPage() {
  // Fetch dashboard data
  const { data: portfolioData, isLoading: portfolioLoading } = useQuery({
    queryKey: ["/api/portfolio/summary"],
  });

  const { data: recentTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ["/api/trades/recent"],
  });

  const { data: watchlist, isLoading: watchlistLoading } = useQuery({
    queryKey: ["/api/watchlist"],
  });

  // Time period filter for performance chart
  const [chartPeriod, setChartPeriod] = useState<"1D" | "1W" | "1M" | "3M" | "1Y">("1D");

  return (
    <DashboardLayout>
      {/* Dashboard Overview - Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MetricsCard 
          title="Portfolio Value"
          value="₹1,28,450"
          change="+₹3,240"
          changePercent="+2.58%"
          changeType="increase"
          timePeriod="Since yesterday"
          icon="ri-wallet-3-line"
          iconColor="text-primary"
          iconBgColor="bg-blue-50"
          isLoading={portfolioLoading}
        />
        
        <MetricsCard 
          title="Today's Profit"
          value="₹854"
          change="+₹154"
          changePercent="+22%"
          changeType="increase"
          timePeriod="Since last trade"
          icon="ri-line-chart-line"
          iconColor="text-green-600"
          iconBgColor="bg-green-50"
          isLoading={portfolioLoading}
        />
        
        <MetricsCard 
          title="Success Rate"
          value="68.5%"
          change="+2.4%"
          changePercent=""
          changeType="increase"
          timePeriod="Past 7 days"
          icon="ri-percent-line"
          iconColor="text-purple-600"
          iconBgColor="bg-purple-50"
          isLoading={portfolioLoading}
        />
      </div>
      
      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow lg:col-span-2 overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-700">Portfolio Performance</h2>
              <div className="flex items-center space-x-2">
                {["1D", "1W", "1M", "3M", "1Y"].map((period) => (
                  <button 
                    key={period}
                    className={`px-3 py-1 text-xs font-medium rounded-md ${
                      chartPeriod === period 
                        ? "bg-blue-50 text-primary" 
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                    onClick={() => setChartPeriod(period as any)}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-5">
            <PerformanceChart 
              period={chartPeriod} 
              isLoading={portfolioLoading}
            />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow">
          <div className="p-5 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-700">Asset Allocation</h2>
          </div>
          <div className="p-5">
            <AssetAllocationChart 
              isLoading={portfolioLoading}
            />
          </div>
        </div>
      </div>
      
      {/* Recent Trades & Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <RecentTrades 
          isLoading={tradesLoading} 
          trades={recentTrades} 
        />
        
        <Watchlist 
          isLoading={watchlistLoading}
          watchlist={watchlist}
        />
      </div>
    </DashboardLayout>
  );
}
