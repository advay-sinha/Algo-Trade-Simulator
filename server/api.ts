import axios from 'axios';
import { InsertMarketData } from '@shared/schema';
import { storage } from './storage';

// API Keys from environment variables
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const YAHOO_FINANCE_API_KEY = process.env.YAHOO_FINANCE_API_KEY || 'demo';

// Indian market symbols
const INDIAN_MARKET_SYMBOLS = [
  'NIFTY50.NS', 'SENSEX.BO', 'HDFCBANK.NS', 'RELIANCE.NS', 'TCS.NS', 
  'INFY.NS', 'BTCINR=X', 'ETHINR=X'
];

// Convert Alpha Vantage response to our format
const transformAlphaVantageData = (symbol: string, data: any): InsertMarketData | null => {
  try {
    if (!data || !data['Global Quote']) return null;
    
    const quote = data['Global Quote'];
    return {
      symbol,
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      volume: parseFloat(quote['06. volume']),
    };
  } catch (error) {
    console.error(`Error transforming Alpha Vantage data for ${symbol}:`, error);
    return null;
  }
};

// Convert Yahoo Finance response to our format
const transformYahooFinanceData = (symbol: string, data: any): InsertMarketData | null => {
  try {
    if (!data || !data.quoteResponse || !data.quoteResponse.result || !data.quoteResponse.result[0]) return null;
    
    const quote = data.quoteResponse.result[0];
    return {
      symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      volume: quote.regularMarketVolume,
    };
  } catch (error) {
    console.error(`Error transforming Yahoo Finance data for ${symbol}:`, error);
    return null;
  }
};

export async function fetchMarketData(symbol: string): Promise<InsertMarketData | null> {
  try {
    // Try Alpha Vantage first
    try {
      const alphaVantageUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const alphaVantageResponse = await axios.get(alphaVantageUrl);
      
      if (alphaVantageResponse.data && alphaVantageResponse.data['Global Quote'] && 
          Object.keys(alphaVantageResponse.data['Global Quote']).length > 0) {
        const marketData = transformAlphaVantageData(symbol, alphaVantageResponse.data);
        if (marketData) return marketData;
      }
    } catch (error) {
      console.error(`Alpha Vantage API error for ${symbol}:`, error);
    }
    
    // Fallback to Yahoo Finance
    try {
      const yahooUrl = `https://yfapi.net/v6/finance/quote?region=IN&lang=en&symbols=${symbol}`;
      const yahooResponse = await axios.get(yahooUrl, {
        headers: {
          'x-api-key': YAHOO_FINANCE_API_KEY
        }
      });
      
      const marketData = transformYahooFinanceData(symbol, yahooResponse.data);
      if (marketData) return marketData;
    } catch (error) {
      console.error(`Yahoo Finance API error for ${symbol}:`, error);
    }
    
    // Return mock data only if both APIs fail (for testing purposes)
    console.warn(`Could not fetch real data for ${symbol}, using fallback mock data`);
    return getFallbackData(symbol);
    
  } catch (error) {
    console.error(`Error fetching market data for ${symbol}:`, error);
    return null;
  }
}

// Fallback mock data for testing when APIs are unavailable
function getFallbackData(symbol: string): InsertMarketData {
  // These are only used when real APIs fail to respond
  const mockData: Record<string, InsertMarketData> = {
    'NIFTY50.NS': { symbol, price: 22475.85, change: 315.15, changePercent: 1.42, volume: 145200000 },
    'SENSEX.BO': { symbol, price: 74145.12, change: 905.32, changePercent: 1.24, volume: 98700000 },
    'HDFCBANK.NS': { symbol, price: 1657.85, change: 23.50, changePercent: 1.42, volume: 22800000 },
    'RELIANCE.NS': { symbol, price: 2912.55, change: -26.12, changePercent: -0.89, volume: 15600000 },
    'TCS.NS': { symbol, price: 3780.40, change: 42.75, changePercent: 1.14, volume: 5200000 },
    'INFY.NS': { symbol, price: 1420.25, change: 15.40, changePercent: 1.09, volume: 8400000 },
    'BTCINR=X': { symbol, price: 5784250, change: 134000, changePercent: 2.37, volume: 3200000000 },
    'ETHINR=X': { symbol, price: 301500, change: 7200, changePercent: 2.45, volume: 1800000000 }
  };
  
  return mockData[symbol] || { 
    symbol, 
    price: 1000, 
    change: 10, 
    changePercent: 1, 
    volume: 1000000 
  };
}

