import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type Trade = {
  id: string;
  symbol: string;
  assetName: string;
  exchange: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  profitLoss: number;
  profitLossPercentage: number;
  timestamp: string;
  assetType: 'stocks' | 'crypto';
};

type RecentTradesProps = {
  isLoading: boolean;
  trades?: Trade[];
};

export default function RecentTrades({ isLoading, trades }: RecentTradesProps) {
  // Default empty state when no trades are found
  const noTrades = (!trades || trades.length === 0) && !isLoading;

  return (
    <Card className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">Recent Trades</h2>
          <Link href="/history">
            <Button variant="link" className="text-sm text-primary hover:text-blue-700">
              View All
            </Button>
          </Link>
        </div>
      </div>
      <div className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P/L</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                // Loading skeleton
                Array(3).fill(0).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="ml-3">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-12 mt-1" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  </tr>
                ))
              ) : noTrades ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    No recent trades found
                  </td>
                </tr>
              ) : (
                trades?.map((trade) => (
                  <tr key={trade.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-8 w-8 rounded-full ${
                          trade.assetType === 'crypto' ? 'bg-green-100' : 'bg-blue-100'
                        } flex items-center justify-center`}>
                          <span className={`text-xs font-medium ${
                            trade.assetType === 'crypto' ? 'text-green-800' : 'text-blue-800'
                          }`}>
                            {trade.symbol}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{trade.assetName}</div>
                          <div className="text-xs text-gray-500">{trade.exchange}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge 
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          trade.type === 'buy' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {trade.type === 'buy' ? 'Buy' : 'Sell'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900">
                      ₹{trade.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900">
                      ₹{trade.price.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                      <span className={trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {trade.profitLoss >= 0 ? '+' : ''}₹{Math.abs(trade.profitLoss).toLocaleString('en-IN')} 
                        {' '}({trade.profitLoss >= 0 ? '+' : ''}{trade.profitLossPercentage}%)
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
