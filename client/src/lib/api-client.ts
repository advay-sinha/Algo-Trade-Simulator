import { apiRequest } from "./queryClient";

// Market API
export const marketApi = {
  getTopGainers: () => 
    apiRequest("GET", "/api/market/movers/gainers").then(res => res.json()),
  
  getTopLosers: () => 
    apiRequest("GET", "/api/market/movers/losers").then(res => res.json()),
  
  getMarketIndices: () => 
    apiRequest("GET", "/api/market/indices").then(res => res.json()),
  
  getMarketData: (filters: any) => 
    apiRequest("GET", `/api/market/data?${new URLSearchParams(filters)}`).then(res => res.json()),
  
  getAssetDetails: (symbol: string) => 
    apiRequest("GET", `/api/market/asset/${symbol}`).then(res => res.json()),
};

// Simulation API
export const simulationApi = {
  getActiveSimulation: () => 
    apiRequest("GET", "/api/simulation/active").then(res => res.json()),
  
  startSimulation: (data: any) => 
    apiRequest("POST", "/api/simulation/start", data).then(res => res.json()),
  
  pauseSimulation: () => 
    apiRequest("POST", "/api/simulation/pause").then(res => res.json()),
  
  stopSimulation: () => 
    apiRequest("POST", "/api/simulation/stop").then(res => res.json()),
  
  getSimulationResults: (id: string) => 
    apiRequest("GET", `/api/simulation/results/${id}`).then(res => res.json()),
};

// Trades API
export const tradesApi = {
  getRecentTrades: () => 
    apiRequest("GET", "/api/trades/recent").then(res => res.json()),
  
  getTradeHistory: (filters: any) => 
    apiRequest("GET", `/api/trades/history?${new URLSearchParams(filters)}`).then(res => res.json()),
};

// Portfolio API
export const portfolioApi = {
  getSummary: () => 
    apiRequest("GET", "/api/portfolio/summary").then(res => res.json()),
  
  getWatchlist: () => 
    apiRequest("GET", "/api/watchlist").then(res => res.json()),
  
  addToWatchlist: (symbol: string) => 
    apiRequest("POST", "/api/watchlist", { symbol }).then(res => res.json()),
  
  removeFromWatchlist: (id: string) => 
    apiRequest("DELETE", `/api/watchlist/${id}`).then(res => res.json()),
};

// Reports API
export const reportsApi = {
  getPerformance: (timeRange: string) => 
    apiRequest("GET", `/api/reports/performance?timeRange=${timeRange}`).then(res => res.json()),
  
  getTradesAnalysis: (timeRange: string) => 
    apiRequest("GET", `/api/reports/trades-analysis?timeRange=${timeRange}`).then(res => res.json()),
  
  getAssetPerformance: (timeRange: string) => 
    apiRequest("GET", `/api/reports/asset-performance?timeRange=${timeRange}`).then(res => res.json()),
};

// User API
export const userApi = {
  updateProfile: (data: any) => 
    apiRequest("PATCH", "/api/user/profile", data).then(res => res.json()),
  
  changePassword: (data: any) => 
    apiRequest("POST", "/api/user/change-password", data).then(res => res.json()),
  
  updateNotifications: (data: any) => 
    apiRequest("PATCH", "/api/user/notifications", data).then(res => res.json()),
  
  getApiKeys: () => 
    apiRequest("GET", "/api/user/api-keys").then(res => res.json()),
  
  addApiKey: (data: any) => 
    apiRequest("POST", "/api/user/api-keys", data).then(res => res.json()),
  
  deleteApiKey: (id: string) => 
    apiRequest("DELETE", `/api/user/api-keys/${id}`).then(res => res.json()),
  
  updateApiKey: (id: string, data: any) => 
    apiRequest("PATCH", `/api/user/api-keys/${id}`, data).then(res => res.json()),
};

// API Status
export const apiStatusApi = {
  getStatus: () => 
    apiRequest("GET", "/api/api-status").then(res => res.json()),
  
  testConnection: (service: string) => 
    apiRequest("POST", "/api/test-api-connection", { service }).then(res => res.json()),
};
