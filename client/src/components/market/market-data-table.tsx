import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useState } from "react";

type MarketDataItem = {
  id: string;
  symbol: string;
  company: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
};

type MarketDataTableProps = {
  data?: {
    items: MarketDataItem[];
    page: number;
    totalPages: number;
    totalItems: number;
  };
  isLoading: boolean;
};

export default function MarketDataTable({ data, isLoading }: MarketDataTableProps) {
  const [page, setPage] = useState(1);

  const handlePreviousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (data && page < data.totalPages) {
      setPage(page + 1);
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow overflow-hidden">
      <CardHeader>
        <CardTitle>Market Data</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Last Price</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Change %</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Market Cap</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array(5).fill(0).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : !data?.items || data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No market data found
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{item.symbol}</TableCell>
                  <TableCell className="text-gray-500">{item.company}</TableCell>
                  <TableCell className="font-mono">₹{item.lastPrice.toLocaleString('en-IN')}</TableCell>
                  <TableCell className={`font-mono ${
                    item.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.change >= 0 ? '+' : ''}₹{Math.abs(item.change).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className={`font-mono ${
                    item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent}%
                  </TableCell>
                  <TableCell className="text-gray-500">{item.volume}</TableCell>
                  <TableCell className="text-gray-500">{item.marketCap}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                        <i className="ri-star-line mr-1"></i>
                        Add to Watchlist
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <CardContent className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {data ? (
            <>
              Showing <span className="font-medium">{(data.page - 1) * 5 + 1}</span> to <span className="font-medium">{Math.min(data.page * 5, data.totalItems)}</span> of <span className="font-medium">{data.totalItems}</span> results
            </>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={isLoading || !data || data.page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={isLoading || !data || data.page >= data.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
