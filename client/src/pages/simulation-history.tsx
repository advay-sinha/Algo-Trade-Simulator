import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import MobileNav from "@/components/layout/mobile-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Simulation,
  Trade
} from "@shared/schema";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  CircleCheck,
  Timer,
  AlertCircle,
  ChevronRight,
  BarChart3,
  LineChart,
  Play
} from "lucide-react";
import { 
  formatIndianCurrency, 
  formatTimeAgo, 
  getSymbolDisplayName, 
  formatPercentage 
} from "@/lib/utils";
import { 
  LineChart as RechartsLineChart, 
  Line, 
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
import { useTheme } from "@/hooks/use-theme";
import { SimulationStatus } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function SimulationHistoryPage() {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);
  
  // Fetch user's simulations
  const { data: simulations, isLoading: simulationsLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulations"],
  });
  
  // Fetch trades for selected simulation
  const { data: simulationTrades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: [`/api/trades?simulationId=${selectedSimulation?.id}`],
    enabled: !!selectedSimulation,
  });
  
  // Prepare data for profit chart
  const getProfitChartData = () => {
    if (!simulationTrades || simulationTrades.length === 0) return [];
    
    const sortedTrades = [...simulationTrades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let cumulativeProfit = 0;
    const chartData = sortedTrades.map((trade, index) => {
      cumulativeProfit += trade.profitLoss || 0;
      return {
        name: index + 1,
        profit: cumulativeProfit,
        time: new Date(trade.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
      };
    });
    
    return chartData;
  };
  
  // Get data for success rate pie chart
  const getPieChartData = () => {
    if (!selectedSimulation) return [];
    
    return [
      { 
        name: "Successful", 
        value: selectedSimulation.successfulTrades || 0 
      },
      { 
        name: "Unsuccessful", 
        value: selectedSimulation.totalTrades - (selectedSimulation.successfulTrades || 0) 
      }
    ];
  };
  
  // Format date for display
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  
  // Format duration
  const formatDuration = (duration: string) => {
    const durationMap: Record<string, string> = {
      "24h": "24 Hours",
      "48h": "48 Hours",
      "1w": "1 Week",
      "custom": "Custom"
    };
    
    return durationMap[duration] || duration;
  };
  
  // Get status badge based on simulation status
  const getStatusBadge = (status: SimulationStatus) => {
    if (status === "running") {
      return (
        <Badge variant="outline" className="flex items-center">
          <Clock className="h-3 w-3 mr-1 animate-pulse text-blue-500" />
          Running
        </Badge>
      );
    } else if (status === "completed") {
      return (
        <Badge variant="outline" className="flex items-center">
          <CircleCheck className="h-3 w-3 mr-1 text-green-500" />
          Completed
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="flex items-center">
          <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
          Cancelled
        </Badge>
      );
    }
  };
  
  // Colors for pie chart
  const COLORS = ["#10b981", "#ef4444"];
  
  // Group simulations by status
  const getSimulationsByStatus = () => {
    if (!simulations) return { running: [], completed: [] };
    
    const running = simulations.filter(sim => sim.status === "running");
    const completed = simulations.filter(sim => sim.status === "completed");
    
    return { running, completed };
  };
  
  const { running, completed } = getSimulationsByStatus();
  const profitChartData = getProfitChartData();
  const pieChartData = getPieChartData();
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <TopNavbar />
        
        <div className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Simulation History</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Track and analyze your algorithmic trading simulations
              </p>
            </div>
            
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Simulations</p>
                      <h3 className="text-2xl font-bold mt-1">
                        {simulationsLoading ? (
                          <Skeleton className="h-8 w-20" />
                        ) : (
                          simulations?.length || 0
                        )}
                      </h3>
                    </div>
                    <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Active Simulations</p>
                      <h3 className="text-2xl font-bold mt-1">
                        {simulationsLoading ? (
                          <Skeleton className="h-8 w-20" />
                        ) : (
                          running.length
                        )}
                      </h3>
                    </div>
                    <div className="h-12 w-12 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                      <Timer className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Completed</p>
                      <h3 className="text-2xl font-bold mt-1">
                        {simulationsLoading ? (
                          <Skeleton className="h-8 w-20" />
                        ) : (
                          completed.length
                        )}
                      </h3>
                    </div>
                    <div className="h-12 w-12 rounded-md bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                      <CircleCheck className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Avg. Profit/Loss</p>
                      <h3 className="text-2xl font-bold mt-1">
                        {simulationsLoading ? (
                          <Skeleton className="h-8 w-20" />
                        ) : completed.length === 0 ? (
                          "N/A"
                        ) : (
                          formatPercentage(
                            completed.reduce((sum, sim) => sum + (sim.profitLossPercent || 0), 0) / completed.length
                          )
                        )}
                      </h3>
                    </div>
                    <div className="h-12 w-12 rounded-md bg-yellow-50 dark:bg-yellow-900/30 flex items-center justify-center">
                      <LineChart className="h-6 w-6 text-yellow-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Simulations Tabs */}
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All Simulations</TabsTrigger>
                <TabsTrigger value="running">Running</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="mt-6">
                <SimulationTable 
                  simulations={simulations} 
                  loading={simulationsLoading} 
                  onSelect={setSelectedSimulation}
                />
              </TabsContent>
              
              <TabsContent value="running" className="mt-6">
                <SimulationTable 
                  simulations={running} 
                  loading={simulationsLoading} 
                  onSelect={setSelectedSimulation}
                />
              </TabsContent>
              
              <TabsContent value="completed" className="mt-6">
                <SimulationTable 
                  simulations={completed} 
                  loading={simulationsLoading} 
                  onSelect={setSelectedSimulation}
                />
              </TabsContent>
            </Tabs>
            
            {/* Selected Simulation Details */}
            {selectedSimulation && (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>
                        {getSymbolDisplayName(selectedSimulation.symbol)} Simulation
                      </CardTitle>
                      <CardDescription>
                        {formatDate(selectedSimulation.startTime)} • {formatDuration(selectedSimulation.duration)}
                      </CardDescription>
                    </div>
                    {getStatusBadge(selectedSimulation.status as SimulationStatus)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Initial Balance</h4>
                      <p className="text-lg font-mono">
                        {formatIndianCurrency(selectedSimulation.initialBalance)}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Final Balance</h4>
                      <p className="text-lg font-mono">
                        {selectedSimulation.finalBalance !== null 
                          ? formatIndianCurrency(selectedSimulation.finalBalance) 
                          : "In progress"}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Profit/Loss</h4>
                      <p className={`text-lg font-mono ${
                        (selectedSimulation.profitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"
                      }`}>
                        {selectedSimulation.profitLoss !== null
                          ? (selectedSimulation.profitLoss >= 0 ? "+" : "") + formatIndianCurrency(selectedSimulation.profitLoss)
                          : "In progress"}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Success Rate</h4>
                      <p className="text-lg">
                        {selectedSimulation.successRate !== null
                          ? `${selectedSimulation.successRate.toFixed(1)}%`
                          : "In progress"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div className="lg:col-span-2">
                      <h4 className="text-sm font-medium mb-2">Profit/Loss Over Time</h4>
                      <div className="h-64 w-full">
                        {tradesLoading ? (
                          <Skeleton className="h-full w-full" />
                        ) : profitChartData.length === 0 ? (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            No trade data available
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsLineChart
                              data={profitChartData}
                              margin={{
                                top: 5,
                                right: 30,
                                left: 20,
                                bottom: 5,
                              }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#333" : "#eee"} />
                              <XAxis 
                                dataKey="name" 
                                label={{ value: 'Trade #', position: 'insideBottomRight', offset: -5 }}
                                tick={{ fontSize: 12 }}
                                stroke={isDarkMode ? "#aaa" : "#666"}
                              />
                              <YAxis 
                                tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                                stroke={isDarkMode ? "#aaa" : "#666"}
                              />
                              <Tooltip 
                                formatter={(value: number) => [formatIndianCurrency(value), 'Profit/Loss']}
                                labelFormatter={(value) => `Trade #${value}`}
                                contentStyle={{ 
                                  backgroundColor: isDarkMode ? '#333' : '#fff',
                                  border: `1px solid ${isDarkMode ? '#555' : '#ddd'}`,
                                  color: isDarkMode ? '#fff' : '#333'
                                }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="profit" 
                                stroke="#2563eb" 
                                activeDot={{ r: 8 }} 
                              />
                            </RechartsLineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2">Trade Success Rate</h4>
                      <div className="h-64 w-full">
                        {tradesLoading ? (
                          <Skeleton className="h-full w-full" />
                        ) : pieChartData.length === 0 || selectedSimulation.totalTrades === 0 ? (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            No trade data available
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {pieChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                    </div>
                  </div>
                  
                  {/* Trades List */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-medium">Simulation Trades</h4>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            View All Trades
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>All Trades for {getSymbolDisplayName(selectedSimulation.symbol)} Simulation</DialogTitle>
                          </DialogHeader>
                          <div className="max-h-[60vh] overflow-y-auto">
                            <AllTradesTable trades={simulationTrades} loading={tradesLoading} />
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead className="text-right">Profit/Loss</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tradesLoading ? (
                            [...Array(3)].map((_, index) => (
                              <TableRow key={index}>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              </TableRow>
                            ))
                          ) : !simulationTrades || simulationTrades.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                                No trades have been executed yet
                              </TableCell>
                            </TableRow>
                          ) : (
                            simulationTrades
                              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                              .slice(0, 5)
                              .map((trade) => (
                                <TableRow key={trade.id}>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <div className={`h-6 w-6 rounded-full flex items-center justify-center mr-2 ${
                                        trade.type === "buy" 
                                          ? "bg-green-100 text-green-500 dark:bg-green-900/30" 
                                          : "bg-red-100 text-red-500 dark:bg-red-900/30"
                                      }`}>
                                        {trade.type === "buy" ? (
                                          <ArrowUp className="h-3 w-3" />
                                        ) : (
                                          <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                      <span className="capitalize">{trade.type}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {formatIndianCurrency(trade.price)}
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {formatIndianCurrency(trade.amount)}
                                  </TableCell>
                                  <TableCell>
                                    {formatTimeAgo(trade.timestamp)}
                                  </TableCell>
                                  <TableCell className={`text-right font-mono ${
                                    (trade.profitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"
                                  }`}>
                                    {(trade.profitLoss || 0) >= 0 ? "+" : ""}
                                    {formatIndianCurrency(trade.profitLoss || 0)}
                                  </TableCell>
                                </TableRow>
                              ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedSimulation(null)}
                  >
                    Close
                  </Button>
                  {selectedSimulation.status === "running" && (
                    <Button>
                      <Play className="h-4 w-4 mr-2" />
                      Run Similar Simulation
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )}
          </div>
        </div>
        
        <MobileNav />
      </main>
    </div>
  );
}

// Simulation Table Component
interface SimulationTableProps {
  simulations?: Simulation[];
  loading: boolean;
  onSelect: (simulation: Simulation) => void;
}

function SimulationTable({ simulations, loading, onSelect }: SimulationTableProps) {
  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Profit/Loss</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  if (!simulations || simulations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No simulations found
      </div>
    );
  }
  
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead>Start Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Profit/Loss</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {simulations.map((simulation) => (
            <TableRow key={simulation.id}>
              <TableCell className="font-medium">
                {getSymbolDisplayName(simulation.symbol)}
              </TableCell>
              <TableCell>{simulation.strategy}</TableCell>
              <TableCell>{formatTimeAgo(simulation.startTime)}</TableCell>
              <TableCell>
                {simulation.status === "running" ? (
                  <Badge variant="outline" className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 animate-pulse text-blue-500" />
                    Running
                  </Badge>
                ) : simulation.status === "completed" ? (
                  <Badge variant="outline" className="flex items-center">
                    <CircleCheck className="h-3 w-3 mr-1 text-green-500" />
                    Completed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
                    Cancelled
                  </Badge>
                )}
              </TableCell>
              <TableCell className={`font-mono ${
                simulation.status === "running" 
                  ? "" 
                  : (simulation.profitLoss || 0) >= 0 
                    ? "text-green-500" 
                    : "text-red-500"
              }`}>
                {simulation.status === "running" ? (
                  "In progress"
                ) : (
                  <>
                    {(simulation.profitLossPercent || 0) >= 0 ? "+" : ""}
                    {(simulation.profitLossPercent || 0).toFixed(2)}%
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => onSelect(simulation)}
                >
                  <span className="sm:hidden">View</span>
                  <span className="hidden sm:inline">View Details</span>
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// All Trades Table Component
interface AllTradesTableProps {
  trades?: Trade[];
  loading: boolean;
}

function AllTradesTable({ trades, loading }: AllTradesTableProps) {
  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Profit/Loss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  if (!trades || trades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No trades have been executed yet
      </div>
    );
  }
  
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="text-right">Profit/Loss</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((trade) => (
              <TableRow key={trade.id}>
                <TableCell>
                  <div className="flex items-center">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center mr-2 ${
                      trade.type === "buy" 
                        ? "bg-green-100 text-green-500 dark:bg-green-900/30" 
                        : "bg-red-100 text-red-500 dark:bg-red-900/30"
                    }`}>
                      {trade.type === "buy" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </div>
                    <span className="capitalize">{trade.type}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {formatIndianCurrency(trade.price)}
                </TableCell>
                <TableCell className="font-mono">
                  {formatIndianCurrency(trade.amount)}
                </TableCell>
                <TableCell>
                  {trade.quantity.toFixed(4)}
                </TableCell>
                <TableCell>
                  {new Date(trade.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className={`text-right font-mono ${
                  (trade.profitLoss || 0) >= 0 ? "text-green-500" : "text-red-500"
                }`}>
                  {(trade.profitLoss || 0) >= 0 ? "+" : ""}
                  {formatIndianCurrency(trade.profitLoss || 0)}
                  <div className="text-xs">
                    {(trade.profitLossPercent || 0) >= 0 ? "+" : ""}
                    {(trade.profitLossPercent || 0).toFixed(2)}%
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
