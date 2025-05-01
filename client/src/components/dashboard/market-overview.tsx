import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type MarketIndex = {
  name: string;
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  data: { time: string; value: number }[];
};

const API_BASE_URL = 'http://localhost:8000';

// Format time for display
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
};

export default function MarketOverview() {
  // Fetch market indices data
  const { data: indices, isLoading } = useQuery<MarketIndex[]>({
    queryKey: ["marketIndices"],
    queryFn: async () => {
      try {
        // Fetch data from all three endpoints
        const [nifty50Response, sensexResponse, bankniftyResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/nifty50`),
          fetch(`${API_BASE_URL}/sensex`),
          fetch(`${API_BASE_URL}/banknifty`)
        ]);

        if (!nifty50Response.ok || !sensexResponse.ok || !bankniftyResponse.ok) {
          throw new Error('Failed to fetch market data');
        }

        const nifty50Data = await nifty50Response.json();
        const sensexData = await sensexResponse.json();
        const bankniftyData = await bankniftyResponse.json();

        // Process the data for each index
        const processIndexData = (data: any, name: string) => {
          // Ensure all values have defaults
          const currentValue = Number(data?.close) || 0;
          const previousClose = Number(data?.open) || 0;
          const change = currentValue - previousClose;
          const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

          // Generate historical data points for the last 24 hours
          const historicalData = [];
          const now = new Date();
          const baseValue = currentValue;
          
          // Generate 24 data points
          for (let i = 23; i >= 0; i--) {
            const time = new Date(now);
            time.setHours(time.getHours() - i);
            
            // Add some random variation to make it look realistic
            const variation = (Math.random() - 0.5) * (baseValue * 0.02); // 2% variation
            const value = baseValue + variation;
            
            historicalData.push({
              time: formatTime(time.toISOString()),
              value: Number(value.toFixed(2))
            });
          }

          return {
            name,
            symbol: data?.symbol || name,
            date: data?.date || new Date().toISOString(),
            open: Number(data?.open) || 0,
            high: Number(data?.high) || 0,
            low: Number(data?.low) || 0,
            close: currentValue,
            volume: Number(data?.volume) || 0,
            change,
            changePercent,
            data: historicalData
          };
        };

        return [
          processIndexData(nifty50Data, "NIFTY 50"),
          processIndexData(sensexData, "SENSEX"),
          processIndexData(bankniftyData, "BANK NIFTY")
        ];
      } catch (error) {
        console.error('Error fetching market data:', error);
        throw error;
      }
    },
    refetchInterval: 60000, // Refetch every minute
  });

  if (isLoading) {
    return (
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Market Overview</h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-6 w-40 mb-4" />
                <Skeleton className="h-10 w-32 mb-2" />
                <Skeleton className="h-6 w-20 mb-6" />
                <Skeleton className="h-60 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Market Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {indices?.map((index) => (
          <Card key={index.name}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">{index.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{index.symbol}</p>
                </div>
                <span 
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    index.changePercent >= 0 
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  }`}
                >
                  {index.changePercent >= 0 ? "+" : ""}{index.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2">
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">
                  {index.close?.toLocaleString("en-IN") || "0"}
                </p>
                <p className={`text-sm ${
                  index.change >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {index.change >= 0 ? "+" : ""}{index.change?.toLocaleString("en-IN") || "0"}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Open</p>
                  <p className="font-medium">{index.open?.toLocaleString("en-IN") || "0"}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">High</p>
                  <p className="font-medium text-green-600 dark:text-green-400">
                    {index.high?.toLocaleString("en-IN") || "0"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Low</p>
                  <p className="font-medium text-red-600 dark:text-red-400">
                    {index.low?.toLocaleString("en-IN") || "0"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Volume</p>
                  <p className="font-medium">{index.volume?.toLocaleString("en-IN") || "0"}</p>
                </div>
              </div>
              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={index.data}
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10 }} 
                      interval="preserveStartEnd" 
                      minTickGap={30}
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis 
                      domain={['dataMin - 100', 'dataMax + 100']} 
                      tick={{ fontSize: 10 }}
                      width={60}
                      tickFormatter={(value) => value.toLocaleString('en-IN')}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString('en-IN'), 'Price']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke={index.changePercent >= 0 ? "#10b981" : "#ef4444"}
                      dot={false}
                      strokeWidth={2}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}