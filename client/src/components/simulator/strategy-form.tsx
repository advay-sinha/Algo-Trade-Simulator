import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Check,
  DollarSign,
  Clock,
  Activity,
  Plus,
  MinusCircle,
  BarChart2,
  RefreshCw,
} from "lucide-react";

const API_BASE_URL = "http://localhost:8000";

export default function StrategyForm() {
  const queryClient = useQueryClient();
  const [selectedStock, setSelectedStock] = useState(null);
  const [tradeAmount, setTradeAmount] = useState(1);
  const [tradeType, setTradeType] = useState("buy");
  const [showTradeForm, setShowTradeForm] = useState(false);

  // Fetch account data
  const { data: account, isLoading: isLoadingAccount } = useQuery({
    queryKey: ["tradingAccount"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/account`);
      if (!response.ok) {
        throw new Error("Failed to fetch account data");
      }
      return response.json();
    },
  });

  // Fetch stocks data
  const { data: stocks, isLoading: isLoadingStocks } = useQuery({
    queryKey: ["availableStocks"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks`);
      if (!response.ok) {
        throw new Error("Failed to fetch stocks data");
      }
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch portfolio data
  const { data: portfolio, isLoading: isLoadingPortfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/portfolio`);
      if (!response.ok) {
        throw new Error("Failed to fetch portfolio data");
      }
      return response.json();
    },
  });

  // Fetch trade history
  const { data: tradeHistory, isLoading: isLoadingTradeHistory } = useQuery({
    queryKey: ["tradeHistory"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/trades`);
      if (!response.ok) {
        throw new Error("Failed to fetch trade history");
      }
      return response.json();
    },
  });

  // Mutations for CRUD operations
  const executeTrade = useMutation({
    mutationFn: async (tradeData) => {
      const response = await fetch(`${API_BASE_URL}/trades`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tradeData),
      });

      if (!response.ok) {
        throw new Error("Failed to execute trade");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ["tradingAccount"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["tradeHistory"] });

      // Reset form
      setTradeAmount(1);
      setShowTradeForm(false);
    },
  });

  const closePosition = useMutation({
    mutationFn: async (positionId) => {
      const response = await fetch(`${API_BASE_URL}/portfolio/${positionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to close position");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ["tradingAccount"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["tradeHistory"] });
    },
  });

  // Handle stock selection
  useEffect(() => {
    if (stocks && stocks.length > 0 && !selectedStock) {
      setSelectedStock(stocks[0]);
    }
  }, [stocks, selectedStock]);

  // Handle trade submission
  const handleTradeSubmit = (e) => {
    e.preventDefault();

    if (!selectedStock) return;

    const tradeData = {
      stockId: selectedStock.id,
      stockSymbol: selectedStock.symbol,
      stockName: selectedStock.name,
      quantity: tradeAmount,
      price: selectedStock.currentPrice,
      type: tradeType,
      timestamp: new Date().toISOString(),
    };

    executeTrade.mutate(tradeData);
  };

  // Handle position closing
  const handleClosePosition = (positionId) => {
    closePosition.mutate(positionId);
  };

  // Generate mock stock price data for the chart
  const generateStockPriceData = (stock) => {
    if (!stock) return [];

    const basePrice = stock.currentPrice;
    const data = [];
    const now = new Date();

    for (let i = 120; i >= 0; i--) {
      const time = new Date(now);
      time.setMinutes(time.getMinutes() - i);

      // Create realistic price movements (more volatile than index data)
      const trendFactor = Math.sin(i / 20) * 0.8;
      const minuteVariation =
        (Math.random() - 0.5 + trendFactor) * (basePrice * 0.01);
      const value = basePrice + (minuteVariation * (120 - i)) / 40;

      data.push({
        time: time.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        price: Number(value.toFixed(2)),
      });
    }

    return data;
  };

  // Calculate portfolio total value
  const calculatePortfolioValue = () => {
    if (!portfolio || !stocks) return 0;

    return portfolio.reduce((total, position) => {
      const stock = stocks.find((s) => s.id === position.stockId);
      const currentValue = stock ? stock.currentPrice * position.quantity : 0;
      return total + currentValue;
    }, 0);
  };

  // Calculate total profit/loss
  const calculateTotalPnL = () => {
    if (!portfolio || !stocks) return 0;

    return portfolio.reduce((total, position) => {
      const stock = stocks.find((s) => s.id === position.stockId);
      if (!stock) return total;

      const currentValue = stock.currentPrice * position.quantity;
      const costBasis = position.averagePrice * position.quantity;
      return total + (currentValue - costBasis);
    }, 0);
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Loading state
  if (
    isLoadingAccount ||
    isLoadingStocks ||
    isLoadingPortfolio ||
    isLoadingTradeHistory
  ) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold text-black dark:text-white mb-6">
          Trading Simulation
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-black rounded-xl shadow-md p-6 animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 w-1/3 mb-6 rounded"></div>
              <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 w-full mt-6 rounded"></div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="bg-white dark:bg-black rounded-xl shadow-md p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 w-1/2 mb-4 rounded"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 w-3/4 mb-2 rounded"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 w-1/4 mb-6 rounded"></div>
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="bg-white dark:bg-black rounded-xl shadow-md p-6 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 w-1/2 mb-4 rounded"></div>
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mock data for development/preview - would be replaced by real API data
  const mockAccount = account || {
    id: 1,
    name: "Simulation Account",
    balance: 1000000,
    currency: "INR",
  };

  const mockStocks = stocks || [
    {
      id: 1,
      symbol: "RELIANCE",
      name: "Reliance Industries",
      currentPrice: 2864,
      change: 32.5,
      changePercent: 1.15,
    },
    {
      id: 2,
      symbol: "TCS",
      name: "Tata Consultancy Services",
      currentPrice: 3742,
      change: -18.3,
      changePercent: -0.49,
    },
    {
      id: 3,
      symbol: "HDFCBANK",
      name: "HDFC Bank",
      currentPrice: 1632,
      change: 12.75,
      changePercent: 0.79,
    },
    {
      id: 4,
      symbol: "INFY",
      name: "Infosys",
      currentPrice: 1780,
      change: -8.42,
      changePercent: -0.47,
    },
    {
      id: 5,
      symbol: "BHARTIARTL",
      name: "Bharti Airtel",
      currentPrice: 978,
      change: 5.8,
      changePercent: 0.6,
    },
  ];

  const mockPortfolio = portfolio || [
    {
      id: 1,
      stockId: 1,
      stockSymbol: "RELIANCE",
      stockName: "Reliance Industries",
      quantity: 50,
      averagePrice: 2840,
    },
    {
      id: 2,
      stockId: 3,
      stockSymbol: "HDFCBANK",
      stockName: "HDFC Bank",
      quantity: 100,
      averagePrice: 1625,
    },
  ];

  const mockTradeHistory = tradeHistory || [
    {
      id: 1,
      stockSymbol: "RELIANCE",
      stockName: "Reliance Industries",
      quantity: 50,
      price: 2840,
      type: "buy",
      timestamp: "2025-04-03T10:30:00Z",
    },
    {
      id: 2,
      stockSymbol: "HDFCBANK",
      stockName: "HDFC Bank",
      quantity: 100,
      price: 1625,
      type: "buy",
      timestamp: "2025-04-03T11:15:00Z",
    },
    {
      id: 3,
      stockSymbol: "TCS",
      stockName: "Tata Consultancy Services",
      quantity: 30,
      price: 3760,
      type: "buy",
      timestamp: "2025-04-03T13:20:00Z",
    },
    {
      id: 4,
      stockSymbol: "TCS",
      stockName: "Tata Consultancy Services",
      quantity: 30,
      price: 3742,
      type: "sell",
      timestamp: "2025-04-03T15:45:00Z",
    },
  ];

  // Use the selected stock or default to the first one
  const currentStock =
    selectedStock || (mockStocks.length > 0 ? mockStocks[0] : null);
  const stockData = currentStock ? generateStockPriceData(currentStock) : [];

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-black dark:text-white">
            {formatCurrency(payload[0].value)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {payload[0].payload.time}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-black dark:text-white mb-6 flex items-center">
        <BarChart2 className="mr-2" size={20} />
        Trading Simulation
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main trading chart and stock selector */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-black rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              {/* Stock selector */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {mockStocks.map((stock) => (
                  <button
                    key={stock.id}
                    onClick={() => setSelectedStock(stock)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      currentStock && currentStock.id === stock.id
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-2 border-blue-500"
                        : "bg-gray-100 dark:bg-gray-700 text-black dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    <div className="flex items-center">
                      <span>{stock.symbol}</span>
                      <span
                        className={`ml-2 text-xs ${
                          stock.changePercent >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {stock.changePercent >= 0 ? "+" : ""}
                        {stock.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {currentStock && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-black dark:text-white">
                        {currentStock.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {currentStock.symbol}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-black dark:text-white">
                        {formatCurrency(currentStock.currentPrice)}
                      </p>
                      <p
                        className={`text-sm flex items-center justify-end ${
                          currentStock.change >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {currentStock.change >= 0 ? (
                          <TrendingUp size={14} className="mr-1" />
                        ) : (
                          <TrendingDown size={14} className="mr-1" />
                        )}
                        {currentStock.change >= 0 ? "+" : ""}
                        {currentStock.change.toFixed(2)}(
                        {currentStock.changePercent >= 0 ? "+" : ""}
                        {currentStock.changePercent.toFixed(2)}%)
                      </p>
                    </div>
                  </div>

                  {/* Stock price chart */}
                  <div className="h-64 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={stockData}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#374151"
                          opacity={0.1}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                          minTickGap={60}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fontSize: 10 }}
                          width={60}
                          tickFormatter={(value) => `₹${Math.round(value)}`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine
                          y={currentStock.currentPrice}
                          stroke="#9CA3AF"
                          strokeDasharray="3 3"
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke={
                            currentStock.change >= 0 ? "#10B981" : "#EF4444"
                          }
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Trade form button */}
                  {!showTradeForm ? (
                    <button
                      onClick={() => setShowTradeForm(true)}
                      className="mt-6 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center justify-center transition-colors"
                    >
                      <Plus size={18} className="mr-2" />
                      Place Trade Order
                    </button>
                  ) : (
                    <form
                      onSubmit={handleTradeSubmit}
                      className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-black"
                    >
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Trade Type
                          </label>
                          <div className="flex rounded-md overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setTradeType("buy")}
                              className={`flex-1 py-2 px-4 text-sm font-medium ${
                                tradeType === "buy"
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                              }`}
                            >
                              Buy
                            </button>
                            <button
                              type="button"
                              onClick={() => setTradeType("sell")}
                              className={`flex-1 py-2 px-4 text-sm font-medium ${
                                tradeType === "sell"
                                  ? "bg-red-600 text-white"
                                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                              }`}
                            >
                              Sell
                            </button>
                          </div>
                        </div>

                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={tradeAmount}
                            onChange={(e) =>
                              setTradeAmount(
                                Math.max(1, parseInt(e.target.value) || 1)
                              )
                            }
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-black text-black dark:text-white"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Total Value
                          </label>
                          <div className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-black dark:text-white">
                            {formatCurrency(
                              currentStock.currentPrice * tradeAmount
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end mt-4 gap-2">
                        <button
                          type="button"
                          onClick={() => setShowTradeForm(false)}
                          className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={`py-2 px-6 rounded-lg text-white text-sm font-medium ${
                            tradeType === "buy"
                              ? "bg-green-600 hover:bg-green-700"
                              : "bg-red-600 hover:bg-red-700"
                          }`}
                        >
                          {tradeType === "buy" ? "Buy" : "Sell"}{" "}
                          {currentStock.symbol}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Account info and portfolio */}
        <div className="flex flex-col gap-6">
          {/* Account balance */}
          <div className="bg-white dark:bg-black rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Account Balance
              </h3>
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-black dark:text-white mr-2">
                  {formatCurrency(mockAccount.balance)}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {mockAccount.currency}
                </span>
              </div>
              <div className="mt-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Portfolio Value
                  </span>
                  <span className="text-sm font-medium text-black dark:text-white">
                    {formatCurrency(calculatePortfolioValue())}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Total P&L
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      calculateTotalPnL() >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {calculateTotalPnL() >= 0 ? "+" : ""}
                    {formatCurrency(calculateTotalPnL())}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio positions */}
          <div className="bg-white dark:bg-black rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Portfolio Positions
              </h3>

              {mockPortfolio.length === 0 ? (
                <div className="py-4 text-center text-gray-500 dark:text-gray-400">
                  <Activity size={24} className="mx-auto mb-2" />
                  <p>No open positions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mockPortfolio.map((position) => {
                    const stock = mockStocks.find(
                      (s) => s.id === position.stockId
                    );
                    if (!stock) return null;

                    const currentValue = stock.currentPrice * position.quantity;
                    const costBasis = position.averagePrice * position.quantity;
                    const profit = currentValue - costBasis;
                    const profitPercent =
                      (stock.currentPrice / position.averagePrice - 1) * 100;

                    return (
                      <div
                        key={position.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-black"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-sm font-medium text-black dark:text-white">
                              {position.stockSymbol}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {position.stockName}
                            </p>
                          </div>
                          <button
                            onClick={() => handleClosePosition(position.id)}
                            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                            title="Close position"
                          >
                            <MinusCircle size={16} />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">
                              Quantity
                            </p>
                            <p className="font-medium text-black dark:text-white">
                              {position.quantity}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">
                              Avg. Price
                            </p>
                            <p className="font-medium text-black dark:text-white">
                              {formatCurrency(position.averagePrice)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">
                              Current
                            </p>
                            <p className="font-medium text-black dark:text-white">
                              {formatCurrency(stock.currentPrice)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">
                              P&L
                            </p>
                            <p
                              className={`font-medium ${
                                profit >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {profit >= 0 ? "+" : ""}
                              {profitPercent.toFixed(2)}%
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Total Value
                            </span>
                            <span className="text-sm font-medium text-black dark:text-white">
                              {formatCurrency(currentValue)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Profit/Loss
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                profit >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {profit >= 0 ? "+" : ""}
                              {formatCurrency(profit)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent trades */}
          <div className="bg-white dark:bg-black rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  Recent Trades
                </h3>
                <button
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  title="Refresh trades"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {mockTradeHistory.length === 0 ? (
                <div className="py-4 text-center text-gray-500 dark:text-gray-400">
                  <Clock size={24} className="mx-auto mb-2" />
                  <p>No recent trades</p>
                </div>
              ) : (
                <div>hello</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* <QueryClientProvider client={queryClient}>
      <StockAnalysis/>
      </QueryClientProvider> */}
    </div>
  );
}
