import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from 'date-fns';
import { Loader2 } from "lucide-react";

interface Simulation {
  id: string;
  status: string;
  userId: string;
  symbolId: string;
  strategyId: string;
  initialInvestment: number;
  currentBalance: number;
  startTime: string;
  endTime: string | null;
  timeperiod: string;
  interval: string;
  profitLoss: number;
  profitLossPercentage: number;
  parameters: {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
    buyThreshold: number;
    sellThreshold: number;
    stopLoss: number;
    reinvestProfits: boolean;
  };
  totalTrades: number;
  successfulTrades: number;
}

type ActiveSimulationProps = {
  simulation?: Simulation;
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

  const {
    status,
    startTime,
    endTime,
    initialInvestment,
    currentBalance,
    profitLoss,
    profitLossPercentage,
    totalTrades,
    successfulTrades
  } = simulation;

  const formattedStartTime = startTime ? formatDistanceToNow(new Date(startTime), { addSuffix: true }) : "Unknown";
  const remainingTime = endTime ? formatDistanceToNow(new Date(endTime), { addSuffix: true }) : "Unknown";

  return (
    <Card className="bg-white rounded-lg shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Active Simulation</CardTitle>
          <Badge variant={status === "active" ? "default" : "secondary"}>
            {status === "active" ? "In Progress" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm font-medium text-gray-700">Running</span>
            </div>
            <Progress value={100} className="h-2" />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">Started: {formattedStartTime}</span>
              <span className="text-xs text-gray-500">Remaining: {remainingTime}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Investment</div>
              <div className="font-medium">₹{initialInvestment.toLocaleString('en-IN')}</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Current Balance</div>
              <div className="font-medium">₹{currentBalance.toLocaleString('en-IN')}</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Trades</div>
              <div className="font-medium">{totalTrades} ({successfulTrades} successful)</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500">Current P/L</div>
              <div className={`font-medium ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitLoss >= 0 ? '+' : ''}₹{Math.abs(profitLoss).toLocaleString('en-IN')} ({profitLossPercentage.toFixed(2)}%)
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <Button 
              variant="outline" 
              onClick={onPause} 
              disabled={isPausing}
            >
              {isPausing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === "active" ? "Pause Simulation" : "Resume Simulation"}
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
