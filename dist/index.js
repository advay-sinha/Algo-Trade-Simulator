// server/index.ts
import "dotenv/config";
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import session from "express-session";
import createMemoryStore from "memorystore";
var MemoryStore = createMemoryStore(session);
var MemStorage = class {
  _users;
  _symbols;
  _strategies;
  _simulations;
  _trades;
  _marketData;
  sessionStore;
  userIdCounter;
  symbolIdCounter;
  strategyIdCounter;
  simulationIdCounter;
  tradeIdCounter;
  marketDataIdCounter;
  constructor() {
    this._users = /* @__PURE__ */ new Map();
    this._symbols = /* @__PURE__ */ new Map();
    this._strategies = /* @__PURE__ */ new Map();
    this._simulations = /* @__PURE__ */ new Map();
    this._trades = /* @__PURE__ */ new Map();
    this._marketData = /* @__PURE__ */ new Map();
    this.userIdCounter = 1;
    this.symbolIdCounter = 1;
    this.strategyIdCounter = 1;
    this.simulationIdCounter = 1;
    this.tradeIdCounter = 1;
    this.marketDataIdCounter = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 864e5
      // Prune expired entries every 24h
    });
    this.initializeStrategies();
  }
  initializeStrategies() {
    const strategies2 = [
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
    strategies2.forEach((strategy) => {
      this.createStrategy(strategy);
    });
  }
  // User management
  async getUser(id) {
    return this._users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this._users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }
  async getUserByEmail(email) {
    return Array.from(this._users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
  }
  async createUser(userData) {
    const id = this.userIdCounter++;
    const createdAt = /* @__PURE__ */ new Date();
    const user = { ...userData, id, createdAt };
    this._users.set(id, user);
    return user;
  }
  // Symbols
  async getSymbols() {
    return Array.from(this._symbols.values());
  }
  async getSymbol(id) {
    return this._symbols.get(id);
  }
  async getSymbolByCode(symbol) {
    return Array.from(this._symbols.values()).find(
      (s) => s.symbol.toUpperCase() === symbol.toUpperCase()
    );
  }
  async createSymbol(symbolData) {
    const id = this.symbolIdCounter++;
    const symbol = { ...symbolData, id };
    this._symbols.set(id, symbol);
    return symbol;
  }
  // Strategies
  async getStrategies() {
    return Array.from(this._strategies.values());
  }
  async getStrategy(id) {
    return this._strategies.get(id);
  }
  async createStrategy(strategyData) {
    const id = this.strategyIdCounter++;
    const strategy = { ...strategyData, id };
    this._strategies.set(id, strategy);
    return strategy;
  }
  // Simulations
  async getSimulations(userId) {
    return Array.from(this._simulations.values()).filter(
      (sim) => sim.userId === userId
    );
  }
  async getActiveSimulations(userId) {
    return Array.from(this._simulations.values()).filter(
      (sim) => sim.userId === userId && sim.status === "active"
    );
  }
  async getSimulation(id) {
    return this._simulations.get(id);
  }
  async createSimulation(simulationData) {
    const id = this.simulationIdCounter++;
    const startTime = /* @__PURE__ */ new Date();
    const simulation = {
      ...simulationData,
      id,
      startTime,
      endTime: null,
      status: "active",
      profitLoss: 0,
      profitLossPercentage: 0
    };
    this._simulations.set(id, simulation);
    return simulation;
  }
  async updateSimulation(id, updates) {
    const simulation = this._simulations.get(id);
    if (!simulation) return void 0;
    const updatedSimulation = { ...simulation, ...updates };
    this._simulations.set(id, updatedSimulation);
    return updatedSimulation;
  }
  // Trades
  async getTrades(simulationId) {
    return Array.from(this._trades.values()).filter((trade) => trade.simulationId === simulationId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  async getRecentTrades(userId, limit) {
    const userSimulations = Array.from(this._simulations.values()).filter((sim) => sim.userId === userId).map((sim) => sim.id);
    return Array.from(this._trades.values()).filter((trade) => userSimulations.includes(trade.simulationId)).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
  async createTrade(tradeData) {
    const id = this.tradeIdCounter++;
    const timestamp2 = /* @__PURE__ */ new Date();
    const trade = { ...tradeData, id, timestamp: timestamp2 };
    this._trades.set(id, trade);
    return trade;
  }
  // Market data
  async getMarketData(symbolId, limit) {
    return Array.from(this._marketData.values()).filter((data) => data.symbolId === symbolId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
  async getLatestMarketData(symbolId) {
    const data = Array.from(this._marketData.values()).filter((data2) => data2.symbolId === symbolId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return data.length > 0 ? data[0] : void 0;
  }
  async createMarketData(marketDataEntry) {
    const id = this.marketDataIdCounter++;
    const timestamp2 = /* @__PURE__ */ new Date();
    const data = { ...marketDataEntry, id, timestamp: timestamp2 };
    this._marketData.set(id, data);
    return data;
  }
};
var storage = new MemStorage();

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";

// shared/schema.ts
import { pgTable, text, serial, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  email: true
});
var symbols = pgTable("symbols", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().unique(),
  exchange: text("exchange").notNull(),
  type: text("type").notNull(),
  description: text("description")
});
var insertSymbolSchema = createInsertSchema(symbols).pick({
  name: true,
  symbol: true,
  exchange: true,
  type: true,
  description: true
});
var strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  timeFrame: text("time_frame").notNull(),
  successRate: text("success_rate"),
  bestMarketCondition: text("best_market_condition"),
  riskRating: text("risk_rating").notNull()
});
var insertStrategySchema = createInsertSchema(strategies).pick({
  name: true,
  description: true,
  timeFrame: true,
  successRate: true,
  bestMarketCondition: true,
  riskRating: true
});
var simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbolId: integer("symbol_id").notNull(),
  strategyId: integer("strategy_id").notNull(),
  investment: real("investment").notNull(),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  status: text("status").notNull(),
  // 'active', 'completed', 'cancelled'
  timeperiod: text("timeperiod").notNull(),
  interval: text("interval").notNull(),
  profitLoss: real("profit_loss"),
  profitLossPercentage: real("profit_loss_percentage"),
  settings: jsonb("settings").notNull()
});
var insertSimulationSchema = createInsertSchema(simulations).pick({
  userId: true,
  symbolId: true,
  strategyId: true,
  investment: true,
  timeperiod: true,
  interval: true,
  settings: true
});
var trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  simulationId: integer("simulation_id").notNull(),
  type: text("type").notNull(),
  // 'buy', 'sell'
  price: real("price").notNull(),
  quantity: real("quantity").notNull(),
  amount: real("amount").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: text("status").notNull()
  // 'completed', 'pending', 'cancelled'
});
var insertTradeSchema = createInsertSchema(trades).pick({
  simulationId: true,
  type: true,
  price: true,
  quantity: true,
  amount: true,
  status: true
});
var marketData = pgTable("market_data", {
  id: serial("id").primaryKey(),
  symbolId: integer("symbol_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  source: text("source").notNull()
});
var insertMarketDataSchema = createInsertSchema(marketData).pick({
  symbolId: true,
  open: true,
  high: true,
  low: true,
  close: true,
  volume: true,
  source: true
});

// server/auth.ts
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
var registerSchema = insertUserSchema.extend({
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});
function setupAuth(app2) {
  const isDev = app2.get("env") === "development";
  const sessionSecret = process.env.SESSION_SECRET || "algo-trade-secret-key";
  const sessionSettings = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: !isDev,
      maxAge: 1e3 * 60 * 60 * 24 * 7
      // 1 week
    }
  };
  if (!isDev) {
    app2.set("trust proxy", 1);
  }
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !await comparePasswords(password, user.password)) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
  app2.post("/api/register", async (req, res, next) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Validation failed", errors: result.error.format() });
      }
      const { username, password, name, email } = result.data;
      const existingUser = await storage.getUserByUsername(username);
      const existingEmail = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        email
      });
      const { password: _, ...userWithoutPassword } = user;
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid username or password" });
      req.login(user, (err2) => {
        if (err2) return next(err2);
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
}

// server/api/market.ts
import { Router } from "express";
import axios from "axios";
import { z as z2 } from "zod";
var router = Router();
var searchSymbolSchema = z2.object({
  query: z2.string().min(1, "Search query is required")
});
async function fetchSymbolData(symbol) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}.BSE&apikey=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;
    if (data["Global Quote"] && Object.keys(data["Global Quote"]).length > 0) {
      const quote = data["Global Quote"];
      return {
        open: parseFloat(quote["02. open"]),
        high: parseFloat(quote["03. high"]),
        low: parseFloat(quote["04. low"]),
        close: parseFloat(quote["05. price"]),
        volume: parseFloat(quote["06. volume"]),
        source: "Alpha Vantage"
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching symbol data:", error);
    return null;
  }
}
async function fetchSymbolDataYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d`;
    const response = await axios.get(url);
    const data = response.data;
    if (data.chart && data.chart.result && data.chart.result.length > 0) {
      const result = data.chart.result[0];
      const quote = result.indicators.quote[0];
      const timestamp2 = result.timestamp[result.timestamp.length - 1] * 1e3;
      return {
        open: quote.open[quote.open.length - 1],
        high: quote.high[quote.high.length - 1],
        low: quote.low[quote.low.length - 1],
        close: quote.close[quote.close.length - 1],
        volume: quote.volume[quote.volume.length - 1],
        source: "Yahoo Finance"
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching symbol data from Yahoo:", error);
    return null;
  }
}
router.get("/symbols", async (req, res) => {
  try {
    const symbols2 = await storage.getSymbols();
    res.json(symbols2);
  } catch (error) {
    console.error("Error fetching symbols:", error);
    res.status(500).json({ message: "Failed to fetch symbols" });
  }
});
router.get("/symbols/search", async (req, res) => {
  try {
    const result = searchSymbolSchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid search parameters" });
    }
    const { query } = result.data;
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${query}&apikey=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;
    if (data.bestMatches && Array.isArray(data.bestMatches)) {
      const indianSymbols = data.bestMatches.filter(
        (match) => match["4. region"] === "India" && (match["3. type"] === "Equity" || match["3. type"] === "ETF")
      );
      res.json(indianSymbols.map((match) => ({
        symbol: match["1. symbol"].replace(".BSE", "").replace(".NSE", ""),
        name: match["2. name"],
        type: match["3. type"],
        exchange: match["8. exchange"],
        description: ""
      })));
    } else {
      res.status(404).json({ message: "No symbols found" });
    }
  } catch (error) {
    console.error("Error searching symbols:", error);
    res.status(500).json({ message: "Failed to search symbols" });
  }
});
router.get("/data/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    let symbolData = await storage.getSymbolByCode(symbol);
    if (!symbolData) {
      try {
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
        const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${apiKey}`;
        const response = await axios.get(url);
        const data = response.data;
        if (data.bestMatches && data.bestMatches.length > 0) {
          const match = data.bestMatches[0];
          const newSymbol = {
            name: match["2. name"],
            symbol,
            exchange: match["8. exchange"],
            type: match["3. type"],
            description: ""
          };
          symbolData = await storage.createSymbol(newSymbol);
        } else {
          const newSymbol = {
            name: symbol,
            symbol,
            exchange: "NSE/BSE",
            type: "Equity",
            description: ""
          };
          symbolData = await storage.createSymbol(newSymbol);
        }
      } catch (error) {
        console.error("Error creating symbol:", error);
        return res.status(500).json({ message: "Failed to create symbol" });
      }
    }
    let marketData2 = await storage.getLatestMarketData(symbolData.id);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1e3);
    if (!marketData2 || marketData2.timestamp < fifteenMinutesAgo) {
      let newMarketData = await fetchSymbolData(symbol);
      if (!newMarketData) {
        newMarketData = await fetchSymbolDataYahoo(symbol);
      }
      if (newMarketData) {
        const marketDataEntry = {
          symbolId: symbolData.id,
          ...newMarketData
        };
        marketData2 = await storage.createMarketData(marketDataEntry);
      }
    }
    if (!marketData2) {
      return res.status(404).json({ message: "No market data available for this symbol" });
    }
    res.json({
      symbol: symbolData,
      data: marketData2
    });
  } catch (error) {
    console.error("Error fetching market data:", error);
    res.status(500).json({ message: "Failed to fetch market data" });
  }
});
router.get("/history/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 30;
    const symbolData = await storage.getSymbolByCode(symbol);
    if (!symbolData) {
      return res.status(404).json({ message: "Symbol not found" });
    }
    const historicalData = await storage.getMarketData(symbolData.id, limit);
    if (historicalData.length < limit) {
      try {
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}.BSE&apikey=${apiKey}`;
        const response = await axios.get(url);
        const data = response.data;
        if (data["Time Series (Daily)"]) {
          const timeSeriesData = data["Time Series (Daily)"];
          const dates = Object.keys(timeSeriesData).sort().reverse();
          for (const date of dates.slice(0, limit)) {
            const entry = timeSeriesData[date];
            const newMarketData = {
              symbolId: symbolData.id,
              open: parseFloat(entry["1. open"]),
              high: parseFloat(entry["2. high"]),
              low: parseFloat(entry["3. low"]),
              close: parseFloat(entry["4. close"]),
              volume: parseFloat(entry["5. volume"]),
              source: "Alpha Vantage"
            };
            await storage.createMarketData(newMarketData);
          }
          const updatedHistoricalData = await storage.getMarketData(symbolData.id, limit);
          return res.json(updatedHistoricalData);
        }
      } catch (error) {
        console.error("Error fetching historical data from Alpha Vantage:", error);
      }
    }
    res.json(historicalData);
  } catch (error) {
    console.error("Error fetching historical data:", error);
    res.status(500).json({ message: "Failed to fetch historical data" });
  }
});
var market_default = router;

// server/api/simulation.ts
import { Router as Router2 } from "express";

// server/utils/trade.ts
function generateTrade(simulation, marketData2, previousTrades, forcedType) {
  const riskLevel = (simulation.settings.riskLevel || "Medium").toLowerCase();
  const stopLoss = simulation.settings.stopLoss || 3;
  const takeProfit = simulation.settings.takeProfit || 5;
  let lastTradePrice = 0;
  let lastTradeType = "";
  if (previousTrades.length > 0) {
    const lastTrade = previousTrades[0];
    lastTradePrice = lastTrade.price;
    lastTradeType = lastTrade.type;
  }
  const currentPrice = marketData2.close;
  const priceChangePercent = lastTradePrice ? (currentPrice - lastTradePrice) / lastTradePrice * 100 : 0;
  let tradeType = forcedType || "buy";
  if (!forcedType) {
    if (previousTrades.length > 0) {
      switch (simulation.strategyId) {
        case 1:
          tradeType = priceChangePercent < -2 ? "buy" : "sell";
          break;
        case 2:
          tradeType = priceChangePercent > 0 ? "buy" : "sell";
          break;
        case 3:
          if (priceChangePercent <= -stopLoss) {
            tradeType = "sell";
          } else if (priceChangePercent >= takeProfit) {
            tradeType = "sell";
          } else {
            tradeType = lastTradeType === "buy" ? "sell" : "buy";
          }
          break;
        case 4:
          tradeType = priceChangePercent > 1 ? "buy" : "sell";
          break;
        default:
          tradeType = lastTradeType === "buy" ? "sell" : "buy";
      }
    }
  }
  const tradeAmount = tradeType === "buy" ? 7500 : 7500;
  let quantity = parseFloat((tradeAmount / currentPrice).toFixed(2));
  if (tradeType === "sell") {
    const availableShares = previousTrades.reduce((sum, trade) => {
      return trade.type === "buy" ? sum + trade.quantity : sum - trade.quantity;
    }, 0);
    quantity = Math.min(quantity, availableShares);
    if (quantity <= 0) {
      tradeType = "buy";
      quantity = parseFloat((tradeAmount / currentPrice).toFixed(2));
    }
  }
  return {
    simulationId: simulation.id,
    type: tradeType,
    price: currentPrice,
    quantity,
    amount: parseFloat((quantity * currentPrice).toFixed(2)),
    status: "completed"
  };
}

// server/api/simulation.ts
var router2 = Router2();
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}
router2.get("/strategies", async (req, res) => {
  try {
    const strategies2 = await storage.getStrategies();
    res.json(strategies2);
  } catch (error) {
    console.error("Error fetching strategies:", error);
    res.status(500).json({ message: "Failed to fetch strategies" });
  }
});
router2.get("/strategies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid strategy ID" });
    }
    const strategy = await storage.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    res.json(strategy);
  } catch (error) {
    console.error("Error fetching strategy:", error);
    res.status(500).json({ message: "Failed to fetch strategy" });
  }
});
router2.get("/simulations", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulations2 = await storage.getSimulations(userId);
    const augmentedSimulations = await Promise.all(simulations2.map(async (sim) => {
      const symbol = await storage.getSymbol(sim.symbolId);
      const strategy = await storage.getStrategy(sim.strategyId);
      return {
        ...sim,
        symbol,
        strategy
      };
    }));
    res.json(augmentedSimulations);
  } catch (error) {
    console.error("Error fetching simulations:", error);
    res.status(500).json({ message: "Failed to fetch simulations" });
  }
});
router2.get("/simulations/active", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulations2 = await storage.getActiveSimulations(userId);
    const augmentedSimulations = await Promise.all(simulations2.map(async (sim) => {
      const symbol = await storage.getSymbol(sim.symbolId);
      const strategy = await storage.getStrategy(sim.strategyId);
      return {
        ...sim,
        symbol,
        strategy
      };
    }));
    res.json(augmentedSimulations);
  } catch (error) {
    console.error("Error fetching active simulations:", error);
    res.status(500).json({ message: "Failed to fetch active simulations" });
  }
});
router2.get("/simulations/:id", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }
    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const symbol = await storage.getSymbol(simulation.symbolId);
    const strategy = await storage.getStrategy(simulation.strategyId);
    res.json({
      ...simulation,
      symbol,
      strategy
    });
  } catch (error) {
    console.error("Error fetching simulation:", error);
    res.status(500).json({ message: "Failed to fetch simulation" });
  }
});
router2.post("/simulations", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulationData = {
      ...req.body,
      userId
    };
    const result = insertSimulationSchema.safeParse(simulationData);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid simulation data", errors: result.error.format() });
    }
    const symbol = await storage.getSymbol(result.data.symbolId);
    if (!symbol) {
      return res.status(404).json({ message: "Symbol not found" });
    }
    const strategy = await storage.getStrategy(result.data.strategyId);
    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    const simulation = await storage.createSimulation(result.data);
    const marketData2 = await storage.getLatestMarketData(symbol.id);
    if (marketData2) {
      const tradeData = {
        simulationId: simulation.id,
        type: "buy",
        price: marketData2.close,
        quantity: parseFloat((result.data.investment / marketData2.close).toFixed(2)),
        amount: result.data.investment,
        status: "completed"
      };
      await storage.createTrade(tradeData);
    }
    res.status(201).json({
      ...simulation,
      symbol,
      strategy
    });
  } catch (error) {
    console.error("Error creating simulation:", error);
    res.status(500).json({ message: "Failed to create simulation" });
  }
});
router2.patch("/simulations/:id", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }
    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const updates = {
      status: req.body.status,
      endTime: req.body.status === "completed" ? /* @__PURE__ */ new Date() : simulation.endTime,
      profitLoss: req.body.profitLoss,
      profitLossPercentage: req.body.profitLossPercentage
    };
    const updatedSimulation = await storage.updateSimulation(id, updates);
    if (!updatedSimulation) {
      return res.status(500).json({ message: "Failed to update simulation" });
    }
    const symbol = await storage.getSymbol(updatedSimulation.symbolId);
    const strategy = await storage.getStrategy(updatedSimulation.strategyId);
    res.json({
      ...updatedSimulation,
      symbol,
      strategy
    });
  } catch (error) {
    console.error("Error updating simulation:", error);
    res.status(500).json({ message: "Failed to update simulation" });
  }
});
router2.post("/simulations/:id/trade", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }
    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (simulation.status !== "active") {
      return res.status(400).json({ message: "Cannot create trade for inactive simulation" });
    }
    const marketData2 = await storage.getLatestMarketData(simulation.symbolId);
    if (!marketData2) {
      return res.status(404).json({ message: "No market data available" });
    }
    const previousTrades = await storage.getTrades(simulation.id);
    const tradeData = generateTrade(simulation, marketData2, previousTrades, req.body.type);
    const result = insertTradeSchema.safeParse(tradeData);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid trade data", errors: result.error.format() });
    }
    const trade = await storage.createTrade(result.data);
    let totalInvested = 0;
    let currentValue = 0;
    for (const t of [...previousTrades, trade]) {
      if (t.type === "buy") {
        totalInvested += t.amount;
      } else if (t.type === "sell") {
        totalInvested -= t.amount;
      }
    }
    const totalShares = previousTrades.concat(trade).reduce((sum, t) => {
      return t.type === "buy" ? sum + t.quantity : sum - t.quantity;
    }, 0);
    currentValue = totalShares * marketData2.close;
    const profitLoss = currentValue - totalInvested;
    const profitLossPercentage = profitLoss / totalInvested * 100;
    await storage.updateSimulation(simulation.id, {
      profitLoss,
      profitLossPercentage
    });
    res.status(201).json(trade);
  } catch (error) {
    console.error("Error creating trade:", error);
    res.status(500).json({ message: "Failed to create trade" });
  }
});
router2.get("/simulations/:id/trades", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }
    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const trades2 = await storage.getTrades(id);
    res.json(trades2);
  } catch (error) {
    console.error("Error fetching trades:", error);
    res.status(500).json({ message: "Failed to fetch trades" });
  }
});
router2.get("/trades/recent", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const trades2 = await storage.getRecentTrades(userId, limit);
    const augmentedTrades = await Promise.all(trades2.map(async (trade) => {
      const simulation = await storage.getSimulation(trade.simulationId);
      const symbol = await storage.getSymbol(simulation?.symbolId || 0);
      const strategy = await storage.getStrategy(simulation?.strategyId || 0);
      return {
        ...trade,
        simulation: {
          ...simulation,
          symbol,
          strategy
        }
      };
    }));
    res.json(augmentedTrades);
  } catch (error) {
    console.error("Error fetching recent trades:", error);
    res.status(500).json({ message: "Failed to fetch recent trades" });
  }
});
var simulation_default = router2;

// server/routes.ts
import cron from "node-cron";
async function registerRoutes(app2) {
  setupAuth(app2);
  app2.use("/api/market", market_default);
  app2.use("/api/simulation", simulation_default);
  app2.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  const httpServer = createServer(app2);
  cron.schedule("0 */2 * * *", async () => {
    try {
      console.log("Running scheduled trade simulation...");
      const activeSimulations = [];
      for (const sim of storage._simulations.values()) {
        if (sim.status === "active") {
          activeSimulations.push(sim);
        }
      }
      console.log(`Found ${activeSimulations.length} active simulations`);
      for (const simulation of activeSimulations) {
        const marketData2 = await storage.getLatestMarketData(simulation.symbolId);
        if (!marketData2) continue;
        const previousTrades = await storage.getTrades(simulation.id);
        const tradeData = generateTrade(simulation, marketData2, previousTrades);
        const trade = await storage.createTrade(tradeData);
        let totalInvested = 0;
        let currentValue = 0;
        for (const t of [...previousTrades, trade]) {
          if (t.type === "buy") {
            totalInvested += t.amount;
          } else if (t.type === "sell") {
            totalInvested -= t.amount;
          }
        }
        const totalShares = previousTrades.concat(trade).reduce((sum, t) => {
          return t.type === "buy" ? sum + t.quantity : sum - t.quantity;
        }, 0);
        currentValue = totalShares * marketData2.close;
        const profitLoss = currentValue - totalInvested;
        const profitLossPercentage = totalInvested > 0 ? profitLoss / totalInvested * 100 : 0;
        await storage.updateSimulation(simulation.id, {
          profitLoss,
          profitLossPercentage
        });
        const now = /* @__PURE__ */ new Date();
        const startTime = simulation.startTime;
        let shouldComplete = false;
        switch (simulation.timeperiod) {
          case "6 Hours":
            shouldComplete = now.getTime() - startTime.getTime() >= 6 * 60 * 60 * 1e3;
            break;
          case "12 Hours":
            shouldComplete = now.getTime() - startTime.getTime() >= 12 * 60 * 60 * 1e3;
            break;
          case "24 Hours":
            shouldComplete = now.getTime() - startTime.getTime() >= 24 * 60 * 60 * 1e3;
            break;
          case "3 Days":
            shouldComplete = now.getTime() - startTime.getTime() >= 3 * 24 * 60 * 60 * 1e3;
            break;
          case "1 Week":
            shouldComplete = now.getTime() - startTime.getTime() >= 7 * 24 * 60 * 60 * 1e3;
            break;
          case "2 Weeks":
            shouldComplete = now.getTime() - startTime.getTime() >= 14 * 24 * 60 * 60 * 1e3;
            break;
        }
        if (shouldComplete) {
          await storage.updateSimulation(simulation.id, {
            status: "completed",
            endTime: now
          });
          console.log(`Completed simulation ${simulation.id}`);
        }
      }
    } catch (error) {
      console.error("Error in scheduled trade simulation:", error);
    }
  });
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var vite_config_default = defineConfig({
  server: {
    //hmr: false, // Disable HMR completely
    // Alternatively, configure it properly:
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5e3
    }
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = process.env.PORT || 5e3;
  const host = process.env.HOST || "localhost";
  app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
  });
})();
