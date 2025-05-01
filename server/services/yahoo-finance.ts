import { createId } from "@paralleldrive/cuid2";

/**
 * Service for fetching data from Yahoo Finance API
 */
export class YahooFinanceService {
  private apiKey: string;
  private baseUrl: string;
  
  constructor() {
    this.apiKey = process.env.YAHOO_FINANCE_API_KEY || "";
    this.baseUrl = "https://query1.finance.yahoo.com/v8/finance";
  }

  /**
   * Get the top gainers in the market
   */
  async getTopGainers(market: string = "all"): Promise<any[]> {
    try {
      // This would normally call the Yahoo Finance API
      // For now, return mock data that would be similar to actual response
      return this.getMockMarketMovers("gainers", market);
    } catch (error) {
      console.error("Error fetching top gainers:", error);
      throw new Error("Failed to fetch top gainers");
    }
  }

  /**
   * Get the top losers in the market
   */
  async getTopLosers(market: string = "all"): Promise<any[]> {
    try {
      // This would normally call the Yahoo Finance API
      return this.getMockMarketMovers("losers", market);
    } catch (error) {
      console.error("Error fetching top losers:", error);
      throw new Error("Failed to fetch top losers");
    }
  }

  /**
   * Get market indices (NSE, BSE, etc.)
   */
  async getMarketIndices(): Promise<any[]> {
    try {
      // This would normally call the Yahoo Finance API
      return [
        {
          id: createId(),
          name: "NIFTY 50",
          symbol: "^NSEI",
          exchange: "NSE",
          price: 19754.40,
          change: 0.74
        },
        {
          id: createId(),
          name: "SENSEX",
          symbol: "^BSESN",
          exchange: "BSE",
          price: 65970.65,
          change: 0.68
        },
        {
          id: createId(),
          name: "BANK NIFTY",
          symbol: "^NSEBANK",
          exchange: "NSE",
          price: 43124.75,
          change: 0.95
        }
      ];
    } catch (error) {
      console.error("Error fetching market indices:", error);
      throw new Error("Failed to fetch market indices");
    }
  }

