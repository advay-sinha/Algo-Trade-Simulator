package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import com.trading.app.repository.MarketDataRepository;
import com.trading.app.repository.SymbolRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class MarketDataService {

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
        return marketDataRepository.findLatestBySymbolId(
                symbolId,
                PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "timestamp"))
        );
    }
    
    /**
     * Get market data for a time range
     */
    public List<MarketData> getMarketDataForTimeRange(
            String symbolId,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {
        return marketDataRepository.findBySymbolIdAndTimestampBetween(symbolId, startTime, endTime);
    }
    
    /**
     * Fetch latest market data from external APIs and save to database
     */
    public MarketData fetchAndSaveLatestMarketData(String symbolCode) throws Exception {
        Optional<Symbol> symbolOpt = symbolRepository.findBySymbol(symbolCode);
        
        if (symbolOpt.isEmpty()) {
            throw new Exception("Symbol not found: " + symbolCode);
        }
        
        Symbol symbol = symbolOpt.get();
        
        // Try Yahoo Finance first
        try {
            MarketData marketData = yahooFinanceService.fetchLatestMarketData(symbol);
            return marketDataRepository.save(marketData);
        } catch (Exception e) {
            // Fallback to Alpha Vantage
            MarketData marketData = alphaVantageService.fetchLatestMarketData(symbol);
            return marketDataRepository.save(marketData);
        }
    }
    
    /**
     * Fetch historical market data from external APIs and save to database
     */
    public List<MarketData> fetchAndSaveHistoricalMarketData(String symbolCode, String interval, String range) throws Exception {
        Optional<Symbol> symbolOpt = symbolRepository.findBySymbol(symbolCode);
        
        if (symbolOpt.isEmpty()) {
            throw new Exception("Symbol not found: " + symbolCode);
        }
        
        Symbol symbol = symbolOpt.get();
        
        // Try Yahoo Finance first
        try {
            List<MarketData> marketDataList = yahooFinanceService.fetchHistoricalMarketData(symbol, interval, range);
            return marketDataRepository.saveAll(marketDataList);
        } catch (Exception e) {
            // Fallback to Alpha Vantage
            List<MarketData> marketDataList = alphaVantageService.fetchHistoricalMarketData(symbol, interval);
            return marketDataRepository.saveAll(marketDataList);
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
}