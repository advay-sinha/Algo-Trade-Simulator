package com.trading.app.controller;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import com.trading.app.service.MarketDataService;
import com.trading.app.service.SymbolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/market")
public class MarketDataController {

    @Autowired
    private MarketDataService marketDataService;
    
    @Autowired
    private SymbolService symbolService;
    
    /**
     * Get the latest market data for a symbol
     */
    @GetMapping("/data/latest/{symbolCode}")
    public ResponseEntity<?> getLatestMarketData(@PathVariable String symbolCode) {
        try {
            Optional<Symbol> symbolOpt = symbolService.getSymbolByCode(symbolCode);
            
            if (symbolOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            Symbol symbol = symbolOpt.get();
            Optional<MarketData> marketDataOpt = marketDataService.getLatestMarketData(symbol.getId());
            
            if (marketDataOpt.isEmpty()) {
                // Fetch data from external API if not found in database
                MarketData newData = marketDataService.fetchAndSaveLatestMarketData(symbolCode);
                return ResponseEntity.ok(newData);
            }
            
            return ResponseEntity.ok(marketDataOpt.get());
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get historical market data for a symbol
     */
    @GetMapping("/data/historical/{symbolCode}")
    public ResponseEntity<?> getHistoricalMarketData(
            @PathVariable String symbolCode,
            @RequestParam(defaultValue = "100") int limit) {
        try {
            Optional<Symbol> symbolOpt = symbolService.getSymbolByCode(symbolCode);
            
            if (symbolOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            Symbol symbol = symbolOpt.get();
            List<MarketData> marketData = marketDataService.getHistoricalMarketData(symbol.getId(), limit);
            
            if (marketData.isEmpty()) {
                // Fetch data from external API if not found in database
                List<MarketData> newData = marketDataService.fetchAndSaveHistoricalMarketData(
                        symbolCode, "1d", "1mo");
                return ResponseEntity.ok(newData);
            }
            
            return ResponseEntity.ok(marketData);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get market data for a specific time range
     */
    @GetMapping("/data/range/{symbolCode}")
    public ResponseEntity<?> getMarketDataForTimeRange(
            @PathVariable String symbolCode,
            @RequestParam String startDate,
            @RequestParam String endDate) {
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;
            LocalDateTime startTime = LocalDateTime.parse(startDate, formatter);
            LocalDateTime endTime = LocalDateTime.parse(endDate, formatter);
            
            Optional<Symbol> symbolOpt = symbolService.getSymbolByCode(symbolCode);
            
            if (symbolOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            Symbol symbol = symbolOpt.get();
            List<MarketData> marketData = marketDataService.getMarketDataForTimeRange(
                    symbol.getId(), startTime, endTime);
            
            return ResponseEntity.ok(marketData);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Fetch and save the latest market data for a symbol
     */
    @PostMapping("/data/fetch/latest/{symbolCode}")
    public ResponseEntity<?> fetchLatestMarketData(@PathVariable String symbolCode) {
        try {
            MarketData marketData = marketDataService.fetchAndSaveLatestMarketData(symbolCode);
            return ResponseEntity.ok(marketData);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Fetch and save historical market data for a symbol
     */
    @PostMapping("/data/fetch/historical/{symbolCode}")
    public ResponseEntity<?> fetchHistoricalMarketData(
            @PathVariable String symbolCode,
            @RequestParam(defaultValue = "1d") String interval,
            @RequestParam(defaultValue = "1mo") String range) {
        try {
            List<MarketData> marketData = marketDataService.fetchAndSaveHistoricalMarketData(
                    symbolCode, interval, range);
            return ResponseEntity.ok(marketData);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}