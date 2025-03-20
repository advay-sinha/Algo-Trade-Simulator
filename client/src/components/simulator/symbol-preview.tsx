import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface SymbolPreviewProps {
  symbol: string;
}

interface MarketData {
  symbol: {
    id: number;
    name: string;
    symbol: string;
    exchange: string;
  };
  data: {
    id: number;
    symbolId: number;
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source: string;
  };
}

interface HistoricalData {
  id: number;
  symbolId: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

export default function SymbolPreview({ symbol }: SymbolPreviewProps) {
  // Fetch current market data
  const { data: marketData, isLoading: marketDataLoading } = useQuery<MarketData>({
    queryKey: ["/api/market/data", symbol],
    enabled: !!symbol,
  });

  // Fetch historical data for chart
  const { data: historicalData, isLoading: historicalDataLoading } = useQuery<HistoricalData[]>({
    queryKey: ["/api/market/history", symbol],
    enabled: !!symbol,
  });

  // Format chart data
  const chartData = historicalData?.map(data => ({
    time: new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: data.close,
  })).reverse();

  // Calculate price change
  const priceChange = marketData?.data ? 
    (marketData.data.close - marketData.data.open) : 0;
  
  const priceChangePercent = marketData?.data ? 
    ((marketData.data.close - marketData.data.open) / marketData.data.open) * 100 : 0;

  const isPriceUp = priceChange >= 0;

  if (marketDataLoading || !marketData) {
    return (
      <Card className="shadow-md">
        <CardContent className="p-5">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="flex items-center">
            <Skeleton className="h-10 w-28 mb-4 mr-4" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="h-64 mt-6">
            <Skeleton className="h-full w-full" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardContent className="p-5">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
          {marketData.symbol.name} ({marketData.symbol.symbol}) - ₹{marketData.data.close.toFixed(2)}
        </h3>
        <div className="mt-4">
          <div className="flex items-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              ₹{marketData.data.close.toFixed(2)}
            </span>
            <span className={`ml-2 flex items-center text-sm font-medium ${
              isPriceUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {isPriceUp ? (
                <TrendingUp className="mr-1 h-4 w-4" />
              ) : (
                <TrendingDown className="mr-1 h-4 w-4" />
              )}
              ₹{Math.abs(priceChange).toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="mt-6 h-64">
            {historicalDataLoading || !chartData ? (
              <div className="h-full w-full bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading price chart...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={isPriceUp ? "#10b981" : "#ef4444"}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {/* Market Data Preview */}
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="border dark:border-gray-700 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Open</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">₹{marketData.data.open.toFixed(2)}</p>
            </div>
            <div className="border dark:border-gray-700 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">High</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">₹{marketData.data.high.toFixed(2)}</p>
            </div>
            <div className="border dark:border-gray-700 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Low</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">₹{marketData.data.low.toFixed(2)}</p>
            </div>
            <div className="border dark:border-gray-700 rounded-md p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">Volume</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {(marketData.data.volume / 1000000).toFixed(2)}M
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
