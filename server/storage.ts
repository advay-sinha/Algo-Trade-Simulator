import session from "express-session";
import createMemoryStore from "memorystore";
import {
  users, User, InsertUser, 
  symbols, Symbol, InsertSymbol,
  strategies, Strategy, InsertStrategy,
  simulations, Simulation, InsertSimulation,
  trades, Trade, InsertTrade,
  marketData, MarketData, InsertMarketData
} from "@shared/schema";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Symbols
  getSymbols(): Promise<Symbol[]>;
  getSymbol(id: number): Promise<Symbol | undefined>;
  getSymbolByCode(symbol: string): Promise<Symbol | undefined>;
  createSymbol(symbol: InsertSymbol): Promise<Symbol>;
  
  // Strategies
  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: number): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;
  
  // Simulations
  getSimulations(userId: number): Promise<Simulation[]>;
  getActiveSimulations(userId: number): Promise<Simulation[]>;
  getSimulation(id: number): Promise<Simulation | undefined>;
  createSimulation(simulation: InsertSimulation): Promise<Simulation>;
  updateSimulation(id: number, updates: Partial<Simulation>): Promise<Simulation | undefined>;
  
  // Trades
  getTrades(simulationId: number): Promise<Trade[]>;
  getRecentTrades(userId: number, limit: number): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  
  // Market data
  getMarketData(symbolId: number, limit: number): Promise<MarketData[]>;
  getLatestMarketData(symbolId: number): Promise<MarketData | undefined>;
  createMarketData(data: InsertMarketData): Promise<MarketData>;
  
  // Session store
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private _users: Map<number, User>;
  private _symbols: Map<number, Symbol>;
  private _strategies: Map<number, Strategy>;
  private _simulations: Map<number, Simulation>;
  private _trades: Map<number, Trade>;
  private _marketData: Map<number, MarketData>;
  sessionStore: session.SessionStore;

  private userIdCounter: number;
  private symbolIdCounter: number;
  private strategyIdCounter: number;
  private simulationIdCounter: number;
  private tradeIdCounter: number;
  private marketDataIdCounter: number;

  constructor() {
    this._users = new Map();
    this._symbols = new Map();
    this._strategies = new Map();
    this._simulations = new Map();
    this._trades = new Map();
    this._marketData = new Map();

    this.userIdCounter = 1;
    this.symbolIdCounter = 1;
    this.strategyIdCounter = 1;
    this.simulationIdCounter = 1;
    this.tradeIdCounter = 1;
    this.marketDataIdCounter = 1;

    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // Prune expired entries every 24h
    });

    // Initialize with sample strategies
    this.initializeStrategies();
  }

  private initializeStrategies() {
    const strategies: InsertStrategy[] = [
      {
        name: "Mean Reversion",
        description: "This strategy assumes that prices and returns eventually move back towards the mean or average. When the price deviates too much from the mean, the algorithm initiates trades expecting the price to revert.",
        timeFrame: "Hourly data, 2-hour trades",
        successRate: "65% - 75%",
        bestMarketCondition: "Ranging/Sideways markets",
        riskRating: "Medium"
      },
      {
        name: "Momentum Trading",
        description: "This strategy capitalizes on the continuance of existing market trends. It buys assets that have been rising and avoids or sells those that have been declining.",
        timeFrame: "Hourly data, 2-hour trades",
        successRate: "60% - 70%",
        bestMarketCondition: "Trending markets",
        riskRating: "High"
      },
      {
        name: "RSI Strategy",
        description: "Uses the Relative Strength Index (RSI) to identify overbought and oversold conditions. Buys when RSI falls below 30 (oversold) and sells when it rises above 70 (overbought).",
        timeFrame: "Hourly data, 2-hour trades",
        successRate: "65% - 70%",
        bestMarketCondition: "Volatile markets",
        riskRating: "Medium"
      },
      {
        name: "Moving Average Crossover",
        description: "Generates buy signals when a short-term moving average crosses above a long-term moving average and sell signals when the short-term average crosses below the long-term average.",
        timeFrame: "Hourly data, 2-hour trades",
        successRate: "55% - 65%",
        bestMarketCondition: "Trending markets",
        riskRating: "Medium"
      }
    ];

    strategies.forEach(strategy => {
      this.createStrategy(strategy);
    });
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    return this._users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this._users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this._users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const createdAt = new Date();
    const user: User = { ...userData, id, createdAt };
    this._users.set(id, user);
    return user;
  }

  // Symbols
  async getSymbols(): Promise<Symbol[]> {
    return Array.from(this._symbols.values());
  }

  async getSymbol(id: number): Promise<Symbol | undefined> {
    return this._symbols.get(id);
  }

  async getSymbolByCode(symbol: string): Promise<Symbol | undefined> {
    return Array.from(this._symbols.values()).find(
      (s) => s.symbol.toUpperCase() === symbol.toUpperCase()
    );
  }

  async createSymbol(symbolData: InsertSymbol): Promise<Symbol> {
    const id = this.symbolIdCounter++;
    const symbol: Symbol = { ...symbolData, id };
    this._symbols.set(id, symbol);
    return symbol;
  }

  // Strategies
  async getStrategies(): Promise<Strategy[]> {
    return Array.from(this._strategies.values());
  }

  async getStrategy(id: number): Promise<Strategy | undefined> {
    return this._strategies.get(id);
  }

  async createStrategy(strategyData: InsertStrategy): Promise<Strategy> {
    const id = this.strategyIdCounter++;
    const strategy: Strategy = { ...strategyData, id };
    this._strategies.set(id, strategy);
    return strategy;
  }

  // Simulations
  async getSimulations(userId: number): Promise<Simulation[]> {
    return Array.from(this._simulations.values()).filter(
      (sim) => sim.userId === userId
    );
  }

  async getActiveSimulations(userId: number): Promise<Simulation[]> {
    return Array.from(this._simulations.values()).filter(
      (sim) => sim.userId === userId && sim.status === 'active'
    );
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    return this._simulations.get(id);
  }

  async createSimulation(simulationData: InsertSimulation): Promise<Simulation> {
    const id = this.simulationIdCounter++;
    const startTime = new Date();
    const simulation: Simulation = {
      ...simulationData,
      id,
      startTime,
      endTime: null,
      status: 'active',
      profitLoss: 0,
      profitLossPercentage: 0
    };
    this._simulations.set(id, simulation);
    return simulation;
  }

  async updateSimulation(id: number, updates: Partial<Simulation>): Promise<Simulation | undefined> {
    const simulation = this._simulations.get(id);
    if (!simulation) return undefined;

    const updatedSimulation = { ...simulation, ...updates };
    this._simulations.set(id, updatedSimulation);
    return updatedSimulation;
  }

  // Trades
  async getTrades(simulationId: number): Promise<Trade[]> {
    return Array.from(this._trades.values())
      .filter(trade => trade.simulationId === simulationId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getRecentTrades(userId: number, limit: number): Promise<Trade[]> {
    const userSimulations = Array.from(this._simulations.values())
      .filter(sim => sim.userId === userId)
      .map(sim => sim.id);
    
    return Array.from(this._trades.values())
      .filter(trade => userSimulations.includes(trade.simulationId))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async createTrade(tradeData: InsertTrade): Promise<Trade> {
    const id = this.tradeIdCounter++;
    const timestamp = new Date();
    const trade: Trade = { ...tradeData, id, timestamp };
    this._trades.set(id, trade);
    return trade;
  }

  // Market data
  async getMarketData(symbolId: number, limit: number): Promise<MarketData[]> {
    return Array.from(this._marketData.values())
      .filter(data => data.symbolId === symbolId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getLatestMarketData(symbolId: number): Promise<MarketData | undefined> {
    const data = Array.from(this._marketData.values())
      .filter(data => data.symbolId === symbolId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return data.length > 0 ? data[0] : undefined;
  }

  async createMarketData(marketDataEntry: InsertMarketData): Promise<MarketData> {
    const id = this.marketDataIdCounter++;
    const timestamp = new Date();
    const data: MarketData = { ...marketDataEntry, id, timestamp };
    this._marketData.set(id, data);
    return data;
  }
}

export const storage = new MemStorage();
