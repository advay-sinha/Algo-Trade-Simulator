import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { fetchAllMarketData, fetchMarketData, checkAndRunSimulations } from "./api";
import { InsertSimulationSchema, insertSimulationSchema } from "@shared/schema";
import { z } from "zod";
import cron from "node-cron";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);
  
  // Setup cron jobs for market data fetching and simulation runs
  setupCronJobs();
  
  // Market data endpoints
  app.get("/api/market-data", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      if (!symbol) {
        return res.status(400).json({ message: "Symbol is required" });
      }
      
      // Get market data from storage
      let marketData = await storage.getMarketData(symbol);
      
      // If no data exists or data is older than 5 minutes, fetch fresh data
      const now = new Date();
      if (!marketData || (now.getTime() - new Date(marketData.timestamp).getTime() > 5 * 60 * 1000)) {
        const freshData = await fetchMarketData(symbol);
        if (freshData) {
          marketData = await storage.addMarketData(freshData);
        }
      }
      
      if (!marketData) {
        return res.status(404).json({ message: "Market data not found" });
      }
      
      res.json(marketData);
    } catch (error) {
      console.error("Error fetching market data:", error);
      res.status(500).json({ message: "Failed to fetch market data" });
    }
  });
  
  app.get("/api/market-data/history", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const limitStr = req.query.limit as string;
      
      if (!symbol) {
        return res.status(400).json({ message: "Symbol is required" });
      }
      
      const limit = limitStr ? parseInt(limitStr, 10) : 100;
      const history = await storage.getMarketDataHistory(symbol, limit);
      res.json(history);
    } catch (error) {
      console.error("Error fetching market data history:", error);
      res.status(500).json({ message: "Failed to fetch market data history" });
    }
  });
  
  // Simulation endpoints
  app.post("/api/simulations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Validate request body
      const validationResult = insertSimulationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid simulation data", errors: validationResult.error.errors });
      }
      
      const simulationData = {
        ...validationResult.data,
        userId: req.user!.id
      };
      
      // Create simulation
      const simulation = await storage.addSimulation(simulationData);
      res.status(201).json(simulation);
    } catch (error) {
      console.error("Error creating simulation:", error);
      res.status(500).json({ message: "Failed to create simulation" });
    }
  });
  
  app.get("/api/simulations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const simulations = await storage.getUserSimulations(req.user!.id);
      res.json(simulations);
    } catch (error) {
      console.error("Error fetching simulations:", error);
      res.status(500).json({ message: "Failed to fetch simulations" });
    }
  });
  
  app.get("/api/simulations/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const simulationId = parseInt(req.params.id, 10);
      const simulation = await storage.getSimulation(simulationId);
      
      if (!simulation) {
        return res.status(404).json({ message: "Simulation not found" });
      }
      
      // Ensure user can only access their own simulations
      if (simulation.userId !== req.user!.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(simulation);
    } catch (error) {
      console.error("Error fetching simulation:", error);
      res.status(500).json({ message: "Failed to fetch simulation" });
    }
  });
  
  // Trades endpoints
  app.get("/api/trades", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const simulationId = req.query.simulationId ? parseInt(req.query.simulationId as string, 10) : undefined;
      
      let trades;
      if (simulationId) {
        // Get trades for a specific simulation
        const simulation = await storage.getSimulation(simulationId);
        
        // Ensure user can only access their own simulations' trades
        if (!simulation || simulation.userId !== req.user!.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        trades = await storage.getSimulationTrades(simulationId);
      } else {
        // Get user's trades
        trades = await storage.getUserTrades(req.user!.id);
      }
      
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });
  
  // Strategies endpoints
  app.get("/api/strategies", async (req, res) => {
    try {
      const strategies = await storage.getAllStrategies();
      res.json(strategies);
    } catch (error) {
      console.error("Error fetching strategies:", error);
      res.status(500).json({ message: "Failed to fetch strategies" });
    }
  });
  
  const httpServer = createServer(app);
  return httpServer;
}

function setupCronJobs() {
  // Fetch market data every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log("Running scheduled market data update");
    await fetchAllMarketData();
  });
  
  // Run simulations every 2 hours
  cron.schedule("0 */2 * * *", async () => {
    console.log("Running scheduled simulations");
    await checkAndRunSimulations();
  });
  
  // Initial data fetch on startup
  setTimeout(async () => {
    console.log("Performing initial market data fetch");
    await fetchAllMarketData();
  }, 5000);
}
