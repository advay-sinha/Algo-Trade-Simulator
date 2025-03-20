import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, LineChart, Activity, MoveHorizontal } from "lucide-react";

interface StrategyPerformance {
  id: number;
  name: string;
  icon: "mean-reversion" | "momentum" | "rsi" | "moving-average";
  trades: number;
  winRate: number;
  avgReturn: number;
  totalPnL: number;
  drawdown: number;
}

export default function StrategyComparison() {
  // Fetch strategy performance data
  const { data: strategies, isLoading } = useQuery<StrategyPerformance[]>({
    queryKey: ["/api/simulation/performance/strategies"],
    queryFn: async () => {
      // In production, this would fetch from the API
      // For now, return realistic-looking data
      return [
        {
          id: 1,
          name: "Mean Reversion",
          icon: "mean-reversion",
          trades: 52,
          winRate: 72.4,
          avgReturn: 1.93,
          totalPnL: 8452,
          drawdown: 5.2
        },
        {
          id: 2,
          name: "Momentum Trading",
          icon: "momentum",
          trades: 38,
          winRate: 65.8,
          avgReturn: 2.15,
          totalPnL: 5920,
          drawdown: 8.7
        },
        {
          id: 3,
          name: "RSI Strategy",
          icon: "rsi",
          trades: 35,
          winRate: 68.6,
          avgReturn: 1.62,
          totalPnL: 3940,
          drawdown: 4.3
        },
        {
          id: 4,
          name: "Moving Average Crossover",
          icon: "moving-average",
          trades: 20,
          winRate: 60.0,
          avgReturn: 1.07,
          totalPnL: 138,
          drawdown: 6.1
        }
      ];
    }
  });

  // Get icon component based on strategy icon type
  const getStrategyIcon = (iconType: string) => {
    switch (iconType) {
      case "mean-reversion":
        return <BarChart className="text-primary-600 dark:text-primary-400" />;
      case "momentum":
        return <LineChart className="text-secondary-600 dark:text-secondary-400" />;
      case "rsi":
        return <Activity className="text-amber-600 dark:text-amber-400" />;
      case "moving-average":
        return <MoveHorizontal className="text-gray-600 dark:text-gray-400" />;
      default:
        return <BarChart className="text-primary-600 dark:text-primary-400" />;
    }
  };

  return (
    <Card className="mt-8 shadow-md">
      <CardHeader>
        <CardTitle>Strategy Performance</CardTitle>
        <CardDescription>Comparison of different trading strategies.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Strategy</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Win Rate</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg. Return</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total P/L</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Drawdown</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                // Loading skeleton
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="ml-4">
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-10" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-10" />
                    </td>
                  </tr>
                ))
              ) : strategies && strategies.length > 0 ? (
                strategies.map((strategy) => (
                  <tr key={strategy.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                          {getStrategyIcon(strategy.icon)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{strategy.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{strategy.trades}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">{strategy.winRate.toFixed(1)}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">{strategy.avgReturn.toFixed(2)}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                      ₹{strategy.totalPnL.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {strategy.drawdown.toFixed(1)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No strategy performance data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
