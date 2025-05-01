import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import marketRoutes from "./api/market";
import simulationRoutes from "./api/simulation";
import cron from "node-cron";
import { generateTrade } from "./utils/trade";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Register API routes
  app.use("/api/market", marketRoutes);
  app.use("/api/simulation", simulationRoutes);
  
  // Simple health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  
  const httpServer = createServer(app);
  
  // Set up cron job to simulate trades every 2 hours
  cron.schedule("0 */2 * * *", async () => {
    try {
      console.log("Running scheduled trade simulation...");
      
      // Get all active simulations
      const activeSimulations = [];
      for (const sim of storage._simulations.values()) {
        if (sim.status === "active") {
          activeSimulations.push(sim);
        }
      }
      
      console.log(`Found ${activeSimulations.length} active simulations`);
      
      // Process each simulation
      for (const simulation of activeSimulations) {
        // Get market data for the symbol
        const marketData = await storage.getLatestMarketData(simulation.symbolId);
        if (!marketData) continue;
        
        // Get previous trades
        const previousTrades = await storage.getTrades(simulation.id);
        
        // Generate a new trade
        const tradeData = generateTrade(simulation, marketData, previousTrades);
        
        // Create the trade
        const trade = await storage.createTrade(tradeData);
        
        // Calculate profit/loss
        let totalInvested = 0;
        let currentValue = 0;
        
        // Sum up all trades
        for (const t of [...previousTrades, trade]) {
          if (t.type === 'buy') {
            totalInvested += t.amount;
          } else if (t.type === 'sell') {
            totalInvested -= t.amount;
          }
        }
        
        // Calculate current value based on latest price
        const totalShares = previousTrades.concat(trade).reduce((sum, t) => {
          return t.type === 'buy' ? sum + t.quantity : sum - t.quantity;
        }, 0);
        
        currentValue = totalShares * marketData.close;
        
        // Calculate profit/loss
        const profitLoss = currentValue - totalInvested;
        const profitLossPercentage = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;
        
        // Update simulation with profit/loss
        await storage.updateSimulation(simulation.id, {
          profitLoss,
          profitLossPercentage
        });
        
        // Check if the simulation should be completed based on timeperiod
        const now = new Date();
        const startTime = simulation.startTime;
        let shouldComplete = false;
        
        switch (simulation.timeperiod) {
          case '6 Hours':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 6 * 60 * 60 * 1000;
            break;
          case '12 Hours':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 12 * 60 * 60 * 1000;
            break;
          case '24 Hours':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 24 * 60 * 60 * 1000;
            break;
          case '3 Days':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 3 * 24 * 60 * 60 * 1000;
            break;
          case '1 Week':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 7 * 24 * 60 * 60 * 1000;
            break;
          case '2 Weeks':
            shouldComplete = (now.getTime() - startTime.getTime()) >= 14 * 24 * 60 * 60 * 1000;
            break;
        }
        
        if (shouldComplete) {
          await storage.updateSimulation(simulation.id, {
            status: 'completed',
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
