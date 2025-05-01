import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type WatchlistItem = {
  id: string;
  symbol: string;
  name: string;
  marketType: string;
  price: number;
  change: number;
  assetType: 'stocks' | 'crypto' | 'index';
};

type WatchlistProps = {
  isLoading: boolean;
  watchlist?: WatchlistItem[];
};

export default function Watchlist({ isLoading, watchlist }: WatchlistProps) {
  // Default empty state when no items are found
  const noItems = (!watchlist || watchlist.length === 0) && !isLoading;

  const getBgColorByAssetType = (type: string) => {
    switch (type) {
      case 'crypto': return 'bg-green-100';
      case 'index': return 'bg-yellow-100';
      default: return 'bg-blue-100'; // stocks
    }
  };

  const getTextColorByAssetType = (type: string) => {
    switch (type) {
      case 'crypto': return 'text-green-800';
      case 'index': return 'text-yellow-800';
      default: return 'text-blue-800'; // stocks
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">Watchlist</h2>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600" aria-label="Add to watchlist">
            <i className="ri-add-line text-lg"></i>
          </Button>
        </div>
      </div>
      <div className="p-0">
        {isLoading ? (
          // Loading skeleton
          <ul className="divide-y divide-gray-200">
            {Array(4).fill(0).map((_, i) => (
              <li key={`skeleton-${i}`} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="ml-3">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : noItems ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No watchlist items found
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {watchlist?.map((item) => (
              <li key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 h-10 w-10 rounded-full ${getBgColorByAssetType(item.assetType)} flex items-center justify-center`}>
                      <span className={`text-sm font-medium ${getTextColorByAssetType(item.assetType)}`}>
                        {item.symbol}
                      </span>
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.marketType}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-medium font-mono text-gray-900">
                      ₹{item.price.toLocaleString('en-IN')}
                    </div>
                    <div className={`text-xs font-medium ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.change >= 0 ? '+' : ''}{item.change}%
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
