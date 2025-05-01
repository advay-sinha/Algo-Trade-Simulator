import express from "express";
import { storage } from "../storage";
import { z } from "zod";

const router = express.Router();

// Validation schema for filters
const filtersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  assetType: z.string().optional(),
  tradeType: z.string().optional(),
  search: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
});

// Get recent trades
router.get("/recent", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const recentTrades = await storage.getRecentTrades(userId);
    res.json(recentTrades);
  } catch (error) {
    next(error);
  }
});

// Get trade history with filters and pagination
router.get("/history", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Parse and validate query parameters
    const queryParams = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      assetType: req.query.assetType as string,
      tradeType: req.query.tradeType as string,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    };
    
    try {
      filtersSchema.parse(queryParams);
    } catch (validationError) {
      return res.status(400).json({ 
        message: "Invalid filter parameters", 
        errors: (validationError as z.ZodError).errors 
      });
    }
    
    // Get trade history with filters
    const tradeHistory = await storage.getTradeHistory(userId, queryParams);
    
    res.json({
      trades: tradeHistory.trades,
      totalItems: tradeHistory.totalItems,
      page: queryParams.page,
      totalPages: Math.ceil(tradeHistory.totalItems / queryParams.limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get a specific trade by ID
router.get("/:id", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const tradeId = req.params.id;
    
    const trade = await storage.getTrade(tradeId);
    
    if (!trade) {
      return res.status(404).json({ message: "Trade not found" });
    }
    
    // Ensure this trade belongs to the user
    if (trade.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    res.json(trade);
  } catch (error) {
    next(error);
  }
});

// Get portfolio summary
router.get("/portfolio/summary", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    
    // Get portfolio data
    const portfolio = await storage.getPortfolioSummary(userId);
    
    res.json(portfolio);
  } catch (error) {
    next(error);
  }
});

// Get portfolio performance data
router.get("/portfolio/performance", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const period = req.query.period as string || "1d";
    
    // Get performance data for the specified period
    const performanceData = await storage.getPortfolioPerformance(userId, period);
    
    res.json(performanceData);
  } catch (error) {
    next(error);
  }
});

// Get reports data
router.get("/reports/performance", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const timeRange = req.query.timeRange as string || "1m";
    
    // Get performance reports data
    const performanceData = await storage.getPerformanceReport(userId, timeRange);
    
    res.json(performanceData);
  } catch (error) {
    next(error);
  }
});

router.get("/reports/trades-analysis", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const timeRange = req.query.timeRange as string || "1m";
    
    // Get trades analysis data
    const tradesAnalysis = await storage.getTradesAnalysis(userId, timeRange);
    
    res.json(tradesAnalysis);
  } catch (error) {
    next(error);
  }
});

router.get("/reports/asset-performance", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const timeRange = req.query.timeRange as string || "1m";
    
    // Get asset performance data
    const assetPerformance = await storage.getAssetPerformance(userId, timeRange);
    
    res.json(assetPerformance);
  } catch (error) {
    next(error);
  }
});

export default router;
