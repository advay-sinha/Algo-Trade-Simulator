import { useState } from "react";
import DashboardLayout from "@/components/layouts/dashboard-layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/formatters";
import { Loader2, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type FilterOptions = {
  startDate: string;
  endDate: string;
  assetType: string;
  tradeType: string;
  search: string;
  page: number;
  limit: number;
};

export default function HistoryPage() {
  // Pagination and filters
  const [filters, setFilters] = useState<FilterOptions>({
    startDate: "",
    endDate: "",
    assetType: "all",
    tradeType: "all",
    search: "",
    page: 1,
    limit: 10,
  });

  // Fetch trade history
  const { data: tradeHistory, isLoading } = useQuery({
    queryKey: ["/api/trades/history", filters],
  });

  // Handle filter changes
  const handleFilterChange = (key: keyof FilterOptions, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset page when filters change
      ...(key !== 'page' ? { page: 1 } : {}),
    }));
  };

  // Handle pagination
  const handleNextPage = () => {
    setFilters(prev => ({
      ...prev,
      page: prev.page + 1,
    }));
  };

  const handlePrevPage = () => {
    setFilters(prev => ({
      ...prev,
      page: Math.max(1, prev.page - 1),
    }));
  };

  const totalPages = tradeHistory?.totalPages || 1;

  return (
    <DashboardLayout>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  placeholder="End Date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 ml-auto">
              <Select
                value={filters.assetType}
                onValueChange={(value) => handleFilterChange('assetType', value)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Asset Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="stocks">Stocks</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="forex">Forex</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={filters.tradeType}
                onValueChange={(value) => handleFilterChange('tradeType', value)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Trade Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="relative">
                <Input
                  placeholder="Search trades..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-8 w-full md:w-60"
                />
                <div className="absolute inset-y-0 left-2 flex items-center">
                  <svg 
                    className="h-4 w-4 text-muted-foreground" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          {/* Trades Table */}
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>P/L</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tradeHistory?.trades?.map((trade: any) => (
                      <TableRow key={trade.id}>
                        <TableCell>
                          <div className="font-medium">{new Date(trade.timestamp).toLocaleDateString()}</div>
                          <div className="text-sm text-muted-foreground">{new Date(trade.timestamp).toLocaleTimeString()}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-8 w-8 rounded-full ${
                              trade.assetType === 'crypto' ? 'bg-green-100' : 'bg-blue-100'
                            } flex items-center justify-center mr-3`}>
                              <span className={`text-xs font-medium ${
                                trade.assetType === 'crypto' ? 'text-green-800' : 'text-blue-800'
                              }`}>
                                {trade.symbol}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium">{trade.assetName}</div>
                              <div className="text-xs text-muted-foreground">{trade.exchange}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={trade.type === 'buy' ? 'success' : 'destructive'}>
                            {trade.type === 'buy' ? 'Buy' : 'Sell'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(trade.price)}</TableCell>
                        <TableCell>{trade.quantity}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(trade.totalValue)}</TableCell>
                        <TableCell className={`font-medium ${
                          trade.profitLoss > 0 
                            ? 'text-green-600' 
                            : trade.profitLoss < 0 
                              ? 'text-red-600' 
                              : ''
                        }`}>
                          {trade.profitLoss > 0 ? '+' : ''}{formatCurrency(trade.profitLoss)} 
                          {trade.profitLossPercentage && (
                            <span>({trade.profitLossPercentage > 0 ? '+' : ''}{trade.profitLossPercentage}%)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            trade.status === 'completed' 
                              ? 'outline' 
                              : trade.status === 'pending' 
                                ? 'secondary' 
                                : 'default'
                          }>
                            {trade.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {(!tradeHistory?.trades || tradeHistory.trades.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          No trade history found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing page {filters.page} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={filters.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous Page</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleNextPage}
                    disabled={filters.page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next Page</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
