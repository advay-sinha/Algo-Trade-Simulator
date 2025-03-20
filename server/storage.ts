import {
  User, InsertUser,
  MarketData, InsertMarketData,
  Trade, InsertTrade,
  Simulation, InsertSimulation,
  Strategy, InsertStrategy
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// Storage interface
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Market data methods
  getMarketData(symbol: string): Promise<MarketData | undefined>;
  getMarketDataHistory(symbol: string, limit?: number): Promise<MarketData[]>;
  addMarketData(data: InsertMarketData): Promise<MarketData>;
  
  // Trade methods
  getTrade(id: number): Promise<Trade | undefined>;
  getUserTrades(userId: number, limit?: number): Promise<Trade[]>;
  getSimulationTrades(simulationId: number): Promise<Trade[]>;
  addTrade(trade: InsertTrade): Promise<Trade>;
  
  // Simulation methods
  getSimulation(id: number): Promise<Simulation | undefined>;
  getUserSimulations(userId: number, limit?: number): Promise<Simulation[]>;
  getActiveSimulations(): Promise<Simulation[]>;
  addSimulation(simulation: InsertSimulation): Promise<Simulation>;
  updateSimulation(id: number, data: Partial<Simulation>): Promise<Simulation | undefined>;
  
  // Strategy methods
  getStrategy(id: number): Promise<Strategy | undefined>;
  getStrategyByName(name: string): Promise<Strategy | undefined>;
  getAllStrategies(): Promise<Strategy[]>;
  addStrategy(strategy: InsertStrategy): Promise<Strategy>;
  
  // Session store
  sessionStore: session.SessionStore;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private marketData: Map<string, MarketData[]>;
  private trades: Map<number, Trade>;
  private simulations: Map<number, Simulation>;
  private strategies: Map<number, Strategy>;
  private currentIds: {
    user: number;
    marketData: number;
    trade: number;
    simulation: number;
    strategy: number;
  };
  sessionStore: session.SessionStore;

  constructor() {
    this.users = new Map();
    this.marketData = new Map();
    this.trades = new Map();
    this.simulations = new Map();
    this.strategies = new Map();
    this.currentIds = {
      user: 1,
      marketData: 1,
      trade: 1,
      simulation: 1,
      strategy: 1
    };
    
    // Initialize session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 24 hours
    });
    
    // Add default strategies
    this.initDefaultStrategies();
  }

  private initDefaultStrategies() {
    const defaultStrategies: InsertStrategy[] = [
      {
        name: "Moving Average Crossover",
        description: "Uses short-term and long-term moving averages to identify trend reversals",
        parameters: JSON.stringify({
          shortPeriod: 10,
          longPeriod: 50
        })
      },
      {
        name: "RSI Oscillator",
        description: "Uses the Relative Strength Index to identify overbought and oversold conditions",
        parameters: JSON.stringify({
          period: 14,
          overbought: 70,
          oversold: 30
        })
      },
      {
        name: "MACD Divergence",
        description: "Uses the Moving Average Convergence Divergence indicator to identify momentum shifts",
        parameters: JSON.stringify({
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9
        })
      },
      {
        name: "Bollinger Bands",
        description: "Uses standard deviations from a moving average to identify volatility and potential reversals",
        parameters: JSON.stringify({
          period: 20,
          standardDeviations: 2
        })
      },
      {
        name: "Custom Strategy",
        description: "A custom strategy combining multiple indicators",
        parameters: JSON.stringify({
          customParam1: 15,
          customParam2: 40
        })
      }
    ];

    defaultStrategies.forEach(strategy => {
      this.addStrategy(strategy);
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.user++;
    const createdAt = new Date();
    const user: User = { ...insertUser, id, createdAt };
    this.users.set(id, user);
    return user;
  }

  // Market data methods
  async getMarketData(symbol: string): Promise<MarketData | undefined> {
    const data = this.marketData.get(symbol);
    if (!data || data.length === 0) return undefined;
    return data[data.length - 1]; // Return the most recent data
  }

  async getMarketDataHistory(symbol: string, limit = 100): Promise<MarketData[]> {
    const data = this.marketData.get(symbol);
    if (!data) return [];
    
    // Sort by timestamp and limit
    return [...data].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, limit);
  }

  async addMarketData(data: InsertMarketData): Promise<MarketData> {
    const id = this.currentIds.marketData++;
    const timestamp = new Date();
    const marketData: MarketData = { ...data, id, timestamp };
    
    // Initialize array for symbol if it doesn't exist
    if (!this.marketData.has(data.symbol)) {
      this.marketData.set(data.symbol, []);
    }
    
    // Add to the array for that symbol
    this.marketData.get(data.symbol)!.push(marketData);
    
    return marketData;
  }

  // Trade methods
  async getTrade(id: number): Promise<Trade | undefined> {
    return this.trades.get(id);
  }

  async getUserTrades(userId: number, limit = 100): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .filter(trade => trade.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getSimulationTrades(simulationId: number): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .filter(trade => trade.simulationId === simulationId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async addTrade(trade: InsertTrade): Promise<Trade> {
    const id = this.currentIds.trade++;
    const timestamp = new Date();
    const newTrade: Trade = { ...trade, id, timestamp };
    this.trades.set(id, newTrade);
    return newTrade;
  }

  // Simulation methods
  async getSimulation(id: number): Promise<Simulation | undefined> {
    return this.simulations.get(id);
  }

  async getUserSimulations(userId: number, limit = 100): Promise<Simulation[]> {
    return Array.from(this.simulations.values())
      .filter(sim => sim.userId === userId)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit);
  }

  async getActiveSimulations(): Promise<Simulation[]> {
    return Array.from(this.simulations.values())
      .filter(sim => sim.status === "running");
  }

  async addSimulation(simulation: InsertSimulation): Promise<Simulation> {
    const id = this.currentIds.simulation++;
    const startTime = new Date();
    const newSimulation: Simulation = {
      ...simulation,
      id,
      startTime,
      endTime: null,
      finalBalance: null,
      profitLoss: null,
      profitLossPercent: null,
      totalTrades: 0,
      successfulTrades: 0,
      successRate: null,
      avgProfitPerTrade: null,
      status: "running"
    };
    this.simulations.set(id, newSimulation);
    return newSimulation;
  }

  async updateSimulation(id: number, data: Partial<Simulation>): Promise<Simulation | undefined> {
    const simulation = this.simulations.get(id);
    if (!simulation) return undefined;
    
    const updatedSimulation = { ...simulation, ...data };
    this.simulations.set(id, updatedSimulation);
    return updatedSimulation;
  }

  // Strategy methods
  async getStrategy(id: number): Promise<Strategy | undefined> {
    return this.strategies.get(id);
  }

  async getStrategyByName(name: string): Promise<Strategy | undefined> {
    return Array.from(this.strategies.values())
      .find(strategy => strategy.name === name);
  }

  async getAllStrategies(): Promise<Strategy[]> {
    return Array.from(this.strategies.values());
  }

  async addStrategy(strategy: InsertStrategy): Promise<Strategy> {
    const id = this.currentIds.strategy++;
    const newStrategy: Strategy = { ...strategy, id };
    this.strategies.set(id, newStrategy);
    return newStrategy;
  }
}

export const storage = new MemStorage();
