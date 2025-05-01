import Layout from "@/components/layout/layout";
import PerformanceSummary from "@/components/performance/performance-summary";
import PerformanceChart from "@/components/performance/performance-chart";
import StrategyComparison from "@/components/performance/strategy-comparison";
import AssetPerformance from "@/components/performance/asset-performance";
import { useQuery } from "@tanstack/react-query";

interface PerformanceStats {
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  winRate: number;
  winRateChange: number;
  totalTrades: number;
  avgReturnPerTrade: number;
}

export default function PerformancePage() {
  // Fetch performance statistics
  const { data: stats, isLoading: statsLoading } = useQuery<PerformanceStats>({
    queryKey: ["/api/simulation/performance/stats"],
    queryFn: async () => {
      // In production, this would fetch from the API
      // For now, return placeholder data that will be replaced with real API data
      return {
        totalProfitLoss: 18450,
        totalProfitLossPercentage: 12.3,
        winRate: 68.5,
        winRateChange: 3.2,
        totalTrades: 145,
        avgReturnPerTrade: 1.85
      };
    }
  });

  return (
    <Layout title="Performance Analysis">
      {/* Performance Summary Cards */}
      <PerformanceSummary stats={stats} isLoading={statsLoading} />
      
      {/* Performance Chart */}
      <PerformanceChart />
      
      {/* Strategy Performance Comparison */}
      <StrategyComparison />
      
      {/* Performance by Asset */}
      <AssetPerformance />
    </Layout>
  );
}
