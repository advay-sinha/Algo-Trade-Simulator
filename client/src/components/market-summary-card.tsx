import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer 
} from "recharts";

type MarketSummaryCardProps = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  chartData: Array<{ value: number; time: string }>;
};

export default function MarketSummaryCard({
  symbol,
  price,
  change,
  changePercent,
  chartData
}: MarketSummaryCardProps) {
  const isPositive = change >= 0;
  
  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(price);
  
  return (
    <Card className="bg-white shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-neutral-500">{symbol}</p>
            <h3 className="text-xl font-semibold mt-1">{formattedPrice}</h3>
            <div className={`flex items-center mt-1 ${isPositive ? 'text-success-500' : 'text-danger-500'}`}>
              {isPositive ? (
                <i className="ri-arrow-up-line mr-1" />
              ) : (
                <i className="ri-arrow-down-line mr-1" />
              )}
              <span className="text-sm font-medium">{Math.abs(changePercent).toFixed(2)}%</span>
            </div>
          </div>
          <div className="h-12 w-24">
            {chartData && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={isPositive ? "#43A047" : "#F44336"} 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
