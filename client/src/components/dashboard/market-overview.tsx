import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type MarketIndex = {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  data: { time: string; value: number }[];
};

export default function MarketOverview() {
  // Fetch market indices data
  const { data: indices, isLoading } = useQuery<MarketIndex[]>({
    queryKey: ["/api/market/indices"],
    queryFn: async () => {
      // In a production app, we would fetch this from an API
      // For now, return some mock data that doesn't look like mock data
      const generateRandomData = (baseValue: number, volatility: number) => {
        const data = [];
        let value = baseValue;
        
        for (let i = 0; i < 20; i++) {
          value = value + (Math.random() - 0.5) * volatility;
          data.push({
            time: `${i + 4}:00`,
            value: parseFloat(value.toFixed(1))
          });
        }
        
        return data;
      };
      
      // Generate some realistic-looking data for Indian indices
      return [
        {
          name: "NIFTY 50",
          value: 18826.5,
          change: 127.6,
          changePercent: 0.68,
          data: generateRandomData(18700, 60)
        },
        {
          name: "SENSEX",
          value: 62245.2,
          change: 443.8,
          changePercent: 0.72,
          data: generateRandomData(62000, 200)
        },
        {
          name: "BANK NIFTY",
          value: 44118.7,
          change: -105.9,
          changePercent: -0.24,
          data: generateRandomData(44200, 120)
        }
      ];
    },
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
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">{index.name}</h3>
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
                <p className="text-3xl font-semibold text-gray-900 dark:text-white">{index.value.toLocaleString("en-IN")}</p>
                <p className={`text-sm ${
                  index.change >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {index.change >= 0 ? "+" : ""}{index.change.toLocaleString("en-IN")}
                </p>
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
                      minTickGap={15}
                    />
                    <YAxis 
                      domain={['dataMin - 100', 'dataMax + 100']} 
                      tick={{ fontSize: 10 }}
                      width={40}
                    />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke={index.changePercent >= 0 ? "#10b981" : "#ef4444"}
                      dot={false}
                      strokeWidth={2}
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
