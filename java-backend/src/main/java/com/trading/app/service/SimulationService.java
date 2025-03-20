package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Simulation;
import com.trading.app.model.Strategy;
import com.trading.app.model.Symbol;
import com.trading.app.model.Trade;
import com.trading.app.repository.SimulationRepository;
import com.trading.app.repository.StrategyRepository;
import com.trading.app.repository.SymbolRepository;
import com.trading.app.repository.TradeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    
    private static final Logger logger = LoggerFactory.getLogger(SimulationService.class);
    
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
        return simulationRepository.findByUserIdAndStatus(userId, "active");
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
        // Validate symbol and strategy
        Optional<Symbol> symbolOpt = symbolRepository.findById(simulation.getSymbolId());
        Optional<Strategy> strategyOpt = strategyRepository.findById(simulation.getStrategyId());
        
        if (symbolOpt.isEmpty() || strategyOpt.isEmpty()) {
            throw new IllegalArgumentException("Invalid symbol or strategy ID");
        }
        
        // Set initial values
        simulation.setStartTime(LocalDateTime.now());
        simulation.setStatus("active");
        simulation.setCurrentBalance(simulation.getInitialInvestment());
        simulation.setProfitLoss(0.0);
        simulation.setProfitLossPercentage(0.0);
        
        return simulationRepository.save(simulation);
    }
    
    /**
     * Update a simulation
     */
    public Optional<Simulation> updateSimulation(String id, Simulation simulationUpdates) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Simulation simulation = simulationOpt.get();
        
        // Update fields
        if (simulationUpdates.getParameters() != null) {
            simulation.setParameters(simulationUpdates.getParameters());
        }
        
        if (simulationUpdates.getCurrentBalance() > 0) {
            simulation.setCurrentBalance(simulationUpdates.getCurrentBalance());
            simulation.updateProfitLoss();
        }
        
        if (simulationUpdates.getStatus() != null) {
            simulation.setStatus(simulationUpdates.getStatus());
            
            // If completed, set end time
            if ("completed".equals(simulationUpdates.getStatus())) {
                simulation.setEndTime(LocalDateTime.now());
            }
        }
        
        return Optional.of(simulationRepository.save(simulation));
    }
    
    /**
     * Pause a simulation
     */
    public Optional<Simulation> pauseSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Simulation simulation = simulationOpt.get();
        simulation.pause();
        
        return Optional.of(simulationRepository.save(simulation));
    }
    
    /**
     * Resume a simulation
     */
    public Optional<Simulation> resumeSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Simulation simulation = simulationOpt.get();
        simulation.resume();
        
        return Optional.of(simulationRepository.save(simulation));
    }
    
    /**
     * Stop a simulation
     */
    public Optional<Simulation> stopSimulation(String id) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(id);
        
        if (simulationOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Simulation simulation = simulationOpt.get();
        simulation.complete();
        
        return Optional.of(simulationRepository.save(simulation));
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
        return tradeRepository.findBySimulationIdOrderByTimestampDesc(
                simulationId, PageRequest.of(0, limit));
    }
    
    /**
     * Get recent trades for a user
     */
    public List<Trade> getRecentTradesForUser(String userId, int limit) {
        List<Simulation> simulations = simulationRepository.findByUserId(userId);
        List<String> simulationIds = simulations.stream()
                .map(Simulation::getId)
                .collect(Collectors.toList());
        
        if (simulationIds.isEmpty()) {
            return new ArrayList<>();
        }
        
        return tradeRepository.findBySimulationIdsOrderByTimestampDesc(
                simulationIds, PageRequest.of(0, limit));
    }
    
    /**
     * Execute a trade for a simulation
     */
    public Trade executeTrade(Trade trade) {
        Optional<Simulation> simulationOpt = simulationRepository.findById(trade.getSimulationId());
        
        if (simulationOpt.isEmpty()) {
            throw new IllegalArgumentException("Invalid simulation ID");
        }
        
        Simulation simulation = simulationOpt.get();
        
        // Check if the simulation is active
        if (!simulation.isActive()) {
            throw new IllegalStateException("Simulation is not active");
        }
        
        // Set the status to executed
        trade.execute();
        
        // Update the simulation balance and statistics
        double tradeAmount = trade.getAmount();
        
        if (trade.isBuy()) {
            // For buy trades, subtract the amount from the balance
            if (tradeAmount > simulation.getCurrentBalance()) {
                throw new IllegalStateException("Insufficient balance for trade");
            }
            
            simulation.setCurrentBalance(simulation.getCurrentBalance() - tradeAmount);
        } else {
            // For sell trades, add the amount to the balance and calculate profit/loss
            simulation.setCurrentBalance(simulation.getCurrentBalance() + tradeAmount);
            
            // Calculate profit/loss for this trade
            // This is simplified - in a real system, you would need to track position sizes
            double profitLoss = trade.getProfitLoss();
            if (profitLoss > 0) {
                simulation.incrementSuccessfulTrades();
            }
        }
        
        simulation.incrementTotalTrades();
        simulation.updateProfitLoss();
        
        // Save the simulation and trade
        simulationRepository.save(simulation);
        return tradeRepository.save(trade);
    }
    
    /**
     * Process active simulations - called by scheduler
     */
    @Scheduled(cron = "${scheduler.simulation-process.cron}")
    public void processActiveSimulations() {
        logger.info("Processing active simulations...");
        
        List<Simulation> activeSimulations = simulationRepository.findByStatus("active");
        
        for (Simulation simulation : activeSimulations) {
            try {
                processSimulation(simulation);
            } catch (Exception e) {
                logger.error("Error processing simulation {}: {}", simulation.getId(), e.getMessage());
            }
        }
    }
    
    /**
     * Process a single simulation
     */
    private void processSimulation(Simulation simulation) {
        // Get the symbol and strategy
        Optional<Symbol> symbolOpt = symbolRepository.findById(simulation.getSymbolId());
        Optional<Strategy> strategyOpt = strategyRepository.findById(simulation.getStrategyId());
        
        if (symbolOpt.isEmpty() || strategyOpt.isEmpty()) {
            logger.error("Symbol or strategy not found for simulation {}", simulation.getId());
            return;
        }
        
        Symbol symbol = symbolOpt.get();
        Strategy strategy = strategyOpt.get();
        
        // Get the latest market data
        Optional<MarketData> marketDataOpt = marketDataService.getLatestMarketData(symbol.getId());
        
        if (marketDataOpt.isEmpty()) {
            try {
                // Fetch latest market data if not available
                MarketData newData = marketDataService.fetchAndSaveLatestMarketData(symbol.getCode());
                marketDataOpt = Optional.of(newData);
            } catch (Exception e) {
                logger.error("Error fetching market data for symbol {}: {}", symbol.getCode(), e.getMessage());
                return;
            }
        }
        
        MarketData marketData = marketDataOpt.get();
        
        // Apply the strategy to determine if a trade should be made
        Optional<Trade> tradeOpt = applyStrategy(simulation, symbol, strategy, marketData);
        
        // Execute the trade if one was generated
        tradeOpt.ifPresent(trade -> {
            try {
                executeTrade(trade);
                logger.info("Executed trade for simulation {}: {}", simulation.getId(), trade);
            } catch (Exception e) {
                logger.error("Error executing trade for simulation {}: {}", simulation.getId(), e.getMessage());
            }
        });
    }
    
    /**
     * Apply a strategy to determine if a trade should be made
     */
    private Optional<Trade> applyStrategy(Simulation simulation, Symbol symbol, Strategy strategy, MarketData marketData) {
        // This is where you would implement the logic for the various strategies
        // For now, we'll just implement a simple moving average crossover strategy
        
        String strategyName = strategy.getName();
        
        if ("Moving Average Crossover".equals(strategyName)) {
            return applyMovingAverageCrossoverStrategy(simulation, symbol, strategy, marketData);
        } else if ("RSI Overbought/Oversold".equals(strategyName)) {
            return applyRSIStrategy(simulation, symbol, strategy, marketData);
        } else if ("MACD Signal Line Crossover".equals(strategyName)) {
            return applyMACDStrategy(simulation, symbol, strategy, marketData);
        } else if ("Bollinger Bands Breakout".equals(strategyName)) {
            return applyBollingerBandsStrategy(simulation, symbol, strategy, marketData);
        }
        
        // No trade for unsupported strategies
        return Optional.empty();
    }
    
    /**
     * Apply the Moving Average Crossover strategy
     */
    private Optional<Trade> applyMovingAverageCrossoverStrategy(Simulation simulation, Symbol symbol, Strategy strategy, MarketData marketData) {
        // In a real system, you would calculate the moving averages here
        // For now, we'll just generate a random trading signal for demonstration purposes
        
        // Get strategy parameters
        Map<String, Object> parameters = strategy.getParameters();
        int fastPeriod = (int) parameters.get("fastPeriod");
        int slowPeriod = (int) parameters.get("slowPeriod");
        double buyThreshold = (double) parameters.get("buyThreshold");
        double sellThreshold = (double) parameters.get("sellThreshold");
        
        // Get historical data to calculate moving averages
        try {
            List<MarketData> historicalData = marketDataService.getHistoricalMarketData(symbol.getId(), slowPeriod + 10);
            
            if (historicalData.size() < slowPeriod) {
                return Optional.empty();
            }
            
            // Calculate the fast and slow moving averages
            double fastMA = calculateSimpleMovingAverage(historicalData, fastPeriod);
            double slowMA = calculateSimpleMovingAverage(historicalData, slowPeriod);
            
            // Determine if we should buy or sell
            double crossoverValue = (fastMA - slowMA) / slowMA;
            
            if (crossoverValue > buyThreshold) {
                // Buy signal
                double price = marketData.getClose();
                double amount = calculateTradeAmount(simulation, price);
                
                if (amount <= 0) {
                    return Optional.empty();
                }
                
                double quantity = amount / price;
                
                Trade trade = new Trade(simulation.getId(), "buy", price, quantity);
                trade.setReason("Moving Average Crossover: Fast MA > Slow MA by " + crossoverValue);
                
                return Optional.of(trade);
            } else if (crossoverValue < sellThreshold) {
                // Sell signal
                double price = marketData.getClose();
                
                // In a real system, you would check the current position size
                // For now, we'll just sell a fixed amount
                double quantity = 1.0;
                
                Trade trade = new Trade(simulation.getId(), "sell", price, quantity);
                trade.setReason("Moving Average Crossover: Fast MA < Slow MA by " + crossoverValue);
                
                return Optional.of(trade);
            }
            
            return Optional.empty();
        } catch (Exception e) {
            logger.error("Error applying Moving Average Crossover strategy: {}", e.getMessage());
            return Optional.empty();
        }
    }
    
    /**
     * Apply the RSI Overbought/Oversold strategy
     */
    private Optional<Trade> applyRSIStrategy(Simulation simulation, Symbol symbol, Strategy strategy, MarketData marketData) {
        // This would be implemented in a similar way to the Moving Average Crossover strategy
        // For now, we'll just return empty to indicate no trade
        return Optional.empty();
    }
    
    /**
     * Apply the MACD Signal Line Crossover strategy
     */
    private Optional<Trade> applyMACDStrategy(Simulation simulation, Symbol symbol, Strategy strategy, MarketData marketData) {
        // This would be implemented in a similar way to the Moving Average Crossover strategy
        // For now, we'll just return empty to indicate no trade
        return Optional.empty();
    }
    
    /**
     * Apply the Bollinger Bands Breakout strategy
     */
    private Optional<Trade> applyBollingerBandsStrategy(Simulation simulation, Symbol symbol, Strategy strategy, MarketData marketData) {
        // This would be implemented in a similar way to the Moving Average Crossover strategy
        // For now, we'll just return empty to indicate no trade
        return Optional.empty();
    }
    
    /**
     * Calculate a simple moving average from historical market data
     */
    private double calculateSimpleMovingAverage(List<MarketData> data, int period) {
        if (data.size() < period) {
            throw new IllegalArgumentException("Not enough data points for period " + period);
        }
        
        double sum = 0;
        for (int i = 0; i < period; i++) {
            sum += data.get(i).getClose();
        }
        
        return sum / period;
    }
    
    /**
     * Calculate the amount for a trade based on the simulation's current balance
     */
    private double calculateTradeAmount(Simulation simulation, double price) {
        // In a real system, you would implement position sizing logic here
        // For now, we'll just use a fixed percentage of the current balance
        
        double percentOfBalance = 0.1; // 10% of current balance
        double amount = simulation.getCurrentBalance() * percentOfBalance;
        
        // Ensure we have enough balance
        if (amount <= 0) {
            return 0;
        }
        
        // Round to the nearest tradable amount
        amount = Math.floor(amount / price) * price;
        
        return amount;
    }
}