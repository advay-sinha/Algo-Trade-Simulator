import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Strategy } from "@shared/schema";

interface StrategyPerformanceProps {
  loading?: boolean;
}

interface StrategyPerformanceData {
  name: string;
  performance: number;
}

export default function StrategyPerformance({ loading = false }: StrategyPerformanceProps) {
  const [timeframe, setTimeframe] = useState("Last 24 Hours");
  
  // Fetch strategies
  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    enabled: !loading,
  });
  
  // Mock performance data - in a real app, this would come from the API
  const getPerformanceData = (): StrategyPerformanceData[] => {
    if (!strategies) return [];
    
    // This is just sample data for demonstration
    // In the real app, this would be calculated from actual trade data
    const mockPerformance: Record<string, number> = {
      "Moving Average Crossover": 18.5,
      "RSI Oscillator": 12.7,
      "MACD Divergence": -2.3,
      "Bollinger Bands": 8.9,
      "Custom Strategy": 21.2,
    };
    
    return strategies.map(strategy => ({
      name: strategy.name,
      performance: mockPerformance[strategy.name] || Math.random() * 20 - 5,
    })).sort((a, b) => b.performance - a.performance);
  };
  
  const performanceData = getPerformanceData();
  const isLoading = loading || strategiesLoading;
  
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium">Strategy Performance</h2>
          <div>
            <Select
              value={timeframe}
              onValueChange={setTimeframe}
            >
              <SelectTrigger className="text-sm border-0 px-2 py-1 h-8 bg-muted">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Last 24 Hours">Last 24 Hours</SelectItem>
                <SelectItem value="Last Week">Last Week</SelectItem>
                <SelectItem value="Last Month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoading ? (
          <div className="space-y-6">
            {[...Array(5)].map((_, index) => (
              <div key={index}>
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : performanceData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No strategy performance data available.
          </div>
        ) : (
          <div className="space-y-4">
            {performanceData.map((strategy) => (
              <div key={strategy.name}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">{strategy.name}</span>
                  <span className={`text-sm font-medium ${
                    strategy.performance >= 0 ? "text-green-500" : "text-red-500"
                  }`}>
                    {strategy.performance >= 0 ? "+" : ""}
                    {strategy.performance.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className={`${
                      strategy.performance >= 0 ? "bg-green-500" : "bg-red-500"
                    } h-2.5 rounded-full`} 
                    style={{ 
                      width: `${Math.min(Math.abs(strategy.performance) * 5, 100)}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
