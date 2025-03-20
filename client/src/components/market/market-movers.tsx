import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type MarketItem = {
  id: string;
  name: string;
  symbol: string;
  exchange: string;
  price: number;
  change: number;
};

type MarketMoversProps = {
  title: string;
  data?: MarketItem[];
  isLoading: boolean;
  variant: 'gainers' | 'losers' | 'indices';
};

export default function MarketMovers({ title, data, isLoading, variant }: MarketMoversProps) {
  // Get background color based on variant
  const getBgColor = () => {
    switch (variant) {
      case 'gainers': return 'bg-green-50';
      case 'losers': return 'bg-red-50';
      case 'indices': return 'bg-blue-50';
      default: return 'bg-gray-50';
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow overflow-hidden">
      <div className={`p-4 ${getBgColor()} flex items-center justify-between border-b border-gray-200`}>
        <h3 className="font-medium text-gray-700">{title}</h3>
        <span className="text-xs text-gray-500">24h</span>
      </div>
      
      {isLoading ? (
        <ul className="divide-y divide-gray-200">
          {Array(3).fill(0).map((_, i) => (
            <li key={`skeleton-${i}`} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex flex-col items-end">
                  <Skeleton className="h-4 w-20 mb-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : !data || data.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          No data available
        </div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {data.map((item) => (
            <li key={item.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.symbol}</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-sm font-medium font-mono text-gray-900">
                    ₹{item.price.toLocaleString('en-IN')}
                  </div>
                  <div className={`text-xs font-medium ${
                    item.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.change >= 0 ? '+' : ''}{item.change}%
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
