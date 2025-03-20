package com.trading.app.service;

import com.google.gson.JsonObject;
import com.trading.app.model.Symbol;
import com.trading.app.repository.SymbolRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class SymbolService {

    @Autowired
    private SymbolRepository symbolRepository;
    
    @Autowired
    private YahooFinanceService yahooFinanceService;
    
    @Autowired
    private AlphaVantageService alphaVantageService;
    
    /**
     * Get all symbols
     */
    public List<Symbol> getAllSymbols() {
        return symbolRepository.findAll();
    }
    
    /**
     * Get symbol by ID
     */
    public Optional<Symbol> getSymbolById(String id) {
        return symbolRepository.findById(id);
    }
    
    /**
     * Get symbol by symbol code
     */
    public Optional<Symbol> getSymbolByCode(String symbolCode) {
        return symbolRepository.findBySymbol(symbolCode);
    }
    
    /**
     * Search for symbols by keyword in name or symbol
     */
    public List<Symbol> searchSymbols(String keyword) {
        List<Symbol> bySymbol = symbolRepository.findBySymbolContainingIgnoreCase(keyword);
        List<Symbol> byName = symbolRepository.findByNameContainingIgnoreCase(keyword);
        
        // Combine results and remove duplicates
        List<Symbol> combined = new ArrayList<>(bySymbol);
        for (Symbol symbol : byName) {
            if (!combined.contains(symbol)) {
                combined.add(symbol);
            }
        }
        
        return combined;
    }
    
    /**
     * Get symbols by exchange
     */
    public List<Symbol> getSymbolsByExchange(String exchange) {
        return symbolRepository.findByExchange(exchange);
    }
    
    /**
     * Get symbols by type
     */
    public List<Symbol> getSymbolsByType(String type) {
        return symbolRepository.findByType(type);
    }
    
    /**
     * Save a symbol
     */
    public Symbol saveSymbol(Symbol symbol) {
        return symbolRepository.save(symbol);
    }
    
    /**
     * Delete a symbol
     */
    public void deleteSymbol(String id) {
        symbolRepository.deleteById(id);
    }
    
    /**
     * Search for symbols in external APIs and save to database
     */
    public List<Symbol> searchAndSaveSymbols(String query) throws IOException {
        List<Symbol> savedSymbols = new ArrayList<>();
        
        try {
            // Try Yahoo Finance first
            List<JsonObject> yahooResults = yahooFinanceService.searchSymbols(query);
            
            for (JsonObject result : yahooResults) {
                String symbolCode = result.get("symbol").getAsString();
                
                // Skip if symbol already exists
                if (symbolRepository.findBySymbol(symbolCode).isPresent()) {
                    continue;
                }
                
                // Extract data
                String name = result.get("longname").getAsString();
                String type = result.get("quoteType").getAsString();
                String exchange = result.get("exchange").getAsString();
                
                // Create symbol
                Symbol symbol = new Symbol();
                symbol.setSymbol(symbolCode);
                symbol.setName(name);
                symbol.setType(type);
                symbol.setExchange(exchange);
                
                // Save symbol
                Symbol savedSymbol = symbolRepository.save(symbol);
                savedSymbols.add(savedSymbol);
            }
        } catch (Exception e) {
            // Fallback to Alpha Vantage
            List<JsonObject> alphaResults = alphaVantageService.searchSymbols(query);
            
            for (JsonObject result : alphaResults) {
                String symbolCode = result.get("1. symbol").getAsString();
                
                // Skip if symbol already exists
                if (symbolRepository.findBySymbol(symbolCode).isPresent()) {
                    continue;
                }
                
                // Extract data
                String name = result.get("2. name").getAsString();
                String type = result.get("3. type").getAsString();
                String exchange = result.get("4. region").getAsString();
                
                // Create symbol
                Symbol symbol = new Symbol();
                symbol.setSymbol(symbolCode);
                symbol.setName(name);
                symbol.setType(type);
                symbol.setExchange(exchange);
                
                // Save symbol
                Symbol savedSymbol = symbolRepository.save(symbol);
                savedSymbols.add(savedSymbol);
            }
        }
        
        return savedSymbols;
    }
    
    /**
     * Initialize default Indian market symbols
     */
    public void initializeDefaultSymbols() {
        // Check if any symbols exist already
        if (symbolRepository.count() > 0) {
            return;
        }
        
        // List of popular Indian stocks
        String[] indianStocks = {
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", 
            "HINDUNILVR", "SBIN", "BAJFINANCE", "BHARTIARTL", "KOTAKBANK",
            "LT", "ITC", "AXISBANK", "ASIANPAINT", "MARUTI",
            "WIPRO", "HCLTECH", "SUNPHARMA", "TATAMOTORS", "ULTRACEMCO"
        };
        
        // Create and save default symbols
        for (String stock : indianStocks) {
            try {
                // Try to search and add this stock
                searchAndSaveSymbols(stock);
            } catch (Exception e) {
                // Create a basic entry if search fails
                Symbol symbol = new Symbol();
                symbol.setSymbol(stock);
                symbol.setName(stock);
                symbol.setExchange("NSE");
                symbol.setType("Equity");
                symbolRepository.save(symbol);
            }
        }
    }
}