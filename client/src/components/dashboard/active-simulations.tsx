import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, ChartLine, Bot } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { Link } from "wouter";

interface Simulation {
  id: number;
  investment: number;
  startTime: string;
  profitLoss: number;
  profitLossPercentage: number;
  status: string;
  timeperiod: string;
  symbol: {
    name: string;
    symbol: string;
  };
  strategy: {
    name: string;
  };
}

export default function ActiveSimulations() {
  // Fetch active simulations
  const { data: simulations, isLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulation/simulations/active"],
  });

  // Calculate progress percentage based on simulation time period and start time
  const getProgressPercentage = (simulation: Simulation) => {
    const startTime = new Date(simulation.startTime);
    const now = new Date();
    const hoursElapsed = differenceInHours(now, startTime);
    
    let totalHours = 24; // Default to 24 hours
    
    switch (simulation.timeperiod) {
      case "6 Hours":
        totalHours = 6;
        break;
      case "12 Hours":
        totalHours = 12;
        break;
      case "24 Hours":
        totalHours = 24;
        break;
      case "3 Days":
        totalHours = 72;
        break;
      case "1 Week":
        totalHours = 168;
        break;
      case "2 Weeks":
        totalHours = 336;
        break;
    }
    
    return Math.min(Math.round((hoursElapsed / totalHours) * 100), 100);
  };

  // Get the icon based on strategy name
  const getStrategyIcon = (strategyName: string) => {
    if (strategyName.includes("Mean Reversion")) {
      return <BarChart className="text-primary-600 dark:text-primary-400" />;
    } else if (strategyName.includes("Momentum")) {
      return <ChartLine className="text-secondary-600 dark:text-secondary-400" />;
    } else {
      return <Bot className="text-accent-600 dark:text-accent-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Active Simulations</h2>
        <Card>
          <CardContent className="p-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="ml-4">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
                <div className="mt-4">
                  <Skeleton className="h-2.5 w-full mb-1" />
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Active Simulations</h2>
      <Card className="mt-4">
        <CardContent className="p-0">
          {simulations && simulations.length > 0 ? (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {simulations.map((simulation) => {
                const progressPercentage = getProgressPercentage(simulation);
                const startTime = new Date(simulation.startTime);
                
                return (
                  <li key={simulation.id}>
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            {getStrategyIcon(simulation.strategy.name)}
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {simulation.strategy.name} - {simulation.symbol.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Started {formatDistanceToNow(startTime, { addSuffix: true })} • ₹{simulation.investment.toLocaleString("en-IN")} invested
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            simulation.profitLoss >= 0 
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}>
                            {simulation.profitLoss >= 0 ? "+" : ""}₹{Math.abs(simulation.profitLoss).toLocaleString("en-IN")} ({simulation.profitLossPercentage.toFixed(1)}%)
                          </span>
                          <Link href={`/simulator/${simulation.id}`}>
                            <Button variant="link" size="sm">View Details</Button>
                          </Link>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Progress value={progressPercentage} className="h-2.5" />
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatDistanceToNow(startTime, { addSuffix: false })} elapsed
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {progressPercentage < 100 ? 
                              (simulation.timeperiod.includes("Hour") ? 
                                `${parseInt(simulation.timeperiod) - differenceInHours(new Date(), startTime)}h remaining` : 
                                `${simulation.timeperiod} total`)
                              : "Completing soon"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-6 text-center">
              <Bot className="h-12 w-12 mx-auto text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No active simulations</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Start a new simulation to see it here.
              </p>
              <div className="mt-4">
                <Link href="/simulator">
                  <Button>
                    Start a Simulation
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
