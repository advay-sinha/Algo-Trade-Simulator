import { useState } from "react";
import DashboardLayout from "@/components/layouts/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/formatters";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function ReportsPage() {
  const [timeRange, setTimeRange] = useState("1m");
  const [reportTab, setReportTab] = useState("performance");

  // Fetch performance data
  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ["/api/reports/performance", timeRange],
  });

  // Fetch trades analysis
  const { data: tradesAnalysis, isLoading: tradesLoading } = useQuery({
    queryKey: ["/api/reports/trades-analysis", timeRange],
  });

  // Fetch asset performance
  const { data: assetPerformance, isLoading: assetLoading } = useQuery({
    queryKey: ["/api/reports/asset-performance", timeRange],
  });

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-800">Performance Reports</h2>
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select
              value={timeRange}
              onValueChange={setTimeRange}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1w">Last Week</SelectItem>
                <SelectItem value="1m">Last Month</SelectItem>
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="6m">Last 6 Months</SelectItem>
                <SelectItem value="1y">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
          <TabsTrigger value="trades">Trade Analysis</TabsTrigger>
          <TabsTrigger value="assets">Asset Performance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Performance Metrics Summary Cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Profit/Loss</CardTitle>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(performanceData?.totalProfitLoss || 0)}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="text-2xl font-bold">
                    {performanceData?.winRate || 0}%
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Average Return</CardTitle>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="text-2xl font-bold">
                    {performanceData?.averageReturn || 0}%
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
              </CardHeader>
              <CardContent>
                {performanceLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="text-2xl font-bold">
                    {performanceData?.totalTrades || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Performance Chart */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Portfolio Growth</CardTitle>
            </CardHeader>
            <CardContent>
              {performanceLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={performanceData?.portfolioGrowth || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis 
                        tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                      />
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, "Portfolio Value"]}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#3b82f6" 
                        activeDot={{ r: 8 }} 
                        name="Portfolio Value"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Monthly Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {performanceLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={performanceData?.monthlyPerformance || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis 
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Return"]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="return" 
                        name="Monthly Return"
                        fill="#3b82f6"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="trades">
          {/* Trade Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Trade Results Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {tradesLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tradesAnalysis?.tradeResults || []}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {tradesAnalysis?.tradeResults?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.name === "Profitable" ? "#10b981" : "#ef4444"} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value} trades`, ""]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Trade Distribution by Asset Type</CardTitle>
              </CardHeader>
              <CardContent>
                {tradesLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tradesAnalysis?.tradesByAssetType || []}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {tradesAnalysis?.tradesByAssetType?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value} trades`, ""]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Profit/Loss per Trade</CardTitle>
            </CardHeader>
            <CardContent>
              {tradesLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tradesAnalysis?.profitLossPerTrade || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis 
                        tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                      />
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, "P/L"]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="profit" 
                        name="Profit/Loss"
                        fill={(data) => data.profit >= 0 ? "#10b981" : "#ef4444"}
                      >
                        {tradesAnalysis?.profitLossPerTrade?.map((entry: any, index: number) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="assets">
          {/* Asset Performance */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Top Performing Assets</CardTitle>
            </CardHeader>
            <CardContent>
              {assetLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={assetPerformance?.topAssets || []}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        type="number" 
                        domain={[0, 'dataMax']}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={80}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "Return"]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="return" 
                        name="Return" 
                        fill="#3b82f6" 
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Asset Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {assetLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={assetPerformance?.assetComparison || []}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis 
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, ""]}
                      />
                      <Legend />
                      {assetPerformance?.assetComparison && 
                       assetPerformance.assetComparison.length > 0 && 
                       Object.keys(assetPerformance.assetComparison[0])
                        .filter(key => key !== 'date')
                        .map((asset, index) => (
                          <Line
                            key={asset}
                            type="monotone"
                            dataKey={asset}
                            stroke={COLORS[index % COLORS.length]}
                            activeDot={{ r: 8 }}
                          />
                        ))
                      }
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
