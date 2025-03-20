import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import marketRouter from "./api/market";
import simulationRouter from "./api/simulation";
import tradesRouter from "./api/trades";

export async function registerRoutes(app: Express): Promise<Server> {
  // sets up /api/register, /api/login, /api/logout, /api/user
  setupAuth(app);

  // API routes
  app.use("/api/market", marketRouter);
  app.use("/api/simulation", simulationRouter);
  app.use("/api/trades", tradesRouter);

  // API user endpoints
  app.get("/api/portfolio/summary", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const summary = await storage.getPortfolioSummary(userId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/watchlist", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const watchlist = await storage.getWatchlist(userId);
      res.json(watchlist);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/performance", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const timeRange = req.query.timeRange as string || "1m";
      
      const performanceData = await storage.getPerformanceReportData(userId, timeRange);
      res.json(performanceData);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/trades-analysis", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const timeRange = req.query.timeRange as string || "1m";
      
      const tradesAnalysis = await storage.getTradesAnalysisData(userId, timeRange);
      res.json(tradesAnalysis);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/asset-performance", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const timeRange = req.query.timeRange as string || "1m";
      
      const assetPerformance = await storage.getAssetPerformanceData(userId, timeRange);
      res.json(assetPerformance);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/api-status", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const apiStatus = await storage.getApiStatus(req.user!.id);
      res.json(apiStatus);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/test-api-connection", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { service } = req.body;
      
      if (!service) {
        return res.status(400).json({ message: "Service parameter is required" });
      }
      
      const result = await storage.testApiConnection(service);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  
  app.get("/api/user/api-keys", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const apiKeys = await storage.getUserApiKeys(userId);
      res.json(apiKeys);
    } catch (error) {
      next(error);
    }
  });
  
  app.post("/api/user/api-keys", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const { name, service, apiKey } = req.body;
      
      if (!name || !service || !apiKey) {
        return res.status(400).json({ message: "Name, service, and apiKey are required" });
      }
      
      const newKey = await storage.addApiKey(userId, {
        name,
        service,
        apiKey
      });
      
      res.status(201).json(newKey);
    } catch (error) {
      next(error);
    }
  });
  
  app.delete("/api/user/api-keys/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const keyId = req.params.id;
      
      await storage.deleteApiKey(userId, keyId);
      res.status(200).json({ message: "API key deleted successfully" });
    } catch (error) {
      next(error);
    }
  });
  
  app.patch("/api/user/api-keys/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const keyId = req.params.id;
      const { active } = req.body;
      
      const updatedKey = await storage.updateApiKey(userId, keyId, { active });
      res.json(updatedKey);
    } catch (error) {
      next(error);
    }
  });
  
  // Get user notifications
  app.get("/api/user/notifications", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      next(error);
    }
  });
  
  // Update user notifications
  app.patch("/api/user/notifications", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user!.id;
      const updatedNotifications = await storage.updateUserNotifications(userId, req.body);
      res.json(updatedNotifications);
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
