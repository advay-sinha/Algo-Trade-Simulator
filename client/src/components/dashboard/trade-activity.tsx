import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface Trade {
  id: number;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  timestamp: string;
  status: string;
  simulation: {
    id: number;
    strategy: {
      name: string;
    };
    symbol: {
      name: string;
      symbol: string;
    };
  };
}

export default function TradeActivity() {
  // Fetch recent trades
  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/simulation/trades/recent"],
  });

  if (isLoading) {
    return (
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Trade Activity</h2>
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto rounded-lg">
          <div className="p-4">
            <Skeleton className="h-8 w-full mb-4" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full mb-2" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Trade Activity</h2>
        <Link href="/performance">
          <Button variant="link" size="sm">
            View all
          </Button>
        </Link>
      </div>
      <div className="mt-4 bg-white dark:bg-gray-800 shadow overflow-x-auto rounded-lg">
        <Table>
          <TableCaption>A list of your recent trades.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Time</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades && trades.length > 0 ? (
              trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">
                    {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
                  </TableCell>
                  <TableCell>{trade.simulation.strategy.name}</TableCell>
                  <TableCell>{trade.simulation.symbol.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={trade.type === 'buy' ? 'default' : 'destructive'}>
                      {trade.type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{trade.quantity}</TableCell>
                  <TableCell className="text-right">₹{trade.price.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">₹{trade.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                      {trade.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4">
                  No recent trades found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
