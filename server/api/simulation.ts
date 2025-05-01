import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertSimulationSchema, insertTradeSchema } from "@shared/schema";
import { generateTrade } from "../utils/trade";

const router = Router();

// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Get all strategies
router.get("/strategies", async (req, res) => {
  try {
    const strategies = await storage.getStrategies();
    res.json(strategies);
  } catch (error) {
    console.error("Error fetching strategies:", error);
    res.status(500).json({ message: "Failed to fetch strategies" });
  }
});

// Get strategy by ID
router.get("/strategies/:id", async (req, res) => {
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

// Get all simulations for the current user
router.get("/simulations", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulations = await storage.getSimulations(userId);
    
    // Augment simulations with symbol and strategy information
    const augmentedSimulations = await Promise.all(simulations.map(async (sim) => {
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

// Get active simulations for the current user
router.get("/simulations/active", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulations = await storage.getActiveSimulations(userId);
    
    // Augment simulations with symbol and strategy information
    const augmentedSimulations = await Promise.all(simulations.map(async (sim) => {
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

// Get a specific simulation by ID
router.get("/simulations/:id", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }

    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }

    // Check if the simulation belongs to the current user
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get the symbol and strategy information
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

// Create a new simulation
router.post("/simulations", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Add the user ID to the simulation data
    const simulationData = {
      ...req.body,
      userId
    };
    
    // Validate the simulation data
    const result = insertSimulationSchema.safeParse(simulationData);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid simulation data", errors: result.error.format() });
    }
    
    // Check if the symbol exists
    const symbol = await storage.getSymbol(result.data.symbolId);
    if (!symbol) {
      return res.status(404).json({ message: "Symbol not found" });
    }
    
    // Check if the strategy exists
    const strategy = await storage.getStrategy(result.data.strategyId);
    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    
    // Create the simulation
    const simulation = await storage.createSimulation(result.data);
    
    // Create the initial trade (BUY)
    const marketData = await storage.getLatestMarketData(symbol.id);
    if (marketData) {
      const tradeData = {
        simulationId: simulation.id,
        type: 'buy',
        price: marketData.close,
        quantity: parseFloat((result.data.investment / marketData.close).toFixed(2)),
        amount: result.data.investment,
        status: 'completed'
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

// Update a simulation (for completing, cancelling, etc.)
router.patch("/simulations/:id", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }

    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }

    // Check if the simulation belongs to the current user
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Only allow certain fields to be updated
    const updates = {
      status: req.body.status,
      endTime: req.body.status === 'completed' ? new Date() : simulation.endTime,
      profitLoss: req.body.profitLoss,
      profitLossPercentage: req.body.profitLossPercentage
    };

    const updatedSimulation = await storage.updateSimulation(id, updates);
    if (!updatedSimulation) {
      return res.status(500).json({ message: "Failed to update simulation" });
    }

    // Get the symbol and strategy information
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

// Generate a new trade for a simulation
router.post("/simulations/:id/trade", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }

    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }

    // Check if the simulation belongs to the current user and is active
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (simulation.status !== 'active') {
      return res.status(400).json({ message: "Cannot create trade for inactive simulation" });
    }

    // Get the current market data for the symbol
    const marketData = await storage.getLatestMarketData(simulation.symbolId);
    if (!marketData) {
      return res.status(404).json({ message: "No market data available" });
    }

    // Get previous trades for this simulation
    const previousTrades = await storage.getTrades(simulation.id);
    
    // Generate a new trade
    const tradeData = generateTrade(simulation, marketData, previousTrades, req.body.type);
    
    // Validate the trade data
    const result = insertTradeSchema.safeParse(tradeData);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid trade data", errors: result.error.format() });
    }
    
    // Create the trade
    const trade = await storage.createTrade(result.data);
    
    // Calculate profit/loss
    let totalInvested = 0;
    let currentValue = 0;
    
    // Sum up all BUY trades
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
    const profitLossPercentage = (profitLoss / totalInvested) * 100;
    
    // Update simulation with profit/loss
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

// Get trades for a simulation
router.get("/simulations/:id/trades", isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid simulation ID" });
    }

    const simulation = await storage.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }

    // Check if the simulation belongs to the current user
    if (simulation.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const trades = await storage.getTrades(id);
    res.json(trades);
  } catch (error) {
    console.error("Error fetching trades:", error);
    res.status(500).json({ message: "Failed to fetch trades" });
  }
});

// Get recent trades for the current user (across all simulations)
router.get("/trades/recent", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const trades = await storage.getRecentTrades(userId, limit);
    
    // Augment trades with simulation, symbol, and strategy information
    const augmentedTrades = await Promise.all(trades.map(async (trade) => {
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

export default router;
