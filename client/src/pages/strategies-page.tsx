import { useState } from "react";
import Layout from "@/components/layout/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Activity, ArrowRightLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface Strategy {
  id: number;
  name: string;
  description: string;
  timeFrame: string;
  successRate: string;
  bestMarketCondition: string;
  riskRating: string;
}

export default function StrategiesPage() {
  const [activeTab, setActiveTab] = useState<string>("all");

  // Fetch strategies
  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/simulation/strategies"],
  });

  // Get icon based on strategy name
  const getStrategyIcon = (strategyName: string) => {
    if (strategyName.includes("Mean Reversion")) {
      return <BarChart3 className="h-5 w-5 text-primary" />;
    } else if (strategyName.includes("Momentum")) {
      return <TrendingUp className="h-5 w-5 text-secondary-600" />;
    } else if (strategyName.includes("RSI")) {
      return <Activity className="h-5 w-5 text-amber-500" />;
    } else {
      return <ArrowRightLeft className="h-5 w-5 text-blue-500" />;
    }
  };

  // Get color based on risk rating
  const getRiskColor = (riskRating: string) => {
    switch (riskRating.toLowerCase()) {
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  // Filter strategies based on active tab
  const filteredStrategies = strategies?.filter(strategy => {
    if (activeTab === "all") return true;
    if (activeTab === "trending") {
      return strategy.name.includes("Momentum") || strategy.name.includes("Moving Average");
    }
    if (activeTab === "mean-reversion") {
      return strategy.name.includes("Mean Reversion") || strategy.name.includes("RSI");
    }
    if (activeTab === "oscillator") {
      return strategy.name.includes("RSI") || strategy.name.includes("Bollinger");
    }
    return true;
  });

  return (
    <Layout title="Trading Strategies">
      <div className="space-y-6">
        {/* Tabs for filtering strategies */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Strategies</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="mean-reversion">Mean Reversion</TabsTrigger>
            <TabsTrigger value="oscillator">Oscillator-Based</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Strategy Cards */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-5 mb-2" />
                  <Skeleton className="h-7 w-48 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredStrategies?.map((strategy) => (
              <Card key={strategy.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    {getStrategyIcon(strategy.name)}
                    <Badge className={getRiskColor(strategy.riskRating)}>
                      {strategy.riskRating} Risk
                    </Badge>
                  </div>
                  <CardTitle>{strategy.name}</CardTitle>
                  <CardDescription>Success Rate: {strategy.successRate}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{strategy.description}</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Time Frame:</span>
                      <span>{strategy.timeFrame}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Best Market:</span>
                      <span>{strategy.bestMarketCondition}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Link href={`/simulator?strategy=${strategy.id}`}>
                    <Button variant="default">
                      Run Simulation
                    </Button>
                  </Link>
                  <Button variant="outline">
                    Details <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filteredStrategies?.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No strategies found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Try selecting a different filter or check back later for new strategies.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
