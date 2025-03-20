package com.trading.app.service;

import com.trading.app.model.*;
import com.trading.app.repository.SimulationRepository;
import com.trading.app.repository.StrategyRepository;
import com.trading.app.repository.SymbolRepository;
import com.trading.app.repository.TradeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class SimulationService {

    @Autowired
    private SimulationRepository simulationRepository;
    
    @Autowired
    private TradeRepository tradeRepository;
    
    @Autowired
    private SymbolRepository symbolRepository;
    
    @Autowired
    private StrategyRepository strategyRepository;
    
    @Autowired
    private MarketDataService marketDataService;
    
    /**
     * Get all simulations for a user
     */
    public List<Simulation> getSimulationsForUser(String userId) {
        return simulationRepository.findByUserId(userId);
    }
    
    /**
     * Get active simulations for a user
     */
    public List<Simulation> getActiveSimulationsForUser(String userId) {
        return simulationRepository.findByUserIdAndStatus(userId, "ACTIVE");
    }
    
    /**
     * Get a simulation by ID
     */
    public Optional<Simulation> getSimulationById(String id) {
        return simulationRepository.findById(id);
    }
    
    /**
     * Create a new simulation
     */
    public Simulation createSimulation(Simulation simulation) {
        simulation.setStartTime(LocalDateTime.now());
        simulation.setStatus("ACTIVE");
        simulation.setCurrentValue(simulation.getInitialInvestment());
        simulation.setProfitLoss(0);
        simulation.setProfitLossPercentage(0);
        simulation.setTotalTrades(0);
        
        return simulationRepository.save(simulation);
    }
    
    /**
     * Update a simulation
     */
    public Optional<Simulation> updateSimulation(String id, Simulation simulationUpdates) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isPresent()) {
            Simulation simulation = simulationOpt.get();
            
            // Only update allowed fields
            if (simulationUpdates.getStatus() != null) {
                simulation.setStatus(simulationUpdates.getStatus());
                
                // If simulation is completed or failed, set end time
                if (simulationUpdates.getStatus().equals("COMPLETED") || 
                    simulationUpdates.getStatus().equals("FAILED")) {
                    simulation.setEndTime(LocalDateTime.now());
                }
            }
            
            if (simulationUpdates.getCurrentValue() > 0) {
                simulation.setCurrentValue(simulationUpdates.getCurrentValue());
            }
            
            if (simulationUpdates.getProfitLoss() != 0) {
                simulation.setProfitLoss(simulationUpdates.getProfitLoss());
            }
            
            if (simulationUpdates.getProfitLossPercentage() != 0) {
                simulation.setProfitLossPercentage(simulationUpdates.getProfitLossPercentage());
            }
            
            if (simulationUpdates.getTotalTrades() > 0) {
                simulation.setTotalTrades(simulationUpdates.getTotalTrades());
            }
            
            return Optional.of(simulationRepository.save(simulation));
        }
        
        return Optional.empty();
    }
    
    /**
     * Pause a simulation
     */
    public Optional<Simulation> pauseSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isPresent()) {
            Simulation simulation = simulationOpt.get();
            simulation.setStatus("PAUSED");
            return Optional.of(simulationRepository.save(simulation));
        }
        
        return Optional.empty();
    }
    
    /**
     * Resume a simulation
     */
    public Optional<Simulation> resumeSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isPresent()) {
            Simulation simulation = simulationOpt.get();
            simulation.setStatus("ACTIVE");
            return Optional.of(simulationRepository.save(simulation));
        }
        
        return Optional.empty();
    }
    
    /**
     * Stop a simulation
     */
    public Optional<Simulation> stopSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isPresent()) {
            Simulation simulation = simulationOpt.get();
            simulation.setStatus("COMPLETED");
            simulation.setEndTime(LocalDateTime.now());
            return Optional.of(simulationRepository.save(simulation));
        }
        
        return Optional.empty();
    }
    
    /**
     * Get trades for a simulation
     */
    public List<Trade> getTradesForSimulation(String simulationId) {
        return tradeRepository.findBySimulationId(simulationId);
    }
    
    /**
     * Get recent trades for a simulation
     */
    public List<Trade> getRecentTradesForSimulation(String simulationId, int limit) {
        return tradeRepository.findLatestBySimulationId(
                simulationId, 
                PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "timestamp"))
        );
    }
    
    /**
     * Get recent trades for a user across all simulations
     */
    public List<Trade> getRecentTradesForUser(String userId, int limit) {
        // Get all simulation IDs for this user
        List<String> simulationIds = simulationRepository.findByUserId(userId)
                .stream()
                .map(Simulation::getId)
                .collect(Collectors.toList());
        
        if (simulationIds.isEmpty()) {
            return new ArrayList<>();
        }
        
        // Get recent trades across all simulations
        return tradeRepository.findBySimulationIds(
                simulationIds,
                PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "timestamp"))
        );
    }
    
    /**
     * Execute a trade for a simulation
     */
    public Trade executeTrade(Trade trade) {
        // Save the trade
        Trade savedTrade = tradeRepository.save(trade);
        
        // Update the simulation
        Optional<Simulation> simulationOpt = simulationRepository.findById(trade.getSimulationId());
        
        if (simulationOpt.isPresent()) {
            Simulation simulation = simulationOpt.get();
            
            // Update total trades
            simulation.setTotalTrades(simulation.getTotalTrades() + 1);
            
            // Update current value and profit/loss
            double newValue = simulation.getCurrentValue();
            if (trade.getType().equals("BUY")) {
                newValue -= trade.getAmount();
            } else {
                newValue += trade.getAmount();
            }
            
            simulation.setCurrentValue(newValue);
            
            // Calculate profit/loss
            double profitLoss = simulation.getCurrentValue() - simulation.getInitialInvestment();
            double profitLossPercentage = (profitLoss / simulation.getInitialInvestment()) * 100;
            
            simulation.setProfitLoss(profitLoss);
            simulation.setProfitLossPercentage(profitLossPercentage);
            
            simulationRepository.save(simulation);
        }
        
        return savedTrade;
    }
    
    /**
     * Generate trading signals and execute trades for active simulations
     * This method is scheduled to run at a fixed interval
     */
    @Scheduled(fixedRate = 60000) // Run every minute
    public void processActiveSimulations() {
        // Get all active simulations
        List<Simulation> activeSimulations = simulationRepository.findByUserIdAndStatus(null, "ACTIVE");
        
        for (Simulation simulation : activeSimulations) {
            try {
                // Get the symbol
                Optional<Symbol> symbolOpt = symbolRepository.findById(simulation.getSymbolId());
                if (symbolOpt.isEmpty()) {
                    continue;
                }
                Symbol symbol = symbolOpt.get();
                
                // Get the strategy
                Optional<Strategy> strategyOpt = strategyRepository.findById(simulation.getStrategyId());
                if (strategyOpt.isEmpty()) {
                    continue;
                }
                Strategy strategy = strategyOpt.get();
                
                // Get the latest market data
                Optional<MarketData> latestDataOpt = marketDataService.getLatestMarketData(symbol.getId());
                if (latestDataOpt.isEmpty()) {
                    // Fetch latest market data if not available
                    try {
                        marketDataService.fetchAndSaveLatestMarketData(symbol.getSymbol());
                        latestDataOpt = marketDataService.getLatestMarketData(symbol.getId());
                        if (latestDataOpt.isEmpty()) {
                            continue;
                        }
                    } catch (Exception e) {
                        continue;
                    }
                }
                MarketData latestData = latestDataOpt.get();
                
                // Get historical data for strategy calculation
                List<MarketData> historicalData = marketDataService.getHistoricalMarketData(symbol.getId(), 100);
                
                // Generate trading signal based on strategy
                String signal = generateTradingSignal(strategy, historicalData);
                
                if (!signal.equals("HOLD")) {
                    // Get recent trades to avoid duplicate signals
                    List<Trade> recentTrades = getRecentTradesForSimulation(simulation.getId(), 5);
                    
                    // Skip if the same signal was generated recently
                    boolean duplicateSignal = recentTrades.stream()
                            .anyMatch(trade -> trade.getType().equals(signal) &&
                                    trade.getTimestamp().isAfter(LocalDateTime.now().minusHours(1)));
                    
                    if (!duplicateSignal) {
                        // Calculate trade amount and quantity
                        double availableFunds = simulation.getCurrentValue();
                        double price = latestData.getClose();
                        int quantity = 0;
                        double amount = 0;
                        
                        if (signal.equals("BUY")) {
                            // Use 10% of available funds for each trade
                            amount = availableFunds * 0.1;
                            quantity = (int) (amount / price);
                            
                            // Skip if not enough funds or quantity is zero
                            if (amount > availableFunds || quantity == 0) {
                                continue;
                            }
                        } else {
                            // For sell signals, calculate based on latest buy trade
                            Optional<Trade> lastBuyTrade = recentTrades.stream()
                                    .filter(trade -> trade.getType().equals("BUY"))
                                    .findFirst();
                            
                            if (lastBuyTrade.isPresent()) {
                                quantity = lastBuyTrade.get().getQuantity();
                                amount = quantity * price;
                            } else {
                                continue;
                            }
                        }
                        
                        // Create and execute the trade
                        Trade trade = new Trade();
                        trade.setSimulationId(simulation.getId());
                        trade.setTimestamp(LocalDateTime.now());
                        trade.setType(signal);
                        trade.setPrice(price);
                        trade.setQuantity(quantity);
                        trade.setAmount(amount);
                        trade.setStatus("EXECUTED");
                        trade.setReason(strategy.getName() + " signal");
                        
                        // Calculate profit/loss for sell trades
                        if (signal.equals("SELL")) {
                            Optional<Trade> lastBuyTrade = recentTrades.stream()
                                    .filter(t -> t.getType().equals("BUY"))
                                    .findFirst();
                            
                            if (lastBuyTrade.isPresent()) {
                                double buyAmount = lastBuyTrade.get().getAmount();
                                double profitLoss = amount - buyAmount;
                                double profitLossPercentage = (profitLoss / buyAmount) * 100;
                                
                                trade.setProfitLoss(profitLoss);
                                trade.setProfitLossPercentage(profitLossPercentage);
                            }
                        }
                        
                        executeTrade(trade);
                    }
                }
                
            } catch (Exception e) {
                // Log error and continue with next simulation
                System.err.println("Error processing simulation " + simulation.getId() + ": " + e.getMessage());
            }
        }
    }
    
    /**
     * Generate a trading signal based on a strategy and historical data
     * 
     * @param strategy The trading strategy
     * @param historicalData Historical market data
     * @return "BUY", "SELL", or "HOLD"
     */
    private String generateTradingSignal(Strategy strategy, List<MarketData> historicalData) {
        if (historicalData.isEmpty()) {
            return "HOLD";
        }
        
        String strategyName = strategy.getName();
        Strategy.StrategyParameters params = strategy.getParameters();
        
        if ("Moving Average Crossover".equals(strategyName)) {
            return generateMovingAverageCrossoverSignal(historicalData, params.getFastPeriod(), params.getSlowPeriod());
        } else if ("MACD Crossover".equals(strategyName)) {
            return generateMACDSignal(historicalData, params.getFastPeriod(), params.getSlowPeriod(), params.getSignalPeriod());
        } else if ("RSI Overbought/Oversold".equals(strategyName)) {
            return generateRSISignal(historicalData, params.getFastPeriod(), params.getBuyThreshold(), params.getSellThreshold());
        } else if ("Bollinger Bands".equals(strategyName)) {
            return generateBollingerBandsSignal(historicalData, params.getFastPeriod(), params.getSlowPeriod());
        }
        
        return "HOLD";
    }
    
    /**
     * Generate Moving Average Crossover signal
     */
    private String generateMovingAverageCrossoverSignal(List<MarketData> historicalData, int fastPeriod, int slowPeriod) {
        if (historicalData.size() < slowPeriod + 2) {
            return "HOLD";
        }
        
        // Calculate fast MA and slow MA
        double[] fastMA = calculateSMA(historicalData, fastPeriod);
        double[] slowMA = calculateSMA(historicalData, slowPeriod);
        
        // Check for crossover
        if (fastMA[1] < slowMA[1] && fastMA[0] > slowMA[0]) {
            return "BUY";
        } else if (fastMA[1] > slowMA[1] && fastMA[0] < slowMA[0]) {
            return "SELL";
        }
        
        return "HOLD";
    }
    
    /**
     * Generate MACD signal
     */
    private String generateMACDSignal(List<MarketData> historicalData, int fastPeriod, int slowPeriod, int signalPeriod) {
        if (historicalData.size() < slowPeriod + signalPeriod + 2) {
            return "HOLD";
        }
        
        // Calculate MACD line and signal line
        double[] macdLine = calculateMACD(historicalData, fastPeriod, slowPeriod);
        double[] signalLine = calculateSignalLine(macdLine, signalPeriod);
        
        // Check for crossover
        if (macdLine[1] < signalLine[1] && macdLine[0] > signalLine[0]) {
            return "BUY";
        } else if (macdLine[1] > signalLine[1] && macdLine[0] < signalLine[0]) {
            return "SELL";
        }
        
        return "HOLD";
    }
    
    /**
     * Generate RSI signal
     */
    private String generateRSISignal(List<MarketData> historicalData, int period, double oversold, double overbought) {
        if (historicalData.size() < period + 1) {
            return "HOLD";
        }
        
        double rsi = calculateRSI(historicalData, period);
        
        if (rsi < oversold) {
            return "BUY";
        } else if (rsi > overbought) {
            return "SELL";
        }
        
        return "HOLD";
    }
    
    /**
     * Generate Bollinger Bands signal
     */
    private String generateBollingerBandsSignal(List<MarketData> historicalData, int period, double stdDev) {
        if (historicalData.size() < period + 1) {
            return "HOLD";
        }
        
        // Calculate SMA
        double[] sma = calculateSMA(historicalData, period);
        double middleBand = sma[0];
        
        // Calculate standard deviation
        double standardDeviation = calculateStandardDeviation(historicalData, period, middleBand);
        
        // Calculate upper and lower bands
        double upperBand = middleBand + (standardDeviation * stdDev);
        double lowerBand = middleBand - (standardDeviation * stdDev);
        
        // Get current price
        double currentPrice = historicalData.get(0).getClose();
        
        // Generate signal
        if (currentPrice < lowerBand) {
            return "BUY";
        } else if (currentPrice > upperBand) {
            return "SELL";
        }
        
        return "HOLD";
    }
    
    /**
     * Calculate Simple Moving Average (SMA)
     */
    private double[] calculateSMA(List<MarketData> data, int period) {
        double[] result = new double[2]; // [current, previous]
        
        // Calculate current SMA
        double sum = 0;
        for (int i = 0; i < period; i++) {
            if (i < data.size()) {
                sum += data.get(i).getClose();
            }
        }
        result[0] = sum / period;
        
        // Calculate previous SMA
        sum = 0;
        for (int i = 1; i < period + 1; i++) {
            if (i < data.size()) {
                sum += data.get(i).getClose();
            }
        }
        result[1] = sum / period;
        
        return result;
    }
    
    /**
     * Calculate MACD line
     */
    private double[] calculateMACD(List<MarketData> data, int fastPeriod, int slowPeriod) {
        double[] result = new double[2]; // [current, previous]
        
        // Calculate current EMA
        double fastEMA = calculateEMA(data, fastPeriod, 0);
        double slowEMA = calculateEMA(data, slowPeriod, 0);
        result[0] = fastEMA - slowEMA;
        
        // Calculate previous EMA
        fastEMA = calculateEMA(data, fastPeriod, 1);
        slowEMA = calculateEMA(data, slowPeriod, 1);
        result[1] = fastEMA - slowEMA;
        
        return result;
    }
    
    /**
     * Calculate Signal line for MACD
     */
    private double[] calculateSignalLine(double[] macdLine, int signalPeriod) {
        double[] result = new double[2]; // [current, previous]
        
        // Simple implementation - in a real system, you would calculate EMA of MACD line
        result[0] = macdLine[0] * 0.2 + macdLine[1] * 0.8;
        result[1] = macdLine[1];
        
        return result;
    }
    
    /**
     * Calculate Exponential Moving Average (EMA)
     */
    private double calculateEMA(List<MarketData> data, int period, int offset) {
        // Simple implementation - in a real system, this would be more complex
        double alpha = 2.0 / (period + 1);
        double ema = data.get(offset).getClose();
        
        for (int i = offset + 1; i < offset + period && i < data.size(); i++) {
            ema = data.get(i).getClose() * alpha + ema * (1 - alpha);
        }
        
        return ema;
    }
    
    /**
     * Calculate Relative Strength Index (RSI)
     */
    private double calculateRSI(List<MarketData> data, int period) {
        if (data.size() <= period) {
            return 50; // Default value if not enough data
        }
        
        double avgGain = 0;
        double avgLoss = 0;
        
        // Calculate initial average gain/loss
        for (int i = 1; i <= period; i++) {
            double change = data.get(i-1).getClose() - data.get(i).getClose();
            if (change >= 0) {
                avgGain += change;
            } else {
                avgLoss += Math.abs(change);
            }
        }
        
        avgGain /= period;
        avgLoss /= period;
        
        // Calculate RS and RSI
        double rs = avgGain / Math.max(avgLoss, 0.001); // Avoid division by zero
        double rsi = 100 - (100 / (1 + rs));
        
        return rsi;
    }
    
    /**
     * Calculate Standard Deviation
     */
    private double calculateStandardDeviation(List<MarketData> data, int period, double mean) {
        double variance = 0;
        
        for (int i = 0; i < period && i < data.size(); i++) {
            double diff = data.get(i).getClose() - mean;
            variance += diff * diff;
        }
        
        variance /= period;
        return Math.sqrt(variance);
    }
}