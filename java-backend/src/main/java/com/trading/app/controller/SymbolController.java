package com.trading.app.controller;

import com.trading.app.model.Symbol;
import com.trading.app.service.SymbolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/symbols")
public class SymbolController {

    @Autowired
    private SymbolService symbolService;
    
    /**
     * Get all symbols
     */
    @GetMapping("")
    public ResponseEntity<List<Symbol>> getAllSymbols() {
        return ResponseEntity.ok(symbolService.getAllSymbols());
    }
    
    /**
     * Get a symbol by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getSymbolById(@PathVariable String id) {
        Optional<Symbol> symbolOpt = symbolService.getSymbolById(id);
        return symbolOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get a symbol by code
     */
    @GetMapping("/code/{code}")
    public ResponseEntity<?> getSymbolByCode(@PathVariable String code) {
        Optional<Symbol> symbolOpt = symbolService.getSymbolByCode(code);
        return symbolOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Search symbols
     */
    @GetMapping("/search")
    public ResponseEntity<List<Symbol>> searchSymbols(@RequestParam String query) {
        return ResponseEntity.ok(symbolService.searchSymbols(query));
    }
    
    /**
     * Get symbols by exchange
     */
    @GetMapping("/exchange/{exchange}")
    public ResponseEntity<List<Symbol>> getSymbolsByExchange(@PathVariable String exchange) {
        return ResponseEntity.ok(symbolService.getSymbolsByExchange(exchange));
    }
    
    /**
     * Get symbols by type
     */
    @GetMapping("/type/{type}")
    public ResponseEntity<List<Symbol>> getSymbolsByType(@PathVariable String type) {
        return ResponseEntity.ok(symbolService.getSymbolsByType(type));
    }
    
    /**
     * Create a new symbol
     */
    @PostMapping("")
    public ResponseEntity<Symbol> createSymbol(@RequestBody Symbol symbol) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(symbolService.saveSymbol(symbol));
    }
    
    /**
     * Update a symbol
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateSymbol(
            @PathVariable String id,
            @RequestBody Symbol symbolUpdates) {
        Optional<Symbol> symbolOpt = symbolService.getSymbolById(id);
        
        if (symbolOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Symbol symbol = symbolOpt.get();
        
        // Update fields
        if (symbolUpdates.getName() != null) {
            symbol.setName(symbolUpdates.getName());
        }
        if (symbolUpdates.getExchange() != null) {
            symbol.setExchange(symbolUpdates.getExchange());
        }
        if (symbolUpdates.getType() != null) {
            symbol.setType(symbolUpdates.getType());
        }
        if (symbolUpdates.getDescription() != null) {
            symbol.setDescription(symbolUpdates.getDescription());
        }
        if (symbolUpdates.getSector() != null) {
            symbol.setSector(symbolUpdates.getSector());
        }
        if (symbolUpdates.getIndustry() != null) {
            symbol.setIndustry(symbolUpdates.getIndustry());
        }
        
        return ResponseEntity.ok(symbolService.saveSymbol(symbol));
    }
    
    /**
     * Delete a symbol
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSymbol(@PathVariable String id) {
        Optional<Symbol> symbolOpt = symbolService.getSymbolById(id);
        
        if (symbolOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        symbolService.deleteSymbol(id);
        return ResponseEntity.noContent().build();
    }
    
    /**
     * Search for symbols in external APIs and save to database
     */
    @PostMapping("/search-external")
    public ResponseEntity<?> searchAndSaveSymbols(@RequestParam String query) {
        try {
            List<Symbol> savedSymbols = symbolService.searchAndSaveSymbols(query);
            return ResponseEntity.ok(savedSymbols);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Initialize default symbols
     */
    @PostMapping("/initialize-defaults")
    public ResponseEntity<?> initializeDefaultSymbols() {
        symbolService.initializeDefaultSymbols();
        return ResponseEntity.ok().body(Map.of("message", "Default symbols initialized"));
    }
}