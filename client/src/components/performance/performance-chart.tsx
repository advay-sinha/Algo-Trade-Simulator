import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PerformanceData {
  date: string;
  value: number;
  profit: number;
}

export default function PerformanceChart() {
  const [timeRange, setTimeRange] = useState<string>("1W");
  
  // Get date filter based on selected range
  const getDateFilter = () => {
    const today = new Date();
    switch (timeRange) {
      case "1W":
        return new Date(today.setDate(today.getDate() - 7));
      case "1M":
        return new Date(today.setMonth(today.getMonth() - 1));
      case "3M":
        return new Date(today.setMonth(today.getMonth() - 3));
      case "6M":
        return new Date(today.setMonth(today.getMonth() - 6));
      case "1Y":
        return new Date(today.setFullYear(today.getFullYear() - 1));
      case "ALL":
        return new Date(2000, 0, 1); // Very old date to include all data
      default:
        return new Date(today.setDate(today.getDate() - 7));
    }
  };

  // Fetch performance data
  const { data: performanceData, isLoading } = useQuery<PerformanceData[]>({
    queryKey: ["/api/simulation/performance/chart", timeRange],
    queryFn: async () => {
      // In production, this would fetch from the API with the timeRange filter
      // For now, generate data that looks realistic
      const startDate = getDateFilter();
      const today = new Date();
      const data: PerformanceData[] = [];
      
      // Generate daily data points
      let currentValue = 100000; // Starting portfolio value
      let currentDate = new Date(startDate);
      
      while (currentDate <= today) {
        // Random daily change between -2% and +3%
        const dailyChange = (Math.random() * 5 - 2) / 100;
        const dailyProfit = currentValue * dailyChange;
        currentValue += dailyProfit;
        
        data.push({
          date: currentDate.toISOString().split('T')[0],
          value: Math.round(currentValue),
          profit: Math.round(dailyProfit)
        });
        
        // Add 1 day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return data;
    }
  });

  return (
    <Card className="mt-8 shadow-md">
      <CardContent className="px-4 py-5 sm:p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Performance Over Time</h2>
        <div className="mt-4">
          {/* Filter Options */}
          <div className="flex space-x-2 mb-4">
            {["1W", "1M", "3M", "6M", "1Y", "ALL"].map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setTimeRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
          
          <div className="h-80">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : performanceData && performanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={performanceData}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      // Format based on time range
                      if (timeRange === "1W" || timeRange === "1M") {
                        return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric' }).format(date);
                      } else {
                        return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(date);
                      }
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Portfolio Value"]}
                    labelFormatter={(label) => {
                      const date = new Date(label);
                      return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3b82f6" 
                    fill="#3b82f680"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
                <p className="text-gray-500 dark:text-gray-400">No performance data available</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
