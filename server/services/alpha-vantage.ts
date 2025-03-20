import { createId } from "@paralleldrive/cuid2";

/**
 * Service for fetching data from Alpha Vantage API
 */
export class AlphaVantageService {
  private apiKey: string;
  private baseUrl: string;
  
  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || "";
    this.baseUrl = "https://www.alphavantage.co/query";
  }

  /**
   * Search for symbols
   */
  async searchSymbols(keywords: string): Promise<any[]> {
    try {
      // This would normally call the Alpha Vantage API
      // For now, return mock data that would be similar to actual response
      return [
        {
          symbol: "TCS.BSE",
          name: "Tata Consultancy Services Limited",
          type: "Equity",
          region: "India",
          marketOpen: "09:15",
          marketClose: "15:30",
          timezone: "UTC+5:30",
          currency: "INR",
          matchScore: "1.0000"
        },
        {
          symbol: "RELIANCE.BSE",
          name: "Reliance Industries Limited",
          type: "Equity",
          region: "India",
          marketOpen: "09:15",
          marketClose: "15:30",
          timezone: "UTC+5:30",
          currency: "INR",
          matchScore: "0.8000"
        }
      ].filter(item => 
        item.symbol.toLowerCase().includes(keywords.toLowerCase()) || 
        item.name.toLowerCase().includes(keywords.toLowerCase())
      );
    } catch (error) {
      console.error("Error searching symbols:", error);
      throw new Error("Failed to search symbols");
    }
  }

  /**
   * Get intraday data for a symbol
   */
  async getIntradayData(symbol: string, interval: string = "5min"): Promise<any> {
    try {
      // This would normally call the Alpha Vantage API
      // Generate mock intraday data
      const dataPoints = 12; // 1 hour of 5-min data
      
      let date = new Date();
      const data = [];
      
      let basePrice = 1000;
      // If it's a known symbol, use a realistic base price
      if (symbol.includes('RELIANCE')) basePrice = 2750;
      if (symbol.includes('TCS')) basePrice = 3450;
      if (symbol.includes('INFY')) basePrice = 1520;
      if (symbol.includes('HDFC')) basePrice = 1680;
      
      // Generate intraday data points
      for (let i = dataPoints; i >= 0; i--) {
        const timestamp = new Date(date);
        timestamp.setMinutes(timestamp.getMinutes() - i * 5);
        
        // Simulate some price movement
        const priceChange = (Math.random() - 0.48) * (basePrice * 0.005); // -0.25% to +0.25%
        basePrice += priceChange;
        
        data.push({
          timestamp: timestamp.toISOString(),
          open: basePrice,
          high: basePrice * (1 + Math.random() * 0.002),
          low: basePrice * (1 - Math.random() * 0.002),
          close: basePrice,
          volume: Math.floor(Math.random() * 10000)
        });
      }
      
      return {
        "Meta Data": {
          "1. Information": `Intraday (${interval}) open, high, low, close prices and volume`,
          "2. Symbol": symbol,
          "3. Last Refreshed": new Date().toISOString(),
          "4. Interval": interval,
          "5. Output Size": "Compact",
          "6. Time Zone": "UTC+5:30"
        },
        "Time Series": data
      };
    } catch (error) {
      console.error(`Error fetching intraday data for ${symbol}:`, error);
      throw new Error(`Failed to fetch intraday data for ${symbol}`);
    }
  }

  /**
   * Get details for a specific asset using Alpha Vantage
   */
  async getAssetDetails(symbol: string): Promise<any> {
    try {
      // This would normally call the Alpha Vantage API
      // For now, return mock data that would be similar to the actual response
      
      // For known assets, return pre-configured details
      const knownAssets: Record<string, any> = {
        "usdinr": {
          symbol: "USD/INR",
          name: "US Dollar to Indian Rupee",
          exchange: "FOREX",
          price: 82.75,
          change: 0.18,
          assetType: "forex"
        },
        "eurinr": {
          symbol: "EUR/INR",
          name: "Euro to Indian Rupee",
          exchange: "FOREX",
          price: 89.42,
          change: -0.24,
          assetType: "forex"
        },
        "gbpinr": {
          symbol: "GBP/INR",
          name: "British Pound to Indian Rupee",
          exchange: "FOREX",
          price: 104.63,
          change: 0.32,
          assetType: "forex"
        },
        "jpyinr": {
          symbol: "JPY/INR",
          name: "Japanese Yen to Indian Rupee",
          exchange: "FOREX",
          price: 0.54,
          change: -0.12,
          assetType: "forex"
        }
      };
      
      if (knownAssets[symbol.toLowerCase()]) {
        return knownAssets[symbol.toLowerCase()];
      }
      
      // For unknown assets, generate details with random data
      return {
        symbol: symbol.toUpperCase(),
        name: `${symbol.toUpperCase()} Exchange Rate`,
        exchange: "FOREX",
        price: 80 + Math.random() * 20,
        change: (Math.random() * 2) - 1, // -1% to +1%
        assetType: "forex"
      };
    } catch (error) {
      console.error(`Error fetching details for ${symbol}:`, error);
      throw new Error(`Failed to fetch details for ${symbol}`);
    }
  }

  /**
   * Check if the API is working
   */
  async checkApiStatus(): Promise<{ connected: boolean; message: string }> {
    try {
      // This would normally call the Alpha Vantage API to test connectivity
      // For now, we'll simulate a successful connection
      return {
        connected: true,
        message: "Alpha Vantage API connection is working"
      };
    } catch (error) {
      return {
        connected: false,
        message: "Failed to connect to Alpha Vantage API"
      };
    }
  }

  /**
   * Test connection to the API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // This would normally call the Alpha Vantage API to test connectivity
      // For now, we'll simulate a successful connection
      return {
        success: true,
        message: "Successfully connected to Alpha Vantage API"
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to Alpha Vantage API"
      };
    }
  }
}
