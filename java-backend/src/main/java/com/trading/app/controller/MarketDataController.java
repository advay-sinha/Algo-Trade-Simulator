package com.trading.app.controller;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import com.trading.app.service.MarketDataService;
import com.trading.app.service.SymbolService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/market")
public class MarketDataController {
    
    private static final Logger logger = LoggerFactory.getLogger(MarketDataController.class);
    
    @Autowired
    private MarketDataService marketDataService;
    
    @Autowired
    private SymbolService symbolService;
    
    /**
     * Test the API connections to Yahoo Finance and Alpha Vantage
     */
    @GetMapping("/test-api-connectivity")
    public ResponseEntity<Map<String, Object>> testApiConnectivity() {
        Map<String, Object> result = marketDataService.testApiConnectivity();
        return ResponseEntity.ok(result);
    }
    
    /**
     * Get all symbols
     */
    @GetMapping("/symbols")
    public ResponseEntity<List<Symbol>> getAllSymbols() {
        List<Symbol> symbols = symbolService.getAllSymbols();
        return ResponseEntity.ok(symbols);
    }
    
    /**
     * Search for symbols
     */
    @GetMapping("/symbols/search")
    public ResponseEntity<List<Symbol>> searchSymbols(@RequestParam String query) {
        try {
            List<Symbol> symbols = symbolService.searchSymbols(query);
            return ResponseEntity.ok(symbols);
        } catch (Exception e) {
            logger.error("Error searching symbols: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Search for symbols in external APIs and save to database
     */
    @GetMapping("/symbols/search-external")
    public ResponseEntity<List<Symbol>> searchAndSaveSymbols(@RequestParam String query) {
        try {
            List<Symbol> symbols = symbolService.searchAndSaveSymbols(query);
            return ResponseEntity.ok(symbols);
        } catch (Exception e) {
            logger.error("Error searching and saving symbols: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Get symbol details
     */
    @GetMapping("/symbols/{id}")
    public ResponseEntity<Symbol> getSymbolById(@PathVariable String id) {
        Optional<Symbol> symbol = symbolService.getSymbolById(id);
        return symbol.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get the latest market data for a symbol
     */
    @GetMapping("/data/latest/{symbolId}")
    public ResponseEntity<MarketData> getLatestMarketData(@PathVariable String symbolId) {
        Optional<MarketData> marketData = marketDataService.getLatestMarketData(symbolId);
        return marketData.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get historical market data for a symbol
     */
    @GetMapping("/data/historical/{symbolId}")
    public ResponseEntity<List<MarketData>> getHistoricalMarketData(
            @PathVariable String symbolId,
            @RequestParam(defaultValue = "100") int limit) {
        
        List<MarketData> marketData = marketDataService.getHistoricalMarketData(symbolId, limit);
        return ResponseEntity.ok(marketData);
    }
    
    /**
     * Fetch and save the latest market data for a symbol
     */
    @GetMapping("/data/fetch/{symbolCode}")
    public ResponseEntity<?> fetchAndSaveLatestMarketData(@PathVariable String symbolCode) {
        try {
            MarketData marketData = marketDataService.fetchAndSaveLatestMarketData(symbolCode);
            return ResponseEntity.ok(marketData);
        } catch (Exception e) {
            logger.error("Error fetching market data: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Fetch and save historical market data for a symbol
     */
    @GetMapping("/data/fetch-historical/{symbolCode}")
    public ResponseEntity<?> fetchAndSaveHistoricalMarketData(
            @PathVariable String symbolCode,
            @RequestParam(defaultValue = "5m") String interval,
            @RequestParam(defaultValue = "1d") String range) {
        
        try {
            List<MarketData> marketData = marketDataService.fetchAndSaveHistoricalMarketData(symbolCode, interval, range);
            
            Map<String, Object> response = new HashMap<>();
            response.put("count", marketData.size());
            response.put("data", marketData.stream()
                    .limit(10) // Limit for response size
                    .collect(Collectors.toList()));
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error fetching historical market data: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get the top gainers in the market
     */
    @GetMapping("/top-gainers")
    public ResponseEntity<?> getTopGainers() {
        try {
            List<Map<String, Object>> topGainers = marketDataService.getTopGainers();
            return ResponseEntity.ok(topGainers);
        } catch (Exception e) {
            logger.error("Error fetching top gainers: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get the top losers in the market
     */
    @GetMapping("/top-losers")
    public ResponseEntity<?> getTopLosers() {
        try {
            List<Map<String, Object>> topLosers = marketDataService.getTopLosers();
            return ResponseEntity.ok(topLosers);
        } catch (Exception e) {
            logger.error("Error fetching top losers: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get market indices (NSE, BSE, etc.)
     */
    @GetMapping("/indices")
    public ResponseEntity<?> getMarketIndices() {
        try {
            List<Map<String, Object>> marketIndices = marketDataService.getMarketIndices();
            return ResponseEntity.ok(marketIndices);
        } catch (Exception e) {
            logger.error("Error fetching market indices: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Initialize default symbols
     */
    @GetMapping("/init-default-symbols")
    public ResponseEntity<String> initializeDefaultSymbols() {
        try {
            symbolService.initializeDefaultSymbols();
            return ResponseEntity.ok("Default symbols initialized successfully");
        } catch (Exception e) {
            logger.error("Error initializing default symbols: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error initializing default symbols: " + e.getMessage());
        }
    }
}