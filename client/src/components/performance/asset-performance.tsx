import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface AssetPerformance {
  symbol: string;
  name: string;
  value: number;
  performance: number;
  color: string;
}

export default function AssetPerformance() {
  // Fetch asset performance data
  const { data: assetData, isLoading } = useQuery<AssetPerformance[]>({
    queryKey: ["/api/simulation/performance/assets"],
    queryFn: async () => {
      // In production, this would fetch from the API
      // For now, return realistic-looking data
      return [
        { symbol: "HDFCBANK", name: "HDFC Bank", value: 35, performance: 12.4, color: "#3b82f6" },
        { symbol: "INFY", name: "Infosys", value: 25, performance: 8.3, color: "#10b981" },
        { symbol: "TCS", name: "TCS", value: 20, performance: 6.7, color: "#f59e0b" },
        { symbol: "ASIANPAINT", name: "Asian Paints", value: 15, performance: 5.2, color: "#6366f1" },
        { symbol: "ICICIBANK", name: "ICICI Bank", value: 5, performance: -1.8, color: "#ef4444" }
      ];
    }
  });

  // Custom tooltip for pie chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-2 rounded shadow text-sm">
          <p className="font-medium">{data.name}</p>
          <p>Allocation: {data.value}%</p>
          <p className={data.performance >= 0 ? "text-green-600" : "text-red-600"}>
            Return: {data.performance >= 0 ? "+" : ""}{data.performance.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="mt-8 shadow-md">
      <CardContent className="p-5">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Performance by Asset</h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Asset Performance Chart */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            {isLoading ? (
              <div className="h-60">
                <Skeleton className="h-full w-full rounded" />
              </div>
            ) : assetData && assetData.length > 0 ? (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                    >
                      {assetData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-60 flex items-center justify-center">
                <p className="text-gray-500 dark:text-gray-400">No asset data available</p>
              </div>
            )}
          </div>
          
          {/* Top Performing Assets */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Top Performing Assets</h3>
            {isLoading ? (
              <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="py-3 flex justify-between items-center">
                    <div className="flex items-center">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="ml-4 h-4 w-28" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </li>
                ))}
              </ul>
            ) : assetData && assetData.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
                {assetData
                  .sort((a, b) => b.performance - a.performance)
                  .map((asset, index) => (
                    <li key={asset.symbol} className="py-3 flex justify-between items-center">
                      <div className="flex items-center">
                        <span className={`flex-shrink-0 h-6 w-6 rounded-full 
                          ${asset.performance >= 0 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          } flex items-center justify-center text-xs`}
                        >
                          {index + 1}
                        </span>
                        <p className="ml-4 text-sm font-medium text-gray-900 dark:text-white">{asset.name}</p>
                      </div>
                      <span className={`text-sm font-medium 
                        ${asset.performance >= 0 
                          ? "text-green-600 dark:text-green-400" 
                          : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {asset.performance >= 0 ? "+" : ""}{asset.performance.toFixed(1)}%
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="mt-3 p-4 text-center text-gray-500 dark:text-gray-400">
                No asset performance data available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
