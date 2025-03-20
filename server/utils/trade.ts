import { Simulation, Trade, MarketData, InsertTrade } from "@shared/schema";

/**
 * Generates a new trade based on simulation settings, current market data, and previous trades
 */
export function generateTrade(
  simulation: Simulation,
  marketData: MarketData,
  previousTrades: Trade[],
  forcedType?: 'buy' | 'sell'
): InsertTrade {
  // Default settings
  const riskLevel = (simulation.settings.riskLevel || 'Medium').toLowerCase();
  const stopLoss = simulation.settings.stopLoss || 3; // percentage
  const takeProfit = simulation.settings.takeProfit || 5; // percentage
  
  // Get the last trade price if any
  let lastTradePrice = 0;
  let lastTradeType = '';
  
  if (previousTrades.length > 0) {
    const lastTrade = previousTrades[0]; // Assuming trades are sorted by timestamp desc
    lastTradePrice = lastTrade.price;
    lastTradeType = lastTrade.type;
  }
  
  // Current price
  const currentPrice = marketData.close;
  
  // Calculate price change percentage
  const priceChangePercent = lastTradePrice ? ((currentPrice - lastTradePrice) / lastTradePrice) * 100 : 0;
  
  // Determine trade type based on strategy, current price, and previous trades
  let tradeType = forcedType || 'buy';
  
  if (!forcedType) {
    // If this is not the first trade, apply strategy logic
    if (previousTrades.length > 0) {
      // Strategy-based decision making
      switch (simulation.strategyId) {
        case 1: // Mean Reversion
          // If price dropped significantly, buy, else sell
          tradeType = priceChangePercent < -2 ? 'buy' : 'sell';
          break;
          
        case 2: // Momentum Trading
          // If price is moving in the same direction, continue the trend
          tradeType = priceChangePercent > 0 ? 'buy' : 'sell';
          break;
          
        case 3: // RSI Strategy
          // Simplified RSI logic (in a real app, we'd calculate actual RSI)
          // Here we'll just alternate buy/sell or use take-profit/stop-loss
          if (priceChangePercent <= -stopLoss) {
            tradeType = 'sell'; // Stop loss
          } else if (priceChangePercent >= takeProfit) {
            tradeType = 'sell'; // Take profit
          } else {
            tradeType = lastTradeType === 'buy' ? 'sell' : 'buy';
          }
          break;
          
        case 4: // Moving Average Crossover
          // Simplified moving average logic 
          // Alternating buy/sell with bias toward trend
          tradeType = priceChangePercent > 1 ? 'buy' : 'sell';
          break;
          
        default:
          // Default: alternate buy/sell
          tradeType = lastTradeType === 'buy' ? 'sell' : 'buy';
      }
    }
  }
  
  // Determine the trade amount
  // For buy: fixed amount of ₹7500 (~$100)
  // For sell: use a portion of available shares
  const tradeAmount = tradeType === 'buy' ? 7500 : 7500; // ₹7500 for both for simplicity
  
  // Calculate quantity based on current price
  let quantity = parseFloat((tradeAmount / currentPrice).toFixed(2));
  
  // For sell orders, ensure we don't sell more than we have
  if (tradeType === 'sell') {
    const availableShares = previousTrades.reduce((sum, trade) => {
      return trade.type === 'buy' ? sum + trade.quantity : sum - trade.quantity;
    }, 0);
    
    quantity = Math.min(quantity, availableShares);
    
    // If we don't have enough shares to sell, force a buy instead
    if (quantity <= 0) {
      tradeType = 'buy';
      quantity = parseFloat((tradeAmount / currentPrice).toFixed(2));
    }
  }
  
  // Create the trade
  return {
    simulationId: simulation.id,
    type: tradeType,
    price: currentPrice,
    quantity,
    amount: parseFloat((quantity * currentPrice).toFixed(2)),
    status: 'completed'
  };
}
