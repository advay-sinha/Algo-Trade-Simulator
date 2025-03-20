import { MarketData, Simulation, Strategy, Trade, User } from "@shared/schema";

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Dashboard statistics types
export interface DashboardStats {
  balance: number;
  profitLoss: number;
  successRate: number;
  avgProfitPerTrade: number;
  totalTrades: number;
  successfulTrades: number;
}

// Market data with additional UI properties
export interface EnhancedMarketData extends MarketData {
  displayName: string;
  formattedPrice: string;
  formattedChange: string;
  formattedVolume: string;
  isPositive: boolean;
}

// Strategy performance for UI
export interface StrategyPerformanceData {
  name: string;
  performance: number;
  totalTrades: number;
  successfulTrades: number;
}

// Time periods for simulations and data display
export type TimePeriod = "24h" | "48h" | "1w" | "custom";

// Chart time frames
export type TimeFrame = "1D" | "1W" | "1M" | "3M" | "1Y";

// Trade type
export type TradeType = "buy" | "sell";

// Simulation status
export type SimulationStatus = "running" | "completed" | "cancelled";

// Market preferences
export interface MarketPreferences {
  favoriteSymbols: string[];
  defaultTimeFrame: TimeFrame;
  defaultStrategy: string;
}

// User settings
export interface UserSettings {
  darkMode: boolean;
  notificationsEnabled: boolean;
  emailAlerts: boolean;
  initialBalance: number;
  marketPreferences: MarketPreferences;
}
