package com.trading.app.service;

import com.trading.app.model.Symbol;
import com.trading.app.repository.SymbolRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class SymbolService {
    
    private static final Logger logger = LoggerFactory.getLogger(SymbolService.class);
    
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
     * Get a symbol by ID
     */
    public Optional<Symbol> getSymbolById(String id) {
        return symbolRepository.findById(id);
    }
    
    /**
     * Get a symbol by code
     */
    public Optional<Symbol> getSymbolByCode(String code) {
        return symbolRepository.findByCode(code);
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
     * Search for symbols
     */
    public List<Symbol> searchSymbols(String query) {
        return symbolRepository.search(query);
    }
    
    /**
     * Search for symbols in Yahoo Finance and save to database
     */
    public List<Symbol> searchAndSaveSymbols(String query) throws Exception {
        List<Symbol> savedSymbols = new ArrayList<>();
        
        // First try with Yahoo Finance
        try {
            List<Map<String, Object>> searchResults = yahooFinanceService.searchSymbols(query);
            
            for (Map<String, Object> result : searchResults) {
                // Check if the symbol already exists
                String code = result.get("symbol").toString();
                Optional<Symbol> existingSymbol = symbolRepository.findByCode(code);
                
                if (existingSymbol.isEmpty()) {
                    Symbol symbol = yahooFinanceService.convertToSymbol(result);
                    savedSymbols.add(symbolRepository.save(symbol));
                } else {
                    savedSymbols.add(existingSymbol.get());
                }
            }
            
            return savedSymbols;
        } catch (Exception e) {
            logger.error("Error searching symbols in Yahoo Finance: {}", e.getMessage());
            
            // Fallback to Alpha Vantage
            try {
                List<Map<String, Object>> searchResults = alphaVantageService.searchSymbols(query);
                
                for (Map<String, Object> result : searchResults) {
                    // Check if the symbol already exists
                    String code = result.get("1. symbol").toString();
                    Optional<Symbol> existingSymbol = symbolRepository.findByCode(code);
                    
                    if (existingSymbol.isEmpty()) {
                        Symbol symbol = alphaVantageService.convertToSymbol(result);
                        savedSymbols.add(symbolRepository.save(symbol));
                    } else {
                        savedSymbols.add(existingSymbol.get());
                    }
                }
                
                return savedSymbols;
            } catch (Exception avError) {
                logger.error("Error searching symbols in Alpha Vantage: {}", avError.getMessage());
                throw new Exception("Failed to search symbols in both Yahoo Finance and Alpha Vantage");
            }
        }
    }
    
    /**
     * Initialize default symbols for Indian market
     */
    public void initializeDefaultSymbols() {
        List<Symbol> defaultSymbols = new ArrayList<>();
        
        // Add major Indian stocks (NSE)
        defaultSymbols.add(new Symbol("RELIANCE.NS", "Reliance Industries Limited", "NSE", "Equity", 
                "Reliance Industries Limited operates as an integrated oil and gas company", "Energy", "Oil & Gas"));
        
        defaultSymbols.add(new Symbol("TCS.NS", "Tata Consultancy Services Limited", "NSE", "Equity", 
                "Tata Consultancy Services Limited is an Indian multinational information technology services and consulting company", "Technology", "IT Services"));
        
        defaultSymbols.add(new Symbol("INFY.NS", "Infosys Limited", "NSE", "Equity", 
                "Infosys Limited is an Indian multinational information technology company", "Technology", "IT Services"));
        
        defaultSymbols.add(new Symbol("HDFCBANK.NS", "HDFC Bank Limited", "NSE", "Equity", 
                "HDFC Bank Limited is an Indian banking and financial services company", "Financial Services", "Banking"));
        
        defaultSymbols.add(new Symbol("ICICIBANK.NS", "ICICI Bank Limited", "NSE", "Equity", 
                "ICICI Bank Limited is an Indian multinational banking and financial services company", "Financial Services", "Banking"));
        
        defaultSymbols.add(new Symbol("HINDUNILVR.NS", "Hindustan Unilever Limited", "NSE", "Equity", 
                "Hindustan Unilever Limited is an Indian consumer goods company", "Consumer Goods", "FMCG"));
        
        defaultSymbols.add(new Symbol("TATAMOTORS.NS", "Tata Motors Limited", "NSE", "Equity", 
                "Tata Motors Limited is an Indian multinational automotive manufacturing company", "Automotive", "Car Manufacturing"));
        
        defaultSymbols.add(new Symbol("BHARTIARTL.NS", "Bharti Airtel Limited", "NSE", "Equity", 
                "Bharti Airtel Limited is an Indian multinational telecommunications services company", "Telecommunications", "Telecom Services"));
        
        defaultSymbols.add(new Symbol("BAJFINANCE.NS", "Bajaj Finance Limited", "NSE", "Equity", 
                "Bajaj Finance Limited is an Indian non-banking financial company", "Financial Services", "NBFC"));
        
        defaultSymbols.add(new Symbol("SUNPHARMA.NS", "Sun Pharmaceutical Industries Limited", "NSE", "Equity", 
                "Sun Pharmaceutical Industries Limited is an Indian multinational pharmaceutical company", "Healthcare", "Pharmaceuticals"));
        
        // Add indices
        defaultSymbols.add(new Symbol("^NSEI", "NIFTY 50", "NSE", "Index", 
                "The NIFTY 50 is the flagship index on the National Stock Exchange of India", "Index", "Broad Market"));
        
        defaultSymbols.add(new Symbol("^BSESN", "S&P BSE SENSEX", "BSE", "Index", 
                "The S&P BSE SENSEX is a free-float market-weighted stock market index of 30 companies listed on the Bombay Stock Exchange", "Index", "Broad Market"));
        
        // Save all default symbols
        for (Symbol symbol : defaultSymbols) {
            try {
                Optional<Symbol> existingSymbol = symbolRepository.findByCode(symbol.getCode());
                if (existingSymbol.isEmpty()) {
                    symbolRepository.save(symbol);
                }
            } catch (Exception e) {
                logger.error("Error saving default symbol {}: {}", symbol.getCode(), e.getMessage());
            }
        }
    }
}