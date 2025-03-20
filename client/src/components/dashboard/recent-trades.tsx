import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Trade } from "@shared/schema";

interface RecentTradesProps {
  trades?: Trade[];
  loading?: boolean;
}

export default function RecentTrades({ trades, loading = false }: RecentTradesProps) {
  // Format time ago
  const formatTimeAgo = (timestamp: string | Date) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };
  
  // Format symbol display name
  const formatSymbolName = (symbol: string) => {
    const symbolMap: Record<string, string> = {
      "NIFTY50.NS": "NIFTY 50",
      "SENSEX.BO": "BSE SENSEX",
      "HDFCBANK.NS": "HDFC Bank",
      "RELIANCE.NS": "Reliance",
      "TCS.NS": "TCS",
      "INFY.NS": "Infosys",
      "BTCINR=X": "Bitcoin/INR",
      "ETHINR=X": "Ethereum/INR",
    };
    
    return symbolMap[symbol] || symbol;
  };
  
  // Format price to Indian rupees
  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return "₹0";
    
    // Format using Indian system
    const formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    
    return formatter.format(price);
  };
  
  // Get the most recent trades, limited to 4
  const recentTrades = trades 
    ? trades
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 4)
    : [];
  
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium">Recent Trades</h2>
          <a href="#" className="text-primary text-sm hover:underline">View All</a>
        </div>
        
        {loading ? (
          <div className="space-y-5">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="flex items-center p-3 border border-border rounded-lg">
                <Skeleton className="w-10 h-10 rounded-full mr-4" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-4 w-16 mb-2" />
                  <Skeleton className="h-3 w-10 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : recentTrades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No trades have been executed yet.
          </div>
        ) : (
          <div className="space-y-5">
            {recentTrades.map((trade) => (
              <div key={trade.id} className="flex items-center p-3 border border-border rounded-lg">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mr-4",
                  trade.type === "buy" 
                    ? "bg-green-100 dark:bg-green-900 dark:bg-opacity-30" 
                    : "bg-red-100 dark:bg-red-900 dark:bg-opacity-30"
                )}>
                  {trade.type === "buy" ? (
                    <ArrowUp className="text-green-500" />
                  ) : (
                    <ArrowDown className="text-red-500" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium">{formatSymbolName(trade.symbol)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(trade.timestamp)} • {trade.type.charAt(0).toUpperCase() + trade.type.slice(1)} • {formatPrice(trade.amount)}
                  </p>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "font-medium",
                    (trade.profitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {(trade.profitLoss || 0) >= 0 ? "+" : ""}{formatPrice(trade.profitLoss || 0)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {(trade.profitLossPercent || 0) >= 0 ? "+" : ""}
                    {(trade.profitLossPercent || 0).toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
