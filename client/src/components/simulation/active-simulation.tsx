import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format } from 'date-fns';
import { Loader2 } from "lucide-react";

type ActiveSimulationProps = {
  simulation?: any;
  isLoading: boolean;
  onPause: () => void;
  onStop: () => void;
  isPausing: boolean;
  isStopping: boolean;
};

export default function ActiveSimulation({ 
  simulation, 
  isLoading, 
  onPause, 
  onStop,
  isPausing,
  isStopping
}: ActiveSimulationProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="h-2 w-full" />
              <div className="flex justify-between mt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="border border-gray-200 rounded p-3">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
            
            <Skeleton className="h-24 w-full mb-6" />
            
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!simulation) {
    return null;
  }

  // Process the simulation data
  const {
    id,
    status,
    progress,
    startedAt,
    endTime,
    asset,
    assetSymbol,
    exchange,
    strategy,
    period,
    currentPL,
    currentPLPercentage,
    latestTrade
  } = simulation;

  // Calculate remaining time
  const calculateRemainingTime = () => {
    if (!endTime) return "Unknown";
    const endDate = new Date(endTime);
    return formatDistanceToNow(endDate, { addSuffix: true });
  };

  // Format the start time
  const formattedStartTime = startedAt ? formatDistanceToNow(new Date(startedAt), { addSuffix: true }) : "Unknown";
  
  // Format the remaining time
  const remainingTime = calculateRemainingTime();

  return (
    <Card className="bg-white rounded-lg shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Active Simulation</CardTitle>
          <Badge variant={status === "running" ? "default" : "secondary"}>
            {status === "running" ? "In Progress" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm font-medium text-gray-700">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">Started: {formattedStartTime}</span>
              <span className="text-xs text-gray-500">Remaining: {remainingTime}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Asset</div>
              <div className="font-medium">{assetSymbol} ({exchange})</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Strategy</div>
              <div className="font-medium">{strategy}</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Period</div>
              <div className="font-medium">{period}</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Current P/L</div>
              <div className={`font-medium ${currentPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currentPL >= 0 ? '+' : ''}₹{Math.abs(currentPL).toLocaleString('en-IN')} ({currentPLPercentage}%)
              </div>
            </div>
          </div>
          
          {latestTrade && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Latest Trade</h3>
              <div className="flex items-center">
                <Badge variant={latestTrade.type === "buy" ? "success" : "destructive"} className="mr-2">
                  {latestTrade.type === "buy" ? "Buy" : "Sell"}
                </Badge>
                <span className="text-sm">
                  {latestTrade.type === "buy" ? "Purchased" : "Sold"} {latestTrade.quantity} shares @ ₹{latestTrade.price.toLocaleString('en-IN')} ({format(new Date(latestTrade.timestamp), 'HH:mm')})
                </span>
                {latestTrade.profitLoss && (
                  <span className={`ml-auto text-sm font-medium ${latestTrade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {latestTrade.profitLoss >= 0 ? '+' : ''}₹{Math.abs(latestTrade.profitLoss).toLocaleString('en-IN')} since purchase
                  </span>
                )}
              </div>
            </div>
          )}
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <Button 
              variant="outline" 
              onClick={onPause} 
              disabled={isPausing}
            >
              {isPausing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === "running" ? "Pause Simulation" : "Resume Simulation"}
            </Button>
            <Button 
              variant="destructive" 
              onClick={onStop}
              disabled={isStopping}
            >
              {isStopping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Stop & Analyze Results
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
