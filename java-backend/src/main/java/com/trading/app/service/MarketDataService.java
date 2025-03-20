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
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
     * Get historical market data for a symbol with limit
     */
    public List<MarketData> getHistoricalMarketData(String symbolId, int limit) {
        return marketDataRepository.findBySymbolIdOrderByTimestampDesc(
                symbolId, PageRequest.of(0, limit));
    }
    
    /**
     * Get market data for a specific time range
     */
    public List<MarketData> getMarketDataForTimeRange(String symbolId, LocalDateTime startTime, LocalDateTime endTime) {
        return marketDataRepository.findBySymbolIdAndTimestampBetweenOrderByTimestampAsc(
                symbolId, startTime, endTime);
    }
    
    /**
     * Fetch and save the latest market data for a symbol using Yahoo Finance
     */
    public MarketData fetchAndSaveLatestMarketData(String symbolCode) throws Exception {
        // First try with Yahoo Finance
        try {
            Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
            Symbol symbol;
            
            if (symbolOpt.isEmpty()) {
                // If symbol doesn't exist, create it
                Map<String, Object> quote = yahooFinanceService.getQuote(symbolCode);
                if (quote == null) {
                    throw new Exception("Symbol not found: " + symbolCode);
                }
                
                symbol = yahooFinanceService.convertToSymbol(quote);
                symbol = symbolRepository.save(symbol);
            } else {
                symbol = symbolOpt.get();
            }
            
            Map<String, Object> quote = yahooFinanceService.getQuote(symbolCode);
            if (quote == null) {
                throw new Exception("Failed to fetch data from Yahoo Finance for: " + symbolCode);
            }
            
            MarketData marketData = yahooFinanceService.convertToMarketData(quote, symbol.getId());
            return marketDataRepository.save(marketData);
        } catch (Exception e) {
            logger.error("Error fetching data from Yahoo Finance: {}", e.getMessage());
            
            // Fallback to Alpha Vantage
            try {
                Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
                Symbol symbol;
                
                if (symbolOpt.isEmpty()) {
                    // If symbol doesn't exist, create it
                    List<Map<String, Object>> searchResults = alphaVantageService.searchSymbols(symbolCode);
                    if (searchResults.isEmpty()) {
                        throw new Exception("Symbol not found: " + symbolCode);
                    }
                    
                    symbol = alphaVantageService.convertToSymbol(searchResults.get(0));
                    symbol = symbolRepository.save(symbol);
                } else {
                    symbol = symbolOpt.get();
                }
                
                Map<String, Object> quote = alphaVantageService.getQuote(symbolCode);
                if (quote == null) {
                    throw new Exception("Failed to fetch data from Alpha Vantage for: " + symbolCode);
                }
                
                MarketData marketData = alphaVantageService.convertToMarketData(quote, symbol.getId());
                return marketDataRepository.save(marketData);
            } catch (Exception avError) {
                logger.error("Error fetching data from Alpha Vantage: {}", avError.getMessage());
                throw new Exception("Failed to fetch market data from both Yahoo Finance and Alpha Vantage");
            }
        }
    }
    
    /**
     * Fetch and save historical market data for a symbol using Yahoo Finance
     */
    public List<MarketData> fetchAndSaveHistoricalMarketData(String symbolCode, String interval, String range) throws Exception {
        List<MarketData> savedData = new ArrayList<>();
        
        // First try with Yahoo Finance
        try {
            Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
            Symbol symbol;
            
            if (symbolOpt.isEmpty()) {
                // If symbol doesn't exist, create it
                Map<String, Object> quote = yahooFinanceService.getQuote(symbolCode);
                if (quote == null) {
                    throw new Exception("Symbol not found: " + symbolCode);
                }
                
                symbol = yahooFinanceService.convertToSymbol(quote);
                symbol = symbolRepository.save(symbol);
            } else {
                symbol = symbolOpt.get();
            }
            
            List<Map<String, Object>> historicalData = yahooFinanceService.getHistoricalData(symbolCode, interval, range);
            
            if (historicalData.isEmpty()) {
                throw new Exception("No historical data found from Yahoo Finance for: " + symbolCode);
            }
            
            for (Map<String, Object> dataPoint : historicalData) {
                MarketData marketData = yahooFinanceService.convertHistoricalDataToMarketData(dataPoint, symbol.getId());
                savedData.add(marketDataRepository.save(marketData));
            }
            
            return savedData;
        } catch (Exception e) {
            logger.error("Error fetching historical data from Yahoo Finance: {}", e.getMessage());
            
            // Fallback to Alpha Vantage
            try {
                Optional<Symbol> symbolOpt = symbolRepository.findByCode(symbolCode);
                Symbol symbol;
                
                if (symbolOpt.isEmpty()) {
                    // If symbol doesn't exist, create it
                    List<Map<String, Object>> searchResults = alphaVantageService.searchSymbols(symbolCode);
                    if (searchResults.isEmpty()) {
                        throw new Exception("Symbol not found: " + symbolCode);
                    }
                    
                    symbol = alphaVantageService.convertToSymbol(searchResults.get(0));
                    symbol = symbolRepository.save(symbol);
                } else {
                    symbol = symbolOpt.get();
                }
                
                // Map the interval to Alpha Vantage format
                String avInterval = "5min"; // Default
                if (interval.equals("1d")) {
                    // Use daily data
                    Map<String, Object> dailyData = alphaVantageService.getDailyData(symbolCode);
                    List<MarketData> marketDataList = alphaVantageService.convertDailyDataToMarketData(dailyData, symbol.getId());
                    
                    for (MarketData data : marketDataList) {
                        savedData.add(marketDataRepository.save(data));
                    }
                } else {
                    // Use intraday data with appropriate interval
                    if (interval.equals("1h")) {
                        avInterval = "60min";
                    } else if (interval.equals("30m")) {
                        avInterval = "30min";
                    } else if (interval.equals("15m")) {
                        avInterval = "15min";
                    }
                    
                    Map<String, Object> intradayData = alphaVantageService.getIntradayData(symbolCode, avInterval);
                    List<MarketData> marketDataList = alphaVantageService.convertIntradayDataToMarketData(intradayData, symbol.getId());
                    
                    for (MarketData data : marketDataList) {
                        savedData.add(marketDataRepository.save(data));
                    }
                }
                
                return savedData;
            } catch (Exception avError) {
                logger.error("Error fetching historical data from Alpha Vantage: {}", avError.getMessage());
                throw new Exception("Failed to fetch historical market data from both Yahoo Finance and Alpha Vantage");
            }
        }
    }
    
    /**
     * Save market data
     */
    public MarketData saveMarketData(MarketData marketData) {
        return marketDataRepository.save(marketData);
    }
    
    /**
     * Save multiple market data entries
     */
    public List<MarketData> saveAllMarketData(List<MarketData> marketDataList) {
        return marketDataRepository.saveAll(marketDataList);
    }
    
    /**
     * Delete market data
     */
    public void deleteMarketData(String id) {
        marketDataRepository.deleteById(id);
    }
    
    /**
     * Delete all market data for a symbol
     */
    public void deleteAllMarketDataForSymbol(String symbolId) {
        marketDataRepository.deleteBySymbolId(symbolId);
    }
    
    /**
     * Delete old market data (older than a certain date)
     */
    public void deleteOldMarketData(LocalDateTime olderThan) {
        marketDataRepository.deleteByTimestampBefore(olderThan);
    }
    
    /**
     * Test connections to market data APIs
     */
    public Map<String, Object> testConnections() {
        Map<String, Object> yahooResult = yahooFinanceService.testConnection();
        Map<String, Object> alphaVantageResult = alphaVantageService.testConnection();
        
        return Map.of(
                "yahooFinance", yahooResult,
                "alphaVantage", alphaVantageResult
        );
    }
}