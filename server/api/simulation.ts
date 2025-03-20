import express from "express";
import { SimulationEngine } from "../services/simulation-engine";
import { storage } from "../storage";
import { z } from "zod";
import { YahooFinanceService } from "../services/yahoo-finance";
import { AlphaVantageService } from "../services/alpha-vantage";

const router = express.Router();

// Initialize services
const simulationEngine = new SimulationEngine();
const yahooFinance = new YahooFinanceService();
const alphaVantage = new AlphaVantageService();

// Validation schemas
const simulationConfigSchema = z.object({
  assetType: z.enum(["stocks", "crypto", "forex"]),
  assetName: z.string().min(1),
  timePeriod: z.string().min(1),
  strategy: z.string().min(1),
  tradeAmount: z.number().min(1),
  reinvestProfits: z.boolean(),
});

const strategyParamsSchema = z.object({
  fastPeriod: z.number().min(1),
  slowPeriod: z.number().min(1),
  signalPeriod: z.number().min(1),
  buyThreshold: z.number(),
  sellThreshold: z.number(),
  stopLoss: z.number().min(0),
});

// Get active simulation
router.get("/active", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const activeSimulation = await storage.getActiveSimulation(userId);
    
    if (!activeSimulation) {
      return res.json(null);
    }
    
    // Update simulation with latest market data if it's running
    if (activeSimulation.status === "running") {
      const latestData = await yahooFinance.getAssetDetails(activeSimulation.assetSymbol);
      
      if (latestData) {
        activeSimulation.currentPrice = latestData.price;
        
        // Update progress based on elapsed time vs total duration
        const startDate = new Date(activeSimulation.startedAt);
        const endDate = new Date(activeSimulation.endTime);
        const now = new Date();
        
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsedDuration = now.getTime() - startDate.getTime();
        
        activeSimulation.progress = Math.min(
          Math.floor((elapsedDuration / totalDuration) * 100),
          100
        );
      }
    }
    
    res.json(activeSimulation);
  } catch (error) {
    next(error);
  }
});

// Start a new simulation
router.post("/start", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Check if there's already an active simulation
    const existingSimulation = await storage.getActiveSimulation(userId);
    
    if (existingSimulation) {
      return res.status(409).json({ 
        message: "A simulation is already running. Please stop it before starting a new one." 
      });
    }
    
    // Validate input
    const { config, params } = req.body;
    
    try {
      simulationConfigSchema.parse(config);
      strategyParamsSchema.parse(params);
    } catch (validationError) {
      return res.status(400).json({ 
        message: "Invalid simulation configuration", 
        errors: (validationError as z.ZodError).errors 
      });
    }
    
    // Get asset details for the simulation
    let assetDetails;
    
    if (config.assetType === "stocks") {
      assetDetails = await yahooFinance.getAssetDetails(config.assetName);
    } else if (config.assetType === "crypto") {
      assetDetails = await yahooFinance.getAssetDetails(config.assetName + "-INR");
    } else {
      assetDetails = await alphaVantage.getAssetDetails(config.assetName);
    }
    
    if (!assetDetails) {
      return res.status(404).json({ message: "Asset not found" });
    }
    
    // Calculate simulation duration
    const durationMs = simulationEngine.calculateDuration(config.timePeriod);
    const endTime = new Date(Date.now() + durationMs);
    
    // Create the simulation
    const simulation = await storage.createSimulation(userId, {
      assetName: assetDetails.name,
      assetSymbol: assetDetails.symbol,
      assetType: config.assetType,
      exchange: assetDetails.exchange,
      strategy: config.strategy,
      period: config.timePeriod,
      tradeAmount: config.tradeAmount,
      reinvestProfits: config.reinvestProfits,
      startPrice: assetDetails.price,
      currentPrice: assetDetails.price,
      startingCapital: config.tradeAmount,
      currentValue: config.tradeAmount,
      status: "running",
      progress: 0,
      startedAt: new Date(),
      endTime,
      strategyParams: params
    });
    
    // Start the simulation engine
    simulationEngine.startSimulation(simulation.id, userId, {
      config,
      params,
      assetDetails,
      endTime
    });
    
    res.status(201).json(simulation);
  } catch (error) {
    next(error);
  }
});

// Pause/resume simulation
router.post("/pause", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Get active simulation
    const activeSimulation = await storage.getActiveSimulation(userId);
    
    if (!activeSimulation) {
      return res.status(404).json({ message: "No active simulation found" });
    }
    
    // Toggle status
    const newStatus = activeSimulation.status === "running" ? "paused" : "running";
    
    // Update simulation status
    const updatedSimulation = await storage.updateSimulation(
      activeSimulation.id,
      { status: newStatus }
    );
    
    // Pause/resume in the engine
    if (newStatus === "paused") {
      simulationEngine.pauseSimulation(activeSimulation.id);
    } else {
      simulationEngine.resumeSimulation(activeSimulation.id, userId);
    }
    
    res.json(updatedSimulation);
  } catch (error) {
    next(error);
  }
});

// Stop simulation
router.post("/stop", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Get active simulation
    const activeSimulation = await storage.getActiveSimulation(userId);
    
    if (!activeSimulation) {
      return res.status(404).json({ message: "No active simulation found" });
    }
    
    // Stop the simulation
    simulationEngine.stopSimulation(activeSimulation.id);
    
    // Calculate final performance
    const simulationTrades = await storage.getSimulationTrades(activeSimulation.id);
    const finalPerformance = simulationEngine.calculateFinalPerformance(
      activeSimulation,
      simulationTrades
    );
    
    // Update simulation
    const completedSimulation = await storage.updateSimulation(
      activeSimulation.id, 
      {
        status: "completed",
        endedAt: new Date(),
        finalValue: finalPerformance.finalValue,
        profitLoss: finalPerformance.profitLoss,
        profitLossPercentage: finalPerformance.profitLossPercentage,
        successRate: finalPerformance.successRate,
        totalTrades: finalPerformance.totalTrades
      }
    );
    
    // Save performance report
    await storage.savePerformanceReport(activeSimulation.id, finalPerformance);
    
    res.json(completedSimulation);
  } catch (error) {
    next(error);
  }
});

// Get simulation results
router.get("/results/:id", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const { id } = req.params;
    
    // Get the simulation
    const simulation = await storage.getSimulation(id);
    
    if (!simulation) {
      return res.status(404).json({ message: "Simulation not found" });
    }
    
    // Check if this simulation belongs to the user
    if (simulation.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get trades for this simulation
    const trades = await storage.getSimulationTrades(id);
    
    // Get performance report
    const performanceReport = await storage.getPerformanceReport(id);
    
    res.json({
      simulation,
      trades,
      performanceReport
    });
  } catch (error) {
    next(error);
  }
});

// Get all completed simulations
router.get("/history", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Get completed simulations
    const completedSimulations = await storage.getCompletedSimulations(userId);
    
    res.json(completedSimulations);
  } catch (error) {
    next(error);
  }
});

export default router;
