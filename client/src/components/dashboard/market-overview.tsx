import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MarketData } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

interface MarketOverviewProps {
  loading?: boolean;
}

export default function MarketOverview({ loading = false }: MarketOverviewProps) {
  const [refreshing, setRefreshing] = useState(false);
  
  // Define the symbols to display
  const symbols = [
    "NIFTY50.NS", 
    "SENSEX.BO", 
    "HDFCBANK.NS", 
    "RELIANCE.NS", 
    "BTCINR=X"
  ];
  
  // Create a query for each symbol
  const marketQueries = symbols.map(symbol => {
    return useQuery<MarketData>({
      queryKey: [`/api/market-data?symbol=${symbol}`],
      enabled: !loading,
      refetchInterval: 60000, // Refresh every minute
    });
  });
  
  // Format display name for symbol
  const formatSymbolName = (symbol: string) => {
    const symbolMap: Record<string, string> = {
      "NIFTY50.NS": "NIFTY50",
      "SENSEX.BO": "SENSEX",
      "HDFCBANK.NS": "HDFC Bank",
      "RELIANCE.NS": "Reliance",
      "TCS.NS": "TCS",
      "INFY.NS": "Infosys",
      "BTCINR=X": "BTC/INR",
      "ETHINR=X": "ETH/INR",
    };
    
    return symbolMap[symbol] || symbol;
  };
  
  // Format volume with appropriate suffix (K, M, B)
  const formatVolume = (volume?: number) => {
    if (!volume) return "0";
    
    if (volume >= 1e9) return (volume / 1e9).toFixed(1) + "B";
    if (volume >= 1e6) return (volume / 1e6).toFixed(1) + "M";
    if (volume >= 1e3) return (volume / 1e3).toFixed(1) + "K";
    return volume.toString();
  };
  
  // Format price to Indian rupees
  const formatIndianPrice = (price?: number) => {
    if (!price) return "₹0";
    
    // For larger numbers (like crypto prices), simplify
    if (price >= 10000) {
      return `₹${(price).toLocaleString('en-IN', {
        maximumFractionDigits: 0
      })}`;
    }
    
    // For smaller numbers, show decimals
    return `₹${price.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };
  
  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all(
      symbols.map(symbol => 
        queryClient.invalidateQueries({ queryKey: [`/api/market-data?symbol=${symbol}`] })
      )
    );
    setTimeout(() => setRefreshing(false), 500);
  };
  
  // Check if any queries are loading
  const isLoading = loading || marketQueries.some(query => query.isLoading);
  
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium">Market Overview</h2>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-primary"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                <th className="py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Change</th>
                <th className="py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                // Loading skeleton
                [...Array(5)].map((_, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3"><Skeleton className="h-4 w-14" /></td>
                  </tr>
                ))
              ) : (
                // Actual data
                marketQueries.map((query, index) => {
                  const data = query.data;
                  if (!data) return null;
                  
                  return (
                    <tr key={data.symbol} className="border-b border-border">
                      <td className="py-3 text-sm font-medium">{formatSymbolName(data.symbol)}</td>
                      <td className="py-3 text-sm font-mono">{formatIndianPrice(data.price)}</td>
                      <td className={`py-3 text-sm font-medium ${
                        (data.changePercent || 0) >= 0 ? "text-green-500" : "text-red-500"
                      }`}>
                        {(data.changePercent || 0) >= 0 ? "+" : ""}
                        {(data.changePercent || 0).toFixed(2)}%
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">{formatVolume(data.volume)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
