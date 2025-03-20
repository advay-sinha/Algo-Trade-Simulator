package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import com.trading.app.repository.MarketDataRepository;
import com.trading.app.repository.SymbolRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class MarketDataService {
    
    private static final Logger logger = LoggerFactory.getLogger(MarketDataService.class);
    
    @Autowired
    private MarketDataRepository marketDataRepository;
    
    @Autowired
    private SymbolRepository symbolRepository;
    
    @Autowired
    private YahooFinanceService yahooFinanceService;
    
    @Autowired
    private AlphaVantageService alphaVantageService;
    
    /**
     * Get the latest market data for a symbol
     */
    public Optional<MarketData> getLatestMarketData(String symbolId) {
        return marketDataRepository.findTopBySymbolIdOrderByTimestampDesc(symbolId);
    }
    
    /**
     * Get historical market data for a symbol
     */
    public List<MarketData> getHistoricalMarketData(String symbolId, int limit) {
        return marketDataRepository.findBySymbolIdOrderByTimestampDesc(
                symbolId, PageRequest.of(0, limit));
    }
    
    /**
     * Fetch and save the latest market data for a symbol
     */
    public MarketData fetchAndSaveLatestMarketData(String symbolCode) throws Exception {
        // First try with Yahoo Finance
        try {
            Map<String, Object> quote = yahooFinanceService.getQuote(symbolCode);
            
            Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
            if (symbolOpt.isEmpty()) {
                throw new Exception("Symbol not found: " + symbolCode);
            }
            
            Symbol symbol = symbolOpt.get();
            MarketData marketData = yahooFinanceService.convertToMarketData(symbol.getId(), quote);
            
            return marketDataRepository.save(marketData);
        } catch (Exception e) {
            logger.error("Error fetching data from Yahoo Finance: {}", e.getMessage());
            
            // Fallback to Alpha Vantage
            try {
                Map<String, Object> quote = alphaVantageService.getQuote(symbolCode);
                
                Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
                if (symbolOpt.isEmpty()) {
                    throw new Exception("Symbol not found: " + symbolCode);
                }
                
                Symbol symbol = symbolOpt.get();
                MarketData marketData = alphaVantageService.convertToMarketData(symbol.getId(), quote);
                
                return marketDataRepository.save(marketData);
            } catch (Exception avError) {
                logger.error("Error fetching data from Alpha Vantage: {}", avError.getMessage());
                throw new Exception("Failed to fetch market data from both Yahoo Finance and Alpha Vantage");
            }
        }
    }
    
    /**
     * Fetch and save historical market data for a symbol
     */
    public List<MarketData> fetchAndSaveHistoricalMarketData(String symbolCode, String interval, String range) throws Exception {
        Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
        if (symbolOpt.isEmpty()) {
            throw new Exception("Symbol not found: " + symbolCode);
        }
        
        Symbol symbol = symbolOpt.get();
        List<MarketData> savedData = new ArrayList<>();
        
        // First try with Yahoo Finance
        try {
            List<Map<String, Object>> historicalData = yahooFinanceService.getHistoricalData(symbolCode, interval, range);
            
            for (Map<String, Object> dataPoint : historicalData) {
                MarketData marketData = yahooFinanceService.convertHistoricalToMarketData(symbol.getId(), dataPoint);
                savedData.add(marketDataRepository.save(marketData));
            }
            
            return savedData;
        } catch (Exception e) {
            logger.error("Error fetching historical data from Yahoo Finance: {}", e.getMessage());
            
            // Fallback to Alpha Vantage
            try {
                List<Map<String, Object>> intradayData = alphaVantageService.getIntradayData(symbolCode, interval);
                
                for (Map<String, Object> dataPoint : intradayData) {
                    MarketData marketData = alphaVantageService.convertIntradayToMarketData(symbol.getId(), dataPoint);
                    savedData.add(marketDataRepository.save(marketData));
                }
                
                return savedData;
            } catch (Exception avError) {
                logger.error("Error fetching historical data from Alpha Vantage: {}", avError.getMessage());
                throw new Exception("Failed to fetch historical data from both Yahoo Finance and Alpha Vantage");
            }
        }
    }
    
    /**
     * Get the top gainers in the market
     */
    public List<Map<String, Object>> getTopGainers() throws Exception {
        // First try with Yahoo Finance
        try {
            List<Map<String, Object>> topGainers = yahooFinanceService.getTopGainers();
            return topGainers;
        } catch (Exception e) {
            logger.error("Error fetching top gainers from Yahoo Finance: {}", e.getMessage());
            
            // For Alpha Vantage, this is not directly available
            // We would need to implement a custom solution by fetching multiple symbols
            // For now, we'll just return an empty list
            return new ArrayList<>();
        }
    }
    
    /**
     * Get the top losers in the market
     */
    public List<Map<String, Object>> getTopLosers() throws Exception {
        // First try with Yahoo Finance
        try {
            List<Map<String, Object>> topLosers = yahooFinanceService.getTopLosers();
            return topLosers;
        } catch (Exception e) {
            logger.error("Error fetching top losers from Yahoo Finance: {}", e.getMessage());
            
            // For Alpha Vantage, this is not directly available
            // We would need to implement a custom solution by fetching multiple symbols
            // For now, we'll just return an empty list
            return new ArrayList<>();
        }
    }
    
    /**
     * Get market indices (NSE, BSE, etc.)
     */
    public List<Map<String, Object>> getMarketIndices() throws Exception {
        List<Symbol> indices = symbolRepository.findByType("Index");
        
        List<Map<String, Object>> marketIndices = new ArrayList<>();
        
        for (Symbol index : indices) {
            try {
                Map<String, Object> indexData = new HashMap<>();
                indexData.put("symbol", index.getCode());
                indexData.put("name", index.getName());
                
                // First try with Yahoo Finance
                try {
                    Map<String, Object> quote = yahooFinanceService.getQuote(index.getCode());
                    indexData.put("price", quote.get("regularMarketPrice"));
                    indexData.put("change", quote.get("regularMarketChange"));
                    indexData.put("changePercent", quote.get("regularMarketChangePercent"));
                } catch (Exception e) {
                    // Fallback to Alpha Vantage
                    try {
                        Map<String, Object> quote = alphaVantageService.getQuote(index.getCode());
                        indexData.put("price", quote.get("price"));
                        indexData.put("change", quote.get("change"));
                        indexData.put("changePercent", quote.get("changePercent"));
                    } catch (Exception avError) {
                        // Skip if both APIs fail
                        continue;
                    }
                }
                
                marketIndices.add(indexData);
            } catch (Exception e) {
                logger.error("Error fetching data for index {}: {}", index.getCode(), e.getMessage());
            }
        }
        
        return marketIndices;
    }
    
    /**
     * Update market data for all tracked symbols (called by scheduler)
     */
    @Scheduled(cron = "${scheduler.market-data-update.cron}")
    public void updateMarketData() {
        logger.info("Updating market data for all tracked symbols...");
        
        List<Symbol> symbols = symbolRepository.findAll();
        
        for (Symbol symbol : symbols) {
            try {
                fetchAndSaveLatestMarketData(symbol.getCode());
                logger.info("Updated market data for symbol: {}", symbol.getCode());
            } catch (Exception e) {
                logger.error("Error updating market data for symbol {}: {}", symbol.getCode(), e.getMessage());
            }
        }
    }
    
    /**
     * Test API connectivity
     */
    public Map<String, Object> testApiConnectivity() {
        Map<String, Object> result = new HashMap<>();
        
        // Test Yahoo Finance connectivity
        Map<String, Object> yahooResult = yahooFinanceService.testConnection();
        result.put("yahooFinance", yahooResult);
        
        // Test Alpha Vantage connectivity
        Map<String, Object> alphaVantageResult = alphaVantageService.testConnection();
        result.put("alphaVantage", alphaVantageResult);
        
        boolean overallSuccess = 
                (boolean) yahooResult.get("success") || 
                (boolean) alphaVantageResult.get("success");
        
        result.put("success", overallSuccess);
        result.put("message", overallSuccess ? 
                "At least one API is working correctly" : 
                "Both APIs are unavailable");
        
        return result;
    }
}