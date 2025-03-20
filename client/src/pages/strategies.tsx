import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import MobileNav from "@/components/layout/mobile-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Strategy, Simulation } from "@shared/schema";
import { StrategyPerformanceData } from "@/types";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import {
  BrainCircuit,
  TrendingUp,
  ChevronRight,
  Zap,
  Timer,
  Settings,
  PlayCircle,
  PieChart as PieChartIcon
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export default function StrategiesPage() {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [activeTab, setActiveTab] = useState("all");
  
  // Fetch strategies
  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });
  
  // Fetch simulations to calculate performance
  const { data: simulations, isLoading: simulationsLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulations"],
  });
  
  // Calculate strategy performance from simulations
  const calculateStrategyPerformance = (): StrategyPerformanceData[] => {
    if (!strategies || !simulations) return [];
    
    const performanceMap = new Map<string, {
      totalTrades: number;
      successfulTrades: number;
      totalProfitPercent: number;
      simulationCount: number;
    }>();
    
    // Initialize performance data for all strategies
    strategies.forEach(strategy => {
      performanceMap.set(strategy.name, {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfitPercent: 0,
        simulationCount: 0,
      });
    });
    
    // Aggregate performance data from simulations
    simulations.forEach(simulation => {
      const perfData = performanceMap.get(simulation.strategy);
      if (perfData && simulation.profitLossPercent !== null) {
        perfData.totalTrades += simulation.totalTrades;
        perfData.successfulTrades += simulation.successfulTrades || 0;
        perfData.totalProfitPercent += simulation.profitLossPercent;
        perfData.simulationCount += 1;
      }
    });
    
    // Convert to array and calculate average performance
    return Array.from(performanceMap.entries()).map(([name, data]) => {
      const performance = data.simulationCount > 0 
        ? data.totalProfitPercent / data.simulationCount 
        : 0;
      
      return {
        name,
        performance,
        totalTrades: data.totalTrades,
        successfulTrades: data.successfulTrades,
      };
    }).sort((a, b) => b.performance - a.performance);
  };
  
  // Get strategy parameters as object
  const getStrategyParams = (strategy: Strategy) => {
    try {
      return JSON.parse(strategy.parameters || "{}");
    } catch (e) {
      return {};
    }
  };
  
  const strategyPerformance = calculateStrategyPerformance();
  const isLoading = strategiesLoading || simulationsLoading;
  
  // Dummy data for strategy comparison chart
  const comparisonData = strategyPerformance.map(s => ({
    name: s.name.replace(" ", "\n"),
    performance: parseFloat(s.performance.toFixed(2))
  }));
  
  // Pie chart data for successful vs unsuccessful trades
  const getPieChartData = (strategy: StrategyPerformanceData) => {
    const successfulTrades = strategy.successfulTrades;
    const unsuccessfulTrades = strategy.totalTrades - strategy.successfulTrades;
    
    return [
      { name: "Successful", value: successfulTrades },
      { name: "Unsuccessful", value: unsuccessfulTrades }
    ];
  };
  
  const colors = ["#10b981", "#ef4444"];
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <TopNavbar />
        
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Trading Strategies</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Explore and analyze different algorithmic trading strategies
              </p>
            </div>
            
            {/* Strategy Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Performance Comparison</CardTitle>
                  <CardDescription>Average performance of each strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : comparisonData.length === 0 ? (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        No performance data available
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={comparisonData}
                          margin={{
                            top: 20,
                            right: 30,
                            left: 20,
                            bottom: 40,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#333" : "#eee"} />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 12 }}
                            stroke={isDarkMode ? "#aaa" : "#666"}
                          />
                          <YAxis 
                            tickFormatter={(value) => `${value}%`}
                            stroke={isDarkMode ? "#aaa" : "#666"}
                          />
                          <Tooltip 
                            formatter={(value: number) => [`${value}%`, 'Performance']}
                            contentStyle={{ 
                              backgroundColor: isDarkMode ? '#333' : '#fff',
                              border: `1px solid ${isDarkMode ? '#555' : '#ddd'}`,
                              color: isDarkMode ? '#fff' : '#333'
                            }}
                          />
                          <Bar 
                            dataKey="performance" 
                            fill="#2563eb" 
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Strategy Analysis</CardTitle>
                  <CardDescription>Success rate of the top performing strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    {isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : strategyPerformance.length === 0 ? (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        No performance data available
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getPieChartData(strategyPerformance[0])}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {getPieChartData(strategyPerformance[0]).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [value, 'Trades']}
                            contentStyle={{ 
                              backgroundColor: isDarkMode ? '#333' : '#fff',
                              border: `1px solid ${isDarkMode ? '#555' : '#ddd'}`,
                              color: isDarkMode ? '#fff' : '#333'
                            }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Strategy List */}
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <div className="flex justify-between items-center mb-4">
                <TabsList>
                  <TabsTrigger value="all">All Strategies</TabsTrigger>
                  <TabsTrigger value="trending">Trending</TabsTrigger>
                  <TabsTrigger value="beginner">For Beginners</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="all" className="mt-0">
                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <Skeleton className="h-6 w-40" />
                          <Skeleton className="h-4 w-full mt-2" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-full mt-2" />
                          <Skeleton className="h-4 w-full mt-2" />
                        </CardContent>
                        <CardFooter>
                          <Skeleton className="h-9 w-full" />
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : strategies && strategies.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategies.map((strategy) => {
                      const performance = strategyPerformance.find(p => p.name === strategy.name);
                      const params = getStrategyParams(strategy);
                      
                      return (
                        <Card key={strategy.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg flex items-center">
                                <BrainCircuit className="h-5 w-5 mr-2 text-primary" />
                                {strategy.name}
                              </CardTitle>
                              {performance && (
                                <Badge variant={performance.performance >= 0 ? "default" : "destructive"}>
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  {performance.performance >= 0 ? "+" : ""}
                                  {performance.performance.toFixed(2)}%
                                </Badge>
                              )}
                            </div>
                            <CardDescription>{strategy.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <h4 className="text-sm font-medium mb-2">Parameters:</h4>
                            <div className="space-y-1">
                              {Object.entries(params).map(([key, value]) => (
                                <div key={key} className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">{key}:</span>
                                  <span className="font-mono">{value as string}</span>
                                </div>
                              ))}
                            </div>
                            
                            {performance && (
                              <div className="mt-4 pt-4 border-t border-border">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Success Rate:</span>
                                    <p className="font-medium">
                                      {performance.totalTrades > 0 
                                        ? ((performance.successfulTrades / performance.totalTrades) * 100).toFixed(1) 
                                        : "0"}%
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Total Trades:</span>
                                    <p className="font-medium">{performance.totalTrades}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                          <CardFooter>
                            <Button className="w-full" variant="outline">
                              <PlayCircle className="h-4 w-4 mr-2" />
                              Use This Strategy
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No strategies available
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="trending" className="mt-0">
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategyPerformance.slice(0, 3).map((strategy, index) => {
                      const strategyData = strategies?.find(s => s.name === strategy.name);
                      if (!strategyData) return null;
                      
                      const params = getStrategyParams(strategyData);
                      
                      return (
                        <Card key={strategyData.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg flex items-center">
                                <Badge variant="outline" className="mr-2">#{index + 1}</Badge>
                                {strategyData.name}
                              </CardTitle>
                              <Badge variant={strategy.performance >= 0 ? "default" : "destructive"}>
                                <TrendingUp className="h-3 w-3 mr-1" />
                                {strategy.performance >= 0 ? "+" : ""}
                                {strategy.performance.toFixed(2)}%
                              </Badge>
                            </div>
                            <CardDescription>{strategyData.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <h4 className="text-sm font-medium mb-2">Parameters:</h4>
                            <div className="space-y-1">
                              {Object.entries(params).map(([key, value]) => (
                                <div key={key} className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">{key}:</span>
                                  <span className="font-mono">{value as string}</span>
                                </div>
                              ))}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-border">
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Success Rate:</span>
                                  <p className="font-medium">
                                    {strategy.totalTrades > 0 
                                      ? ((strategy.successfulTrades / strategy.totalTrades) * 100).toFixed(1) 
                                      : "0"}%
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Total Trades:</span>
                                  <p className="font-medium">{strategy.totalTrades}</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter>
                            <Button className="w-full">
                              <PlayCircle className="h-4 w-4 mr-2" />
                              Use This Strategy
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="beginner" className="mt-0">
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {["Moving Average Crossover", "RSI Oscillator"].map(name => {
                      const strategyData = strategies?.find(s => s.name === name);
                      if (!strategyData) return null;
                      
                      const performance = strategyPerformance.find(p => p.name === name);
                      const params = getStrategyParams(strategyData);
                      
                      return (
                        <Card key={strategyData.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg flex items-center">
                                <Zap className="h-5 w-5 mr-2 text-primary" />
                                {strategyData.name}
                              </CardTitle>
                              <Badge variant="outline">Beginner Friendly</Badge>
                            </div>
                            <CardDescription>{strategyData.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center space-x-4 text-sm mb-4">
                              <div className="flex items-center">
                                <Timer className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>Easy to setup</span>
                              </div>
                              <div className="flex items-center">
                                <Settings className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>Few parameters</span>
                              </div>
                            </div>
                            
                            <h4 className="text-sm font-medium mb-2">Parameters:</h4>
                            <div className="space-y-1">
                              {Object.entries(params).map(([key, value]) => (
                                <div key={key} className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">{key}:</span>
                                  <span className="font-mono">{value as string}</span>
                                </div>
                              ))}
                            </div>
                            
                            {performance && (
                              <div className="mt-4 pt-4 border-t border-border">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Success Rate:</span>
                                    <p className="font-medium">
                                      {performance.totalTrades > 0 
                                        ? ((performance.successfulTrades / performance.totalTrades) * 100).toFixed(1) 
                                        : "0"}%
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Performance:</span>
                                    <p className="font-medium">
                                      {performance.performance >= 0 ? "+" : ""}
                                      {performance.performance.toFixed(2)}%
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                          <CardFooter>
                            <Button className="w-full">
                              <PlayCircle className="h-4 w-4 mr-2" />
                              Start with this Strategy
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                    
                    <Card className="border-dashed">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                          <PieChartIcon className="h-5 w-5 mr-2 text-primary" />
                          Learn Trading Strategies
                        </CardTitle>
                        <CardDescription>
                          Educational resources to help you understand how different strategies work
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center">
                          <div className="bg-primary/10 p-2 rounded mr-3">
                            <TrendingUp className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">Understanding Technical Indicators</h4>
                            <p className="text-xs text-muted-foreground">Learn the basics of RSI, MACD, Bollinger Bands</p>
                          </div>
                          <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
                        </div>
                        
                        <div className="flex items-center">
                          <div className="bg-primary/10 p-2 rounded mr-3">
                            <BrainCircuit className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">Algorithmic Strategy Basics</h4>
                            <p className="text-xs text-muted-foreground">How automated trading works</p>
                          </div>
                          <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
                        </div>
                        
                        <div className="flex items-center">
                          <div className="bg-primary/10 p-2 rounded mr-3">
                            <Zap className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">Quick Start Guide</h4>
                            <p className="text-xs text-muted-foreground">Set up your first trading simulation</p>
                          </div>
                          <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button className="w-full" variant="outline">
                          Explore Learning Resources
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
        
        <MobileNav />
      </main>
    </div>
  );
}