// Fetch market data for all symbols
export async function fetchAllMarketData(): Promise<void> {
  for (const symbol of INDIAN_MARKET_SYMBOLS) {
    try {
      const marketData = await fetchMarketData(symbol);
      if (marketData) {
        await storage.addMarketData(marketData);
        console.log(`Updated market data for ${symbol}`);
      }
    } catch (error) {
      console.error(`Error updating market data for ${symbol}:`, error);
    }
  }
}

// Run a trading simulation
export async function runTradingSimulation(simulationId: number): Promise<void> {
  try {
    // Get the simulation
    const simulation = await storage.getSimulation(simulationId);
    if (!simulation || simulation.status !== "running") return;

    // Get the latest market data for the symbol
    const marketData = await storage.getMarketData(simulation.symbol);
    if (!marketData) return;

    // Get the strategy
    const strategy = await storage.getStrategyByName(simulation.strategy);
    if (!strategy) return;

    // Simulate a trade
    // For now, always buy with ₹7,500 (roughly $100)
    const tradeAmount = 7500;
    const price = marketData.price;
    const quantity = tradeAmount / price;
    
    // Simple strategy implementation
    // In reality, you would have more complex logic based on the strategy parameters
    const tradeType = Math.random() > 0.3 ? "buy" : "sell"; // 70% buy, 30% sell for simulation
    
    // Calculate profit/loss (simplified)
    // In a real implementation, this would compare to previous trades
    const profitLossPercent = tradeType === "buy" ? 
      (Math.random() * 8) - 2 : // -2% to +6% for buys
      (Math.random() * 8) - 6;  // -6% to +2% for sells
    
    const profitLoss = tradeAmount * (profitLossPercent / 100);
    
    // Create the trade
    const trade = await storage.addTrade({
      userId: simulation.userId,
      symbol: simulation.symbol,
      type: tradeType,
      amount: tradeAmount,
      price,
      quantity,
      profitLoss,
      profitLossPercent,
      strategyId: strategy.id,
      simulationId: simulation.id
    });

    // Update simulation stats
    const allTrades = await storage.getSimulationTrades(simulationId);
    const totalTrades = allTrades.length;
    const successfulTrades = allTrades.filter(t => (t.profitLoss || 0) > 0).length;
    const successRate = (successfulTrades / totalTrades) * 100;
    const totalProfitLoss = allTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const avgProfitPerTrade = totalProfitLoss / totalTrades;
    
    // Check if simulation should end
    const now = new Date();
    const startTime = new Date(simulation.startTime);
    let shouldEnd = false;
    let endTime = null;
    
    // Calculate end time based on duration
    switch (simulation.duration) {
      case "24h":
        endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
        shouldEnd = now >= endTime;
        break;
      case "48h":
        endTime = new Date(startTime.getTime() + 48 * 60 * 60 * 1000);
        shouldEnd = now >= endTime;
        break;
      case "1w":
        endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);
        shouldEnd = now >= endTime;
        break;
      default:
        // Custom duration - not handled in this example
        break;
    }
    
    // Update simulation
    const finalBalance = simulation.initialBalance + totalProfitLoss;
    const profitLossPercent = (totalProfitLoss / simulation.initialBalance) * 100;
    
    await storage.updateSimulation(simulationId, {
      totalTrades,
      successfulTrades,
      successRate,
      avgProfitPerTrade,
      profitLoss: totalProfitLoss,
      profitLossPercent,
      finalBalance,
      ...(shouldEnd ? { 
        status: "completed", 
        endTime: now 
      } : {})
    });
    
  } catch (error) {
    console.error(`Error running trading simulation ${simulationId}:`, error);
  }
}

// Check and run all active simulations
export async function checkAndRunSimulations(): Promise<void> {
  try {
    const activeSimulations = await storage.getActiveSimulations();
    console.log(`Found ${activeSimulations.length} active simulations`);
    
    for (const simulation of activeSimulations) {
      // Run simulation
      await runTradingSimulation(simulation.id);
    }
  } catch (error) {
    console.error("Error checking and running simulations:", error);
  }
}
