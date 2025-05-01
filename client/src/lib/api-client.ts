import { apiRequest } from "./queryClient";
import axios from 'axios';
import { queryClient } from './queryClient';

// Set up axios instance for Java backend (live data)
const javaBackendApi = axios.create({
  baseURL: 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add interceptors for error handling and authentication
javaBackendApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors, including authentication errors
    if (error.response?.status === 401) {
      // Clear user data and redirect to login
      queryClient.setQueryData(['/api/user'], null);
    }
    return Promise.reject(error);
  }
);

// Market API - Use both Node.js and Java backend
export const marketApi = {
  // Node.js backend endpoints (existing)
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
    
  // Java backend endpoints (live data)
  getLiveMarketData: async (symbol: string) => {
    const response = await javaBackendApi.get(`/market/data/latest/${symbol}`);
    return response.data;
  },
  
  getLiveHistoricalData: async (symbol: string, limit: number = 100) => {
    const response = await javaBackendApi.get(`/market/data/historical/${symbol}?limit=${limit}`);
    return response.data;
  },
  
  getLiveMarketDataForTimeRange: async (symbol: string, startDate: string, endDate: string) => {
    const response = await javaBackendApi.get(`/market/data/range/${symbol}?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },
  
  fetchLiveMarketData: async (symbol: string) => {
    const response = await javaBackendApi.post(`/market/data/fetch/latest/${symbol}`);
    return response.data;
  },
  
  fetchLiveHistoricalData: async (symbol: string, interval: string = '1d', range: string = '1mo') => {
    const response = await javaBackendApi.post(`/market/data/fetch/historical/${symbol}?interval=${interval}&range=${range}`);
    return response.data;
  },
  
  getSymbols: async () => {
    const response = await javaBackendApi.get('/symbols');
    return response.data;
  },
  
  getSymbolByCode: async (code: string) => {
    const response = await javaBackendApi.get(`/symbols/code/${code}`);
    return response.data;
  },
  
  searchSymbols: async (query: string) => {
    const response = await javaBackendApi.get(`/symbols/search?query=${query}`);
    return response.data;
  },
  
  searchAndSaveSymbols: async (query: string) => {
    const response = await javaBackendApi.post(`/symbols/search-external?query=${query}`);
    return response.data;
  }
};

// Simulation API - Use both Node.js and Java backend
export const simulationApi = {
  // Node.js backend endpoints (existing)
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
    
  // Java backend endpoints (live data)
  getLiveSimulationsForUser: async (userId: string) => {
    const response = await javaBackendApi.get(`/simulations/user/${userId}`);
    return response.data;
  },
  
  getLiveActiveSimulationsForUser: async (userId: string) => {
    const response = await javaBackendApi.get(`/simulations/user/${userId}/active`);
    return response.data;
  },
  
  getLiveSimulationById: async (id: string) => {
    const response = await javaBackendApi.get(`/simulations/${id}`);
    return response.data;
  },
  
  createLiveSimulation: async (simulation: any) => {
    const response = await javaBackendApi.post('/simulations', simulation);
    return response.data;
  },
  
  pauseLiveSimulation: async (id: string) => {
    const response = await javaBackendApi.post(`/simulations/${id}/pause`);
    return response.data;
  },
  
  resumeLiveSimulation: async (id: string) => {
    const response = await javaBackendApi.post(`/simulations/${id}/resume`);
    return response.data;
  },
  
  stopLiveSimulation: async (id: string) => {
    const response = await javaBackendApi.post(`/simulations/${id}/stop`);
    return response.data;
  },
  
  // Strategies
  getLiveStrategies: async () => {
    const response = await javaBackendApi.get('/strategies');
    return response.data;
  },
  
  getLiveStrategyById: async (id: string) => {
    const response = await javaBackendApi.get(`/strategies/${id}`);
    return response.data;
  },
  
  getLiveStrategyByName: async (name: string) => {
    const response = await javaBackendApi.get(`/strategies/name/${name}`);
    return response.data;
  }
};

// Trades API - Use both Node.js and Java backend
export const tradesApi = {
  // Node.js backend endpoints (existing)
  getRecentTrades: () => 
    apiRequest("GET", "/api/trades/recent").then(res => res.json()),
  
  getTradeHistory: (filters: any) => 
    apiRequest("GET", `/api/trades/history?${new URLSearchParams(filters)}`).then(res => res.json()),
    
  // Java backend endpoints (live data)
  getLiveTradesForSimulation: async (simulationId: string) => {
    const response = await javaBackendApi.get(`/simulations/${simulationId}/trades`);
    return response.data;
  },
  
  getLiveRecentTradesForSimulation: async (simulationId: string, limit: number = 10) => {
    const response = await javaBackendApi.get(`/simulations/${simulationId}/trades/recent?limit=${limit}`);
    return response.data;
  },
  
  getLiveRecentTradesForUser: async (userId: string, limit: number = 10) => {
    const response = await javaBackendApi.get(`/simulations/user/${userId}/trades/recent?limit=${limit}`);
    return response.data;
  },
  
  executeLiveTrade: async (simulationId: string, trade: any) => {
    const response = await javaBackendApi.post(`/simulations/${simulationId}/trades`, trade);
    return response.data;
  }
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
    
  // Java backend connections test
  testLiveConnections: async () => {
    const response = await javaBackendApi.get('/market/test-connections');
    return response.data;
  }
};
