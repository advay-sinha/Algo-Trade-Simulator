import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  email: true,
});

// Market symbols
export const symbols = pgTable("symbols", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().unique(),
  exchange: text("exchange").notNull(),
  type: text("type").notNull(),
  description: text("description"),
});

export const insertSymbolSchema = createInsertSchema(symbols).pick({
  name: true,
  symbol: true,
  exchange: true,
  type: true,
  description: true,
});

// Trading strategies
export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  timeFrame: text("time_frame").notNull(),
  successRate: text("success_rate"),
  bestMarketCondition: text("best_market_condition"),
  riskRating: text("risk_rating").notNull(),
});

export const insertStrategySchema = createInsertSchema(strategies).pick({
  name: true,
  description: true,
  timeFrame: true,
  successRate: true,
  bestMarketCondition: true,
  riskRating: true,
});

// Simulations
export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbolId: integer("symbol_id").notNull(),
  strategyId: integer("strategy_id").notNull(),
  investment: real("investment").notNull(),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  status: text("status").notNull(), // 'active', 'completed', 'cancelled'
  timeperiod: text("timeperiod").notNull(),
  interval: text("interval").notNull(),
  profitLoss: real("profit_loss"),
  profitLossPercentage: real("profit_loss_percentage"),
  settings: jsonb("settings").notNull(),
});

export const insertSimulationSchema = createInsertSchema(simulations).pick({
  userId: true,
  symbolId: true,
  strategyId: true,
  investment: true,
  timeperiod: true,
  interval: true,
  settings: true,
});

// Trades
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  simulationId: integer("simulation_id").notNull(),
  type: text("type").notNull(), // 'buy', 'sell'
  price: real("price").notNull(),
  quantity: real("quantity").notNull(),
  amount: real("amount").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: text("status").notNull(), // 'completed', 'pending', 'cancelled'
});

export const insertTradeSchema = createInsertSchema(trades).pick({
  simulationId: true,
  type: true,
  price: true,
  quantity: true,
  amount: true,
  status: true,
});

// MarketData
export const marketData = pgTable("market_data", {
  id: serial("id").primaryKey(),
  symbolId: integer("symbol_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  source: text("source").notNull(),
});

export const insertMarketDataSchema = createInsertSchema(marketData).pick({
  symbolId: true,
  open: true,
  high: true,
  low: true,
  close: true,
  volume: true,
  source: true,
});

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Symbol = typeof symbols.$inferSelect;
export type InsertSymbol = z.infer<typeof insertSymbolSchema>;

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = z.infer<typeof insertStrategySchema>;

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;