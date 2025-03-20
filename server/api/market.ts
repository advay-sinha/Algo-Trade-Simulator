import { Router } from "express";
import { storage } from "../storage";
import axios from "axios";
import { z } from "zod";
import { InsertMarketData, InsertSymbol } from "@shared/schema";

const router = Router();

// Schema to validate search parameters
const searchSymbolSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

// Validate and fetch symbol data from Alpha Vantage
async function fetchSymbolData(symbol: string) {
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

// Alternative using Yahoo Finance API in case Alpha Vantage fails
async function fetchSymbolDataYahoo(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    if (data.chart && data.chart.result && data.chart.result.length > 0) {
      const result = data.chart.result[0];
      const quote = result.indicators.quote[0];
      const timestamp = result.timestamp[result.timestamp.length - 1] * 1000;
      
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

// Get available symbols
router.get("/symbols", async (req, res) => {
  try {
    const symbols = await storage.getSymbols();
    res.json(symbols);
  } catch (error) {
    console.error("Error fetching symbols:", error);
    res.status(500).json({ message: "Failed to fetch symbols" });
  }
});

// Search symbols from Alpha Vantage
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
      // Filter for Indian market symbols (BSE or NSE)
      const indianSymbols = data.bestMatches.filter((match: any) => 
        match["4. region"] === "India" && 
        (match["3. type"] === "Equity" || match["3. type"] === "ETF")
      );
      
      res.json(indianSymbols.map((match: any) => ({
        symbol: match["1. symbol"].replace('.BSE', '').replace('.NSE', ''),
        name: match["2. name"],
        type: match["3. type"],
        exchange: match["8. exchange"],
        description: ''
      })));
    } else {
      res.status(404).json({ message: "No symbols found" });
    }
  } catch (error) {
    console.error("Error searching symbols:", error);
    res.status(500).json({ message: "Failed to search symbols" });
  }
});

// Get market data for a symbol
router.get("/data/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // First check if the symbol exists in our database
    let symbolData = await storage.getSymbolByCode(symbol);
    
    // If symbol doesn't exist, create it
    if (!symbolData) {
      try {
        // Try to fetch basic symbol info from Alpha Vantage
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
        const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${apiKey}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (data.bestMatches && data.bestMatches.length > 0) {
          const match = data.bestMatches[0];
          
          const newSymbol: InsertSymbol = {
            name: match["2. name"],
            symbol: symbol,
            exchange: match["8. exchange"],
            type: match["3. type"],
            description: ''
          };
          
          symbolData = await storage.createSymbol(newSymbol);
        } else {
          // If not found in Alpha Vantage, create a basic entry
          const newSymbol: InsertSymbol = {
            name: symbol,
            symbol: symbol,
            exchange: "NSE/BSE",
            type: "Equity",
            description: ''
          };
          
          symbolData = await storage.createSymbol(newSymbol);
        }
      } catch (error) {
        console.error("Error creating symbol:", error);
        return res.status(500).json({ message: "Failed to create symbol" });
      }
    }
    
    // Try to get latest market data from our database
    let marketData = await storage.getLatestMarketData(symbolData.id);
    
    // If no market data or data is older than 15 minutes, fetch fresh data
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    if (!marketData || (marketData.timestamp < fifteenMinutesAgo)) {
      // Fetch new data from Alpha Vantage
      let newMarketData = await fetchSymbolData(symbol);
      
      // If Alpha Vantage fails, try Yahoo Finance
      if (!newMarketData) {
        newMarketData = await fetchSymbolDataYahoo(symbol);
      }
      
      // If we got new market data, save it to our database
      if (newMarketData) {
        const marketDataEntry: InsertMarketData = {
          symbolId: symbolData.id,
          ...newMarketData
        };
        
        marketData = await storage.createMarketData(marketDataEntry);
      }
    }
    
    if (!marketData) {
      return res.status(404).json({ message: "No market data available for this symbol" });
    }
    
    // Return the market data along with the symbol information
    res.json({
      symbol: symbolData,
      data: marketData
    });
  } catch (error) {
    console.error("Error fetching market data:", error);
    res.status(500).json({ message: "Failed to fetch market data" });
  }
});

// Get historical data for a symbol
router.get("/history/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 30;
    
    // Check if the symbol exists
    const symbolData = await storage.getSymbolByCode(symbol);
    
    if (!symbolData) {
      return res.status(404).json({ message: "Symbol not found" });
    }
    
    // Fetch historical data from our database
    const historicalData = await storage.getMarketData(symbolData.id, limit);
    
    // If we don't have enough historical data, fetch more from API
    if (historicalData.length < limit) {
      try {
        // Try to fetch historical data from Alpha Vantage
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}.BSE&apikey=${apiKey}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (data["Time Series (Daily)"]) {
          const timeSeriesData = data["Time Series (Daily)"];
          const dates = Object.keys(timeSeriesData).sort().reverse();
          
          // Process and save only the data we don't already have
          for (const date of dates.slice(0, limit)) {
            const entry = timeSeriesData[date];
            
            const newMarketData: InsertMarketData = {
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
          
          // Fetch the updated historical data
          const updatedHistoricalData = await storage.getMarketData(symbolData.id, limit);
          return res.json(updatedHistoricalData);
        }
      } catch (error) {
        console.error("Error fetching historical data from Alpha Vantage:", error);
        // Continue with whatever data we have
      }
    }
    
    res.json(historicalData);
  } catch (error) {
    console.error("Error fetching historical data:", error);
    res.status(500).json({ message: "Failed to fetch historical data" });
  }
});

export default router;
