import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketData } from "@shared/schema";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { useTheme } from "@/hooks/use-theme";

interface MarketChartProps {
  symbol: string;
  loading?: boolean;
}

export default function MarketChart({ symbol, loading = false }: MarketChartProps) {
  const [timeframe, setTimeframe] = useState<string>("1D");
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  
  // Format the chart data
  const formatChartData = (data: MarketData[]) => {
    if (!data) return [];
    
    return data.map((item) => ({
      time: new Date(item.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      price: item.price,
      date: new Date(item.timestamp).toLocaleDateString(),
    })).reverse();
  };
  
  // Fetch market data history
  const { data: marketHistory, isLoading: marketHistoryLoading } = useQuery<MarketData[]>({
    queryKey: [`/api/market-data/history?symbol=${symbol}&limit=100`],
    enabled: !loading && !!symbol,
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Fetch latest market data
  const { data: latestMarketData, isLoading: latestDataLoading } = useQuery<MarketData>({
    queryKey: [`/api/market-data?symbol=${symbol}`],
    enabled: !loading && !!symbol,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Format the display name for the symbol
  const getSymbolDisplayName = (symbol: string) => {
    const symbolMap: Record<string, string> = {
      "NIFTY50.NS": "NIFTY 50",
      "SENSEX.BO": "BSE SENSEX",
      "HDFCBANK.NS": "HDFC Bank Ltd.",
      "RELIANCE.NS": "Reliance Industries Ltd.",
      "TCS.NS": "Tata Consultancy Services Ltd.",
      "INFY.NS": "Infosys Ltd.",
      "BTCINR=X": "Bitcoin/INR",
      "ETHINR=X": "Ethereum/INR",
    };
    
    return symbolMap[symbol] || symbol;
  };
  
  // Format price to Indian rupees
  const formatIndianPrice = (price: number) => {
    if (!price) return "₹0";
    
    const formattedPrice = price.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    
    return formattedPrice;
  };
  
  const chartData = formatChartData(marketHistory || []);
  const isLoading = loading || marketHistoryLoading || latestDataLoading;
  
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">
            {getSymbolDisplayName(symbol)} Performance
          </h2>
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              variant={timeframe === "1D" ? "default" : "outline"}
              onClick={() => setTimeframe("1D")}
              className="text-xs"
            >
              1D
            </Button>
            <Button 
              size="sm" 
              variant={timeframe === "1W" ? "default" : "outline"}
              onClick={() => setTimeframe("1W")}
              className="text-xs"
            >
              1W
            </Button>
            <Button 
              size="sm" 
              variant={timeframe === "1M" ? "default" : "outline"}
              onClick={() => setTimeframe("1M")}
              className="text-xs"
            >
              1M
            </Button>
          </div>
        </div>
        
        {/* Price Info */}
        <div className="flex items-end mb-4">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-5 w-24 ml-2" />
            </>
          ) : (
            <>
              <h3 className="text-2xl font-bold">
                {formatIndianPrice(latestMarketData?.price || 0)}
              </h3>
              {latestMarketData?.changePercent && latestMarketData.changePercent !== 0 && (
                <span className={`ml-2 text-sm font-medium flex items-center ${
                  latestMarketData.changePercent > 0 ? "text-green-500" : "text-red-500"
                }`}>
                  {latestMarketData.changePercent > 0 ? (
                    <ArrowUp className="h-3 w-3 mr-1" />
                  ) : (
                    <ArrowUp className="h-3 w-3 mr-1 rotate-180" />
                  )}
                  {latestMarketData.change?.toFixed(2)} ({Math.abs(latestMarketData.changePercent).toFixed(2)}%)
                </span>
              )}
            </>
          )}
        </div>
        
        {/* Chart */}
        <div className="h-64 w-full">
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center">
              <Skeleton className="h-full w-full" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 5,
                  left: 5,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#333" : "#eee"} />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  stroke={isDarkMode ? "#aaa" : "#666"}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke={isDarkMode ? "#aaa" : "#666"}
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                />
                <Tooltip 
                  formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Price']}
                  labelFormatter={(label) => `Time: ${label}`}
                  contentStyle={{ 
                    backgroundColor: isDarkMode ? '#333' : '#fff',
                    border: `1px solid ${isDarkMode ? '#555' : '#ddd'}`,
                    color: isDarkMode ? '#fff' : '#333'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