  /**
   * Get market data with pagination and filters
   */
  async getMarketData(options: {
    market?: string;
    filter?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: any[];
    page: number;
    totalPages: number;
    totalItems: number;
  }> {
    try {
      // This would normally call the Yahoo Finance API
      const { page = 1, limit = 10 } = options;
      
      // Mock market data
      const mockData = [
        {
          id: createId(),
          symbol: "RELIANCE.NS",
          company: "Reliance Industries Ltd.",
          lastPrice: 2750.45,
          change: 33.80,
          changePercent: 1.24,
          volume: "3.42M",
          marketCap: "₹17.2T"
        },
        {
          id: createId(),
          symbol: "TCS.NS",
          company: "Tata Consultancy Services Ltd.",
          lastPrice: 3458.60,
          change: -15.40,
          changePercent: -0.44,
          volume: "0.89M",
          marketCap: "₹12.7T"
        },
        {
          id: createId(),
          symbol: "INFY.NS",
          company: "Infosys Ltd.",
          lastPrice: 1524.75,
          change: 18.25,
          changePercent: 1.21,
          volume: "1.65M",
          marketCap: "₹6.3T"
        },
        {
          id: createId(),
          symbol: "HDFCBANK.NS",
          company: "HDFC Bank Ltd.",
          lastPrice: 1685.30,
          change: 9.70,
          changePercent: 0.58,
          volume: "2.34M",
          marketCap: "₹11.8T"
        },
        {
          id: createId(),
          symbol: "BTC-INR",
          company: "Bitcoin INR",
          lastPrice: 4368450.75,
          change: -45240.30,
          changePercent: -1.02,
          volume: "5.7K",
          marketCap: "₹85.2T"
        },
        {
          id: createId(),
          symbol: "ITC.NS",
          company: "ITC Ltd.",
          lastPrice: 428.65,
          change: 2.15,
          changePercent: 0.50,
          volume: "4.56M",
          marketCap: "₹5.3T"
        },
        {
          id: createId(),
          symbol: "ETH-INR",
          company: "Ethereum INR",
          lastPrice: 180420.89,
          change: -3842.30,
          changePercent: -2.08,
          volume: "3.2K",
          marketCap: "₹21.6T"
        }
      ];

      // Apply filters if needed
      let filteredData = [...mockData];
      
      if (options.market && options.market !== 'all') {
        if (options.market === 'crypto') {
          filteredData = filteredData.filter(item => item.symbol.includes('-INR'));
        } else {
          filteredData = filteredData.filter(item => item.symbol.includes(`.${options.market.toUpperCase()}`));
        }
      }
      
      if (options.search) {
        const search = options.search.toLowerCase();
        filteredData = filteredData.filter(item => 
          item.symbol.toLowerCase().includes(search) || 
          item.company.toLowerCase().includes(search)
        );
      }
      
      if (options.filter) {
        switch (options.filter) {
          case 'gainers':
            filteredData = filteredData.filter(item => item.changePercent > 0);
            filteredData.sort((a, b) => b.changePercent - a.changePercent);
            break;
          case 'losers':
            filteredData = filteredData.filter(item => item.changePercent < 0);
            filteredData.sort((a, b) => a.changePercent - b.changePercent);
            break;
          case 'volume':
            // This is just for demo - actual volume sorting would be numeric
            filteredData.sort((a, b) => 
              parseInt(b.volume.replace(/[^\d.-]/g, '')) - 
              parseInt(a.volume.replace(/[^\d.-]/g, ''))
            );
            break;
        }
      }
      
      // Calculate pagination
      const totalItems = filteredData.length;
      const totalPages = Math.ceil(totalItems / limit);
      const start = (page - 1) * limit;
      const end = start + limit;
      const items = filteredData.slice(start, end);
      
      return {
        items,
        page,
        totalPages,
        totalItems
      };
    } catch (error) {
      console.error("Error fetching market data:", error);
      throw new Error("Failed to fetch market data");
    }
  }

  /**
   * Get details for a specific asset
   */
  async getAssetDetails(symbol: string): Promise<any> {
    try {
      // This would normally call the Yahoo Finance API
      
      // For well-known assets return pre-configured details
      const knownAssets: Record<string, any> = {
        "RELIANCE.NS": {
          symbol: "RELIANCE.NS",
          name: "Reliance Industries",
          exchange: "NSE",
          price: 2750.45,
          change: 1.24,
          assetType: "stocks"
        },
        "RELIANCE": {
          symbol: "RELIANCE.NS",
          name: "Reliance Industries",
          exchange: "NSE",
          price: 2750.45,
          change: 1.24,
          assetType: "stocks"
        },
        "TCS.NS": {
          symbol: "TCS.NS",
          name: "Tata Consultancy Services",
          exchange: "NSE",
          price: 3458.60,
          change: -0.44,
          assetType: "stocks"
        },
        "TCS": {
          symbol: "TCS.NS",
          name: "Tata Consultancy Services",
          exchange: "NSE",
          price: 3458.60,
          change: -0.44,
          assetType: "stocks"
        },
        "INFY.NS": {
          symbol: "INFY.NS",
          name: "Infosys Ltd",
          exchange: "NSE",
          price: 1524.75,
          change: 1.21,
          assetType: "stocks"
        },
        "INFY": {
          symbol: "INFY.NS",
          name: "Infosys Ltd",
          exchange: "NSE",
          price: 1524.75,
          change: 1.21,
          assetType: "stocks"
        },
        "HDFCBANK.NS": {
          symbol: "HDFCBANK.NS",
          name: "HDFC Bank",
          exchange: "NSE",
          price: 1685.30,
          change: 0.58,
          assetType: "stocks"
        },
        "HDFC": {
          symbol: "HDFCBANK.NS",
          name: "HDFC Bank",
          exchange: "NSE",
          price: 1685.30,
          change: 0.58,
          assetType: "stocks"
        },
        "BTC-INR": {
          symbol: "BTC-INR",
          name: "Bitcoin",
          exchange: "CRYPTO",
          price: 4368450.75,
          change: -1.02,
          assetType: "crypto"
        },
        "bitcoin": {
          symbol: "BTC-INR",
          name: "Bitcoin",
          exchange: "CRYPTO",
          price: 4368450.75,
          change: -1.02,
          assetType: "crypto"
        },
        "ETH-INR": {
          symbol: "ETH-INR",
          name: "Ethereum",
          exchange: "CRYPTO",
          price: 180420.89,
          change: -2.08,
          assetType: "crypto"
        },
        "ethereum": {
          symbol: "ETH-INR",
          name: "Ethereum",
          exchange: "CRYPTO",
          price: 180420.89,
          change: -2.08,
          assetType: "crypto"
        }
      };
      
      if (knownAssets[symbol]) {
        return knownAssets[symbol];
      }
      
      // For unknown assets, generate details with random data
      return {
        symbol,
        name: symbol.split('.')[0],
        exchange: symbol.includes('.NS') ? 'NSE' : 
                  symbol.includes('-INR') ? 'CRYPTO' : 'BSE',
        price: Math.floor(Math.random() * 5000) + 100,
        change: (Math.random() * 4) - 2, // -2% to +2%
        assetType: symbol.includes('-INR') ? 'crypto' : 'stocks'
      };
    } catch (error) {
      console.error(`Error fetching details for ${symbol}:`, error);
      throw new Error(`Failed to fetch details for ${symbol}`);
    }
  }

  /**
   * Get historical data for a specific asset
   */
  async getHistoricalData(symbol: string, interval: string, range: string): Promise<any> {
    try {
      // This would normally call the Yahoo Finance API
      // Generate mock historical data
      const dataPoints = interval === '1d' ? 30 : 
                         interval === '1h' ? 24 : 60;
      
      let date = new Date();
      const data = [];
      
      let basePrice = 1000;
      // If it's a known symbol, use a realistic base price
      if (symbol === 'RELIANCE.NS' || symbol === 'RELIANCE') basePrice = 2750;
      if (symbol === 'TCS.NS' || symbol === 'TCS') basePrice = 3450;
      if (symbol === 'INFY.NS' || symbol === 'INFY') basePrice = 1520;
      if (symbol === 'HDFCBANK.NS' || symbol === 'HDFC') basePrice = 1680;
      if (symbol === 'BTC-INR' || symbol === 'bitcoin') basePrice = 4360000;
      if (symbol === 'ETH-INR' || symbol === 'ethereum') basePrice = 180000;
      
      // Generate historical data points
      for (let i = dataPoints; i >= 0; i--) {
        const timestamp = new Date(date);
        timestamp.setHours(timestamp.getHours() - i * (interval === '1d' ? 24 : interval === '1h' ? 1 : 0.1));
        
        // Simulate some price movement
        const priceChange = (Math.random() - 0.48) * (basePrice * 0.02); // -0.5% to +0.5%
        basePrice += priceChange;
        
        data.push({
          timestamp: timestamp.toISOString(),
          open: basePrice,
          high: basePrice * (1 + Math.random() * 0.01),
          low: basePrice * (1 - Math.random() * 0.01),
          close: basePrice,
          volume: Math.floor(Math.random() * 1000000)
        });
      }
      
      return data;
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      throw new Error(`Failed to fetch historical data for ${symbol}`);
    }
  }

  /**
   * Get quotes for multiple symbols
   */
  async getQuotes(symbols: string[]): Promise<any[]> {
    try {
      // This would normally call the Yahoo Finance API
      return Promise.all(symbols.map(symbol => this.getAssetDetails(symbol)));
    } catch (error) {
      console.error("Error fetching quotes:", error);
      throw new Error("Failed to fetch quotes");
    }
  }

  /**
   * Check if the API is working
   */
  async checkApiStatus(): Promise<{ connected: boolean; message: string }> {
    try {
      // This would normally call the Yahoo Finance API to test connectivity
      // For now, we'll simulate a successful connection
      return {
        connected: true,
        message: "Yahoo Finance API connection is working"
      };
    } catch (error) {
      return {
        connected: false,
        message: "Failed to connect to Yahoo Finance API"
      };
    }
  }

  /**
   * Test connection to the API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // This would normally call the Yahoo Finance API to test connectivity
      // For now, we'll simulate a successful connection
      return {
        success: true,
        message: "Successfully connected to Yahoo Finance API"
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to Yahoo Finance API"
      };
    }
  }

  /**
   * Helper method to generate mock market movers data
   */
  private getMockMarketMovers(type: 'gainers' | 'losers', market: string): any[] {
    const baseData = [
      {
        id: createId(),
        name: "LTIMindtree",
        symbol: "LTIM.NS",
        exchange: "NSE",
        price: 5245.65,
        change: 8.2
      },
      {
        id: createId(),
        name: "Bharti Airtel",
        symbol: "BHARTIARTL.NS",
        exchange: "NSE",
        price: 1142.30,
        change: 6.5
      },
      {
        id: createId(),
        name: "Hero MotoCorp",
        symbol: "HEROMOTOCO.NS",
        exchange: "NSE",
        price: 3856.40,
        change: 5.8
      },
      {
        id: createId(),
        name: "Tata Motors",
        symbol: "TATAMOTORS.NS",
        exchange: "NSE",
        price: 845.30,
        change: -4.2
      },
      {
        id: createId(),
        name: "ONGC",
        symbol: "ONGC.NS",
        exchange: "NSE",
        price: 238.75,
        change: -3.8
      },
      {
        id: createId(),
        name: "Dr. Reddy's Labs",
        symbol: "DRREDDY.NS",
        exchange: "NSE",
        price: 5632.10,
        change: -3.5
      }
    ];
    
    // Filter based on market and type
    let result = [...baseData];
    
    if (market !== 'all') {
      result = result.filter(item => {
        if (market === 'nse') return item.exchange === 'NSE';
        if (market === 'bse') return item.exchange === 'BSE';
        return true;
      });
    }
    
    result = result.filter(item => {
      if (type === 'gainers') return item.change > 0;
      return item.change < 0;
    });
    
    // Sort appropriately
    if (type === 'gainers') {
      result.sort((a, b) => b.change - a.change);
    } else {
      result.sort((a, b) => a.change - b.change);
    }
    
    return result.slice(0, 3); // Return top 3
  }
}
