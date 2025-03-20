import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketData = pgTable("market_data", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: doublePrecision("price").notNull(),
  change: doublePrecision("change"),
  changePercent: doublePrecision("change_percent"),
  volume: doublePrecision("volume"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(), // "buy" or "sell"
  amount: doublePrecision("amount").notNull(), // in INR
  price: doublePrecision("price").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  profitLoss: doublePrecision("profit_loss"),
  profitLossPercent: doublePrecision("profit_loss_percent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  strategyId: integer("strategy_id"),
  simulationId: integer("simulation_id"),
});

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  strategy: text("strategy").notNull(),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  duration: text("duration").notNull(), // "24h", "48h", "1w", "custom"
  initialBalance: doublePrecision("initial_balance").notNull(),
  finalBalance: doublePrecision("final_balance"),
  profitLoss: doublePrecision("profit_loss"),
  profitLossPercent: doublePrecision("profit_loss_percent"),
  totalTrades: integer("total_trades").default(0).notNull(),
  successfulTrades: integer("successful_trades").default(0),
  successRate: doublePrecision("success_rate"),
  avgProfitPerTrade: doublePrecision("avg_profit_per_trade"),
  status: text("status").notNull().default("running"), // "running", "completed", "cancelled"
});

export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  parameters: text("parameters"), // JSON string of parameters
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
});

export const insertMarketDataSchema = createInsertSchema(marketData).pick({
  symbol: true,
  price: true,
  change: true,
  changePercent: true,
  volume: true,
});

export const insertTradeSchema = createInsertSchema(trades).pick({
  userId: true,
  symbol: true,
  type: true,
  amount: true,
  price: true,
  quantity: true,
  profitLoss: true,
  profitLossPercent: true,
  strategyId: true,
  simulationId: true,
});

export const insertSimulationSchema = createInsertSchema(simulations).pick({
  userId: true,
  symbol: true,
  strategy: true,
  duration: true,
  initialBalance: true,
});

export const insertStrategySchema = createInsertSchema(strategies).pick({
  name: true,
  description: true,
  parameters: true,
});

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type MarketData = typeof marketData.$inferSelect;

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulations.$inferSelect;

export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategies.$inferSelect;

export type LoginData = z.infer<typeof loginSchema>;
