import express from "express";
import { YahooFinanceService } from "../services/yahoo-finance";
import { AlphaVantageService } from "../services/alpha-vantage";
import { storage } from "../storage";

const router = express.Router();

// Initialize market data services
const yahooFinance = new YahooFinanceService();
const alphaVantage = new AlphaVantageService();

// Get market indices (NSE, BSE, etc.)
router.get("/indices", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const indices = await yahooFinance.getMarketIndices();
    res.json(indices);
  } catch (error) {
    next(error);
  }
});

// Get top gainers
router.get("/movers/gainers", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const market = req.query.market as string || "all";
    const topGainers = await yahooFinance.getTopGainers(market);
    res.json(topGainers);
  } catch (error) {
    next(error);
  }
});

// Get top losers
router.get("/movers/losers", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const market = req.query.market as string || "all";
    const topLosers = await yahooFinance.getTopLosers(market);
    res.json(topLosers);
  } catch (error) {
    next(error);
  }
});

// Get market data with pagination and filters
router.get("/data", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { market, filter, search, page = "1", limit = "10" } = req.query as Record<string, string>;
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    
    const marketData = await yahooFinance.getMarketData({
      market,
      filter,
      search,
      page: pageNum,
      limit: limitNum
    });
    
    res.json(marketData);
  } catch (error) {
    next(error);
  }
});

// Get details for a specific asset
router.get("/asset/:symbol", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { symbol } = req.params;
    const assetDetails = await yahooFinance.getAssetDetails(symbol);
    res.json(assetDetails);
  } catch (error) {
    next(error);
  }
});

// Get historical data for a specific asset
router.get("/asset/:symbol/history", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { symbol } = req.params;
    const { interval = "1d", range = "1mo" } = req.query as Record<string, string>;
    
    const historicalData = await yahooFinance.getHistoricalData(symbol, interval, range);
    res.json(historicalData);
  } catch (error) {
    next(error);
  }
});

// Get quotes for multiple symbols
router.post("/quotes", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { symbols } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ message: "Invalid symbols array" });
    }
    
    const quotes = await yahooFinance.getQuotes(symbols);
    res.json(quotes);
  } catch (error) {
    next(error);
  }
});

// Alternative API endpoint using Alpha Vantage
router.get("/alpha/search", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { keywords } = req.query as Record<string, string>;
    
    if (!keywords) {
      return res.status(400).json({ message: "Keywords parameter is required" });
    }
    
    const searchResults = await alphaVantage.searchSymbols(keywords);
    res.json(searchResults);
  } catch (error) {
    next(error);
  }
});

// Get intraday data from Alpha Vantage
router.get("/alpha/intraday/:symbol", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { symbol } = req.params;
    const { interval = "5min" } = req.query as Record<string, string>;
    
    const intradayData = await alphaVantage.getIntradayData(symbol, interval);
    res.json(intradayData);
  } catch (error) {
    next(error);
  }
});

// API Status endpoint
router.get("/api-status", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const yahooStatus = await yahooFinance.checkApiStatus();
    const alphaVantageStatus = await alphaVantage.checkApiStatus();
    
    res.json({
      "yahoo-finance": yahooStatus,
      "alpha-vantage": alphaVantageStatus
    });
  } catch (error) {
    next(error);
  }
});

// Test API connection
router.post("/test-api-connection", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { service } = req.body;
    
    if (!service) {
      return res.status(400).json({ message: "Service parameter is required" });
    }
    
    let result;
    
    switch (service) {
      case "yahoo-finance":
        result = await yahooFinance.testConnection();
        break;
      case "alpha-vantage":
        result = await alphaVantage.testConnection();
        break;
      default:
        return res.status(400).json({ message: "Unsupported service" });
    }
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Watchlist endpoints
router.get("/watchlist", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const watchlist = await storage.getWatchlist(userId);
    
    // Fetch latest quotes for watchlist items
    if (watchlist.length > 0) {
      const symbols = watchlist.map(item => item.symbol);
      const quotes = await yahooFinance.getQuotes(symbols);
      
      // Merge quotes with watchlist items
      const updatedWatchlist = watchlist.map(item => {
        const quote = quotes.find(q => q.symbol === item.symbol);
        return {
          ...item,
          price: quote?.price || item.price,
          change: quote?.change || item.change
        };
      });
      
      res.json(updatedWatchlist);
    } else {
      res.json(watchlist);
    }
  } catch (error) {
    next(error);
  }
});

router.post("/watchlist", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required" });
    }
    
    // Check if the asset exists
    const assetDetails = await yahooFinance.getAssetDetails(symbol);
    
    if (!assetDetails) {
      return res.status(404).json({ message: "Asset not found" });
    }
    
    // Add to watchlist
    const watchlistItem = await storage.addToWatchlist(userId, {
      symbol,
      name: assetDetails.name,
      marketType: assetDetails.exchange,
      price: assetDetails.price,
      change: assetDetails.change,
      assetType: assetDetails.assetType
    });
    
    res.status(201).json(watchlistItem);
  } catch (error) {
    next(error);
  }
});

router.delete("/watchlist/:id", async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user!.id;
    const { id } = req.params;
    
    await storage.removeFromWatchlist(userId, id);
    res.status(200).json({ message: "Item removed from watchlist" });
  } catch (error) {
    next(error);
  }
});

export default router;
