package com.trading.app.service;

import com.trading.app.model.Strategy;
import com.trading.app.repository.StrategyRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class StrategyService {

    @Autowired
    private StrategyRepository strategyRepository;
    
    /**
     * Get all strategies
     */
    public List<Strategy> getAllStrategies() {
        return strategyRepository.findAll();
    }
    
    /**
     * Get strategy by ID
     */
    public Optional<Strategy> getStrategyById(String id) {
        return strategyRepository.findById(id);
    }
    
    /**
     * Get strategy by name
     */
    public Optional<Strategy> getStrategyByName(String name) {
        return strategyRepository.findByName(name);
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
     * Initialize default strategies
     */
    public void initializeDefaultStrategies() {
        // Check if any strategies exist already
        if (strategyRepository.count() > 0) {
            return;
        }
        
        // Create and save Moving Average Crossover strategy
        Strategy macdStrategy = new Strategy();
        macdStrategy.setName("MACD Crossover");
        macdStrategy.setDescription("The Moving Average Convergence Divergence (MACD) strategy generates buy signals when the MACD line crosses above the signal line, and sell signals when it crosses below.");
        macdStrategy.setTimeFrame("Daily");
        macdStrategy.setSuccessRate("65-70%");
        macdStrategy.setBestMarketCondition("Trending markets");
        macdStrategy.setRiskRating("Medium");
        
        Strategy.StrategyParameters macdParams = new Strategy.StrategyParameters();
        macdParams.setFastPeriod(12);
        macdParams.setSlowPeriod(26);
        macdParams.setSignalPeriod(9);
        macdParams.setBuyThreshold(0);
        macdParams.setSellThreshold(0);
        macdParams.setStopLoss(3);
        macdStrategy.setParameters(macdParams);
        
        strategyRepository.save(macdStrategy);
        
        // Create and save RSI strategy
        Strategy rsiStrategy = new Strategy();
        rsiStrategy.setName("RSI Overbought/Oversold");
        rsiStrategy.setDescription("The Relative Strength Index (RSI) strategy generates buy signals when RSI falls below the oversold threshold (typically 30), and sell signals when it rises above the overbought threshold (typically 70).");
        rsiStrategy.setTimeFrame("Daily");
        rsiStrategy.setSuccessRate("60-65%");
        rsiStrategy.setBestMarketCondition("Range-bound markets");
        rsiStrategy.setRiskRating("Medium");
        
        Strategy.StrategyParameters rsiParams = new Strategy.StrategyParameters();
        rsiParams.setFastPeriod(14);
        rsiParams.setSlowPeriod(0);
        rsiParams.setSignalPeriod(0);
        rsiParams.setBuyThreshold(30);
        rsiParams.setSellThreshold(70);
        rsiParams.setStopLoss(5);
        rsiStrategy.setParameters(rsiParams);
        
        strategyRepository.save(rsiStrategy);
        
        // Create and save Moving Average Crossover strategy
        Strategy maStrategy = new Strategy();
        maStrategy.setName("Moving Average Crossover");
        maStrategy.setDescription("The Moving Average Crossover strategy generates buy signals when a shorter-term moving average crosses above a longer-term moving average, and sell signals when it crosses below.");
        maStrategy.setTimeFrame("Daily");
        maStrategy.setSuccessRate("60-65%");
        maStrategy.setBestMarketCondition("Trending markets");
        maStrategy.setRiskRating("Medium");
        
        Strategy.StrategyParameters maParams = new Strategy.StrategyParameters();
        maParams.setFastPeriod(50);
        maParams.setSlowPeriod(200);
        maParams.setSignalPeriod(0);
        maParams.setBuyThreshold(0);
        maParams.setSellThreshold(0);
        maParams.setStopLoss(5);
        maStrategy.setParameters(maParams);
        
        strategyRepository.save(maStrategy);
        
        // Create and save Bollinger Bands strategy
        Strategy bbStrategy = new Strategy();
        bbStrategy.setName("Bollinger Bands");
        bbStrategy.setDescription("The Bollinger Bands strategy generates buy signals when the price touches the lower band, and sell signals when it touches the upper band.");
        bbStrategy.setTimeFrame("Daily");
        bbStrategy.setSuccessRate("55-60%");
        bbStrategy.setBestMarketCondition("Volatile markets");
        bbStrategy.setRiskRating("High");
        
        Strategy.StrategyParameters bbParams = new Strategy.StrategyParameters();
        bbParams.setFastPeriod(20);
        bbParams.setSlowPeriod(2);
        bbParams.setSignalPeriod(0);
        bbParams.setBuyThreshold(0);
        bbParams.setSellThreshold(0);
        bbParams.setStopLoss(3);
        bbStrategy.setParameters(bbParams);
        
        strategyRepository.save(bbStrategy);
    }
}