import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Trophy, ArrowLeftRight, Percent } from "lucide-react";

interface PerformanceStats {
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  winRate: number;
  winRateChange: number;
  totalTrades: number;
  avgReturnPerTrade: number;
}

interface PerformanceSummaryProps {
  stats?: PerformanceStats;
  isLoading: boolean;
}

export default function PerformanceSummary({ stats, isLoading }: PerformanceSummaryProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center">
                <Skeleton className="h-12 w-12 rounded-md mr-5" />
                <div className="w-0 flex-1">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Profit/Loss */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-100 dark:bg-green-900 rounded-md p-3">
              <TrendingUp className="text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Profit/Loss</dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    ₹{stats.totalProfitLoss.toLocaleString("en-IN")}
                  </div>
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {stats.totalProfitLossPercentage.toFixed(1)}%
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Win Rate */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-primary-100 dark:bg-primary-900 rounded-md p-3">
              <Trophy className="text-primary-600 dark:text-primary-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Win Rate</dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.winRate.toFixed(1)}%
                  </div>
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {stats.winRateChange.toFixed(1)}%
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Trades */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-secondary-100 dark:bg-secondary-900 rounded-md p-3">
              <ArrowLeftRight className="text-secondary-600 dark:text-secondary-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Trades</dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.totalTrades}
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Avg. Return/Trade */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-amber-100 dark:bg-amber-900 rounded-md p-3">
              <Percent className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Avg. Return/Trade</dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {stats.avgReturnPerTrade.toFixed(2)}%
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
