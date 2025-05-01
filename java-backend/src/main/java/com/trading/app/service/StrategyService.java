package com.trading.app.service;

import com.trading.app.model.Strategy;
import com.trading.app.repository.StrategyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class StrategyService {
    
    private static final Logger logger = LoggerFactory.getLogger(StrategyService.class);
    
    @Autowired
    private StrategyRepository strategyRepository;
    
    /**
     * Get all strategies
     */
    public List<Strategy> getAllStrategies() {
        return strategyRepository.findAll();
    }
    
    /**
     * Get a strategy by ID
     */
    public Optional<Strategy> getStrategyById(String id) {
        return strategyRepository.findById(id);
    }
    
    /**
     * Get a strategy by name
     */
    public Optional<Strategy> getStrategyByName(String name) {
        return strategyRepository.findByName(name);
    }
    
    /**
     * Save a strategy
     */
    public Strategy saveStrategy(Strategy strategy) {
        return strategyRepository.save(strategy);
    }
    
    /**
     * Delete a strategy
     */
    public void deleteStrategy(String id) {
        strategyRepository.deleteById(id);
    }
    
    /**
     * Get strategies by time frame
     */
    public List<Strategy> getStrategiesByTimeFrame(String timeFrame) {
        return strategyRepository.findByTimeFrame(timeFrame);
    }
    
    /**
     * Get strategies by risk rating
     */
    public List<Strategy> getStrategiesByRiskRating(String riskRating) {
        return strategyRepository.findByRiskRating(riskRating);
    }
    
    /**
     * Initialize default strategies
     */
    public void initializeDefaultStrategies() {
        List<Strategy> defaultStrategies = new ArrayList<>();
        
        // Moving Average Crossover strategy
        Strategy maStrategy = new Strategy(
                "Moving Average Crossover",
                "A strategy that generates buy signals when a shorter-term moving average crosses above a longer-term moving average, and sell signals when the shorter-term moving average crosses below the longer-term moving average.",
                "Medium-term",
                "60-70%",
                "Trending markets",
                "Medium"
        );
        
        Map<String, Object> maParameters = new HashMap<>();
        maParameters.put("fastPeriod", 12);
        maParameters.put("slowPeriod", 26);
        maParameters.put("signalPeriod", 9);
        maParameters.put("buyThreshold", 0.05);
        maParameters.put("sellThreshold", -0.05);
        maParameters.put("stopLoss", 5.0);
        
        maStrategy.setParameters(maParameters);
        defaultStrategies.add(maStrategy);
        
        // Relative Strength Index (RSI) strategy
        Strategy rsiStrategy = new Strategy(
                "RSI Overbought/Oversold",
                "A strategy that generates buy signals when the Relative Strength Index (RSI) falls below an oversold threshold (typically 30), and sell signals when the RSI rises above an overbought threshold (typically 70).",
                "Short-term",
                "55-65%",
                "Range-bound markets",
                "Medium-High"
        );
        
        Map<String, Object> rsiParameters = new HashMap<>();
        rsiParameters.put("period", 14);
        rsiParameters.put("overbought", 70);
        rsiParameters.put("oversold", 30);
        rsiParameters.put("stopLoss", 5.0);
        
        rsiStrategy.setParameters(rsiParameters);
        defaultStrategies.add(rsiStrategy);
        
        // MACD (Moving Average Convergence Divergence) strategy
        Strategy macdStrategy = new Strategy(
                "MACD Signal Line Crossover",
                "A strategy that generates buy signals when the MACD line crosses above the signal line, and sell signals when the MACD line crosses below the signal line.",
                "Medium-term",
                "65-75%",
                "Trending markets",
                "Medium"
        );
        
        Map<String, Object> macdParameters = new HashMap<>();
        macdParameters.put("fastPeriod", 12);
        macdParameters.put("slowPeriod", 26);
        macdParameters.put("signalPeriod", 9);
        macdParameters.put("stopLoss", 5.0);
        
        macdStrategy.setParameters(macdParameters);
        defaultStrategies.add(macdStrategy);
        
        // Bollinger Bands strategy
        Strategy bbStrategy = new Strategy(
                "Bollinger Bands Breakout",
                "A strategy that generates buy signals when the price breaks above the upper Bollinger Band, and sell signals when the price breaks below the lower Bollinger Band.",
                "Short-term",
                "60-70%",
                "Volatile markets",
                "High"
        );
        
        Map<String, Object> bbParameters = new HashMap<>();
        bbParameters.put("period", 20);
        bbParameters.put("standardDeviation", 2.0);
        bbParameters.put("stopLoss", 5.0);
        
        bbStrategy.setParameters(bbParameters);
        defaultStrategies.add(bbStrategy);
        
        // Save all default strategies
        for (Strategy strategy : defaultStrategies) {
            try {
                Optional<Strategy> existingStrategy = strategyRepository.findByName(strategy.getName());
                if (existingStrategy.isEmpty()) {
                    strategyRepository.save(strategy);
                }
            } catch (Exception e) {
                logger.error("Error saving default strategy {}: {}", strategy.getName(), e.getMessage());
            }
        }
    }
}