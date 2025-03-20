import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import MobileNav from "@/components/layout/mobile-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area,
  AreaChart, 
  Legend 
} from "recharts";
import { RefreshCw, Search, ArrowUp, ArrowDown } from "lucide-react";
import { MarketData } from "@shared/schema";
import { formatIndianCurrency, formatCompactNumber, getSymbolDisplayName } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { TimeFrame, EnhancedMarketData } from "@/types";
import { Input } from "@/components/ui/input";

export default function MarketDataPage() {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [selectedSymbol, setSelectedSymbol] = useState<string>("NIFTY50.NS");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("1D");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("all");
  
  // Define market symbols by category
  const marketSymbols = {
    indices: ["NIFTY50.NS", "SENSEX.BO"],
    stocks: ["HDFCBANK.NS", "RELIANCE.NS", "TCS.NS", "INFY.NS"],
    crypto: ["BTCINR=X", "ETHINR=X"],
  };
  
  // All symbols for searching
  const allSymbols = [
    ...marketSymbols.indices,
    ...marketSymbols.stocks,
    ...marketSymbols.crypto
  ];
  
  // Get all market data
  const { data: allMarketData, isLoading: allMarketDataLoading, refetch: refetchMarketData } = useQuery<MarketData[]>({
    queryKey: [`/api/market-data/all`],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Get market data history for selected symbol
  const { data: marketHistory, isLoading: marketHistoryLoading, refetch: refetchHistory } = useQuery<MarketData[]>({
    queryKey: [`/api/market-data/history?symbol=${selectedSymbol}&limit=100`],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Get symbols to display based on active tab and search
  const getFilteredSymbols = () => {
    let symbols: string[] = [];
    
    if (activeTab === "all") {
      symbols = allSymbols;
    } else if (activeTab === "indices") {
      symbols = marketSymbols.indices;
    } else if (activeTab === "stocks") {
      symbols = marketSymbols.stocks;
    } else if (activeTab === "crypto") {
      symbols = marketSymbols.crypto;
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return symbols.filter(symbol => 
        symbol.toLowerCase().includes(query) || 
        getSymbolDisplayName(symbol).toLowerCase().includes(query)
      );
    }
    
    return symbols;
  };
  
  // Process market data for display
  const processMarketData = (data: MarketData[] | undefined): EnhancedMarketData[] => {
    if (!data) return [];
    
    return data.map(item => ({
      ...item,
      displayName: getSymbolDisplayName(item.symbol),
      formattedPrice: formatIndianCurrency(item.price),
      formattedChange: formatIndianCurrency(item.change || 0),
      formattedVolume: formatCompactNumber(item.volume || 0),
      isPositive: (item.changePercent || 0) >= 0
    }));
  };
  
  // Format chart data
  const formatChartData = (data: MarketData[] | undefined) => {
    if (!data || data.length === 0) return [];
    
    return data.map((item) => ({
      time: new Date(item.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      price: item.price,
      date: new Date(item.timestamp).toLocaleDateString(),
    })).reverse();
  };
  
  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([
      refetchMarketData(),
      refetchHistory()
    ]);
  };
  
  // Get market data for current symbol
  const currentMarketData = allMarketData?.find(data => data.symbol === selectedSymbol);
  const chartData = formatChartData(marketHistory);
  const enhancedMarketData = processMarketData(allMarketData || []);
  const filteredMarketData = enhancedMarketData.filter(data => 
    getFilteredSymbols().includes(data.symbol)
  );
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <TopNavbar />
        
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold mb-2 md:mb-0">Market Data</h1>
              <div className="flex items-center space-x-2">
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input 
                    type="text" 
                    placeholder="Search markets..." 
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button 
                  size="icon" 
                  variant="outline" 
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Market Chart */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-0">
                  <CardTitle className="text-lg">
                    {getSymbolDisplayName(selectedSymbol)} Chart
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Price Info */}
                  <div className="flex items-center my-4">
                    {marketHistoryLoading ? (
                      <>
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="h-5 w-28 ml-2" />
                      </>
                    ) : (
                      <>
                        <h3 className="text-2xl font-bold font-mono">
                          {currentMarketData ? formatIndianCurrency(currentMarketData.price) : "₹0.00"}
                        </h3>
                        {currentMarketData && currentMarketData.changePercent !== null && (
                          <span className={`ml-2 text-sm font-medium flex items-center ${
                            (currentMarketData.changePercent) >= 0 ? "text-green-500" : "text-red-500"
                          }`}>
                            {(currentMarketData.changePercent) >= 0 ? (
                              <ArrowUp className="h-3 w-3 mr-1" />
                            ) : (
                              <ArrowDown className="h-3 w-3 mr-1" />
                            )}
                            {Math.abs(currentMarketData.change || 0).toFixed(2)} ({Math.abs(currentMarketData.changePercent).toFixed(2)}%)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Time Frame Selector */}
                  <div className="flex mb-4">
                    <div className="flex space-x-2">
                      {["1D", "1W", "1M", "3M", "1Y"].map((tf) => (
                        <Button
                          key={tf}
                          size="sm"
                          variant={timeFrame === tf ? "default" : "outline"}
                          onClick={() => setTimeFrame(tf as TimeFrame)}
                          className="text-xs"
                        >
                          {tf}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Chart */}
                  <div className="h-80 w-full">
                    {marketHistoryLoading ? (
                      <div className="h-full w-full flex items-center justify-center">
                        <Skeleton className="h-full w-full" />
                      </div>
                    ) : chartData.length === 0 ? (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        No data available for the selected timeframe
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{
                            top: 10,
                            right: 10,
                            left: 0,
                            bottom: 10,
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
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#2563eb"
                            fill="#2563eb"
                            fillOpacity={0.2}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Market List */}
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-lg">Markets</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
                    <div className="px-6 pt-2">
                      <TabsList className="w-full">
                        <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                        <TabsTrigger value="indices" className="flex-1">Indices</TabsTrigger>
                        <TabsTrigger value="stocks" className="flex-1">Stocks</TabsTrigger>
                        <TabsTrigger value="crypto" className="flex-1">Crypto</TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="all" className="m-0">
                      <MarketList 
                        data={filteredMarketData} 
                        loading={allMarketDataLoading} 
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                      />
                    </TabsContent>
                    <TabsContent value="indices" className="m-0">
                      <MarketList 
                        data={filteredMarketData} 
                        loading={allMarketDataLoading} 
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                      />
                    </TabsContent>
                    <TabsContent value="stocks" className="m-0">
                      <MarketList 
                        data={filteredMarketData} 
                        loading={allMarketDataLoading} 
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                      />
                    </TabsContent>
                    <TabsContent value="crypto" className="m-0">
                      <MarketList 
                        data={filteredMarketData} 
                        loading={allMarketDataLoading} 
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
            
            {/* Market Details */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Market Details</CardTitle>
              </CardHeader>
              <CardContent>
                {marketHistoryLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : currentMarketData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Symbol</p>
                      <p className="text-lg font-medium">{getSymbolDisplayName(currentMarketData.symbol)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Current Price</p>
                      <p className="text-lg font-medium font-mono">{formatIndianCurrency(currentMarketData.price)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Change (24h)</p>
                      <p className={`text-lg font-medium ${
                        (currentMarketData.changePercent || 0) >= 0 ? "text-green-500" : "text-red-500"
                      }`}>
                        {(currentMarketData.changePercent || 0) >= 0 ? "+" : ""}
                        {(currentMarketData.changePercent || 0).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Volume</p>
                      <p className="text-lg font-medium">{formatCompactNumber(currentMarketData.volume || 0)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    Select a market to view details
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        
        <MobileNav />
      </main>
    </div>
  );
}

// Market List Component
interface MarketListProps {
  data: EnhancedMarketData[];
  loading: boolean;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

function MarketList({ data, loading, selectedSymbol, onSelectSymbol }: MarketListProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(6)].map((_, index) => (
          <div key={index} className="p-3 border border-border rounded-md">
            <Skeleton className="h-5 w-24 mb-1" />
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No markets found matching your criteria
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
      {data.map((item) => (
        <div 
          key={item.symbol}
          className={`p-3 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors ${
            selectedSymbol === item.symbol ? 'bg-primary/10' : ''
          }`}
          onClick={() => onSelectSymbol(item.symbol)}
        >
          <div className="font-medium mb-1">{item.displayName}</div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono">{item.formattedPrice}</span>
            <span className={`text-sm flex items-center ${
              item.isPositive ? 'text-green-500' : 'text-red-500'
            }`}>
              {item.isPositive ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 mr-1" />
              )}
              {Math.abs(item.changePercent || 0).toFixed(2)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
