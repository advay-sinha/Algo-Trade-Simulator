package com.trading.app.controller;

import com.trading.app.model.Strategy;
import com.trading.app.service.StrategyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/strategies")
public class StrategyController {

    @Autowired
    private StrategyService strategyService;
    
    /**
     * Get all strategies
     */
    @GetMapping("")
    public ResponseEntity<List<Strategy>> getAllStrategies() {
        return ResponseEntity.ok(strategyService.getAllStrategies());
    }
    
    /**
     * Get a strategy by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getStrategyById(@PathVariable String id) {
        Optional<Strategy> strategyOpt = strategyService.getStrategyById(id);
        return strategyOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get a strategy by name
     */
    @GetMapping("/name/{name}")
    public ResponseEntity<?> getStrategyByName(@PathVariable String name) {
        Optional<Strategy> strategyOpt = strategyService.getStrategyByName(name);
        return strategyOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get strategies by time frame
     */
    @GetMapping("/timeframe/{timeFrame}")
    public ResponseEntity<List<Strategy>> getStrategiesByTimeFrame(@PathVariable String timeFrame) {
        return ResponseEntity.ok(strategyService.getStrategiesByTimeFrame(timeFrame));
    }
    
    /**
     * Get strategies by risk rating
     */
    @GetMapping("/risk/{riskRating}")
    public ResponseEntity<List<Strategy>> getStrategiesByRiskRating(@PathVariable String riskRating) {
        return ResponseEntity.ok(strategyService.getStrategiesByRiskRating(riskRating));
    }
    
    /**
     * Create a new strategy
     */
    @PostMapping("")
    public ResponseEntity<Strategy> createStrategy(@RequestBody Strategy strategy) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(strategyService.saveStrategy(strategy));
    }
    
    /**
     * Update a strategy
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateStrategy(
            @PathVariable String id,
            @RequestBody Strategy strategyUpdates) {
        Optional<Strategy> strategyOpt = strategyService.getStrategyById(id);
        
        if (strategyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        Strategy strategy = strategyOpt.get();
        
        // Update fields
        if (strategyUpdates.getName() != null) {
            strategy.setName(strategyUpdates.getName());
        }
        if (strategyUpdates.getDescription() != null) {
            strategy.setDescription(strategyUpdates.getDescription());
        }
        if (strategyUpdates.getTimeFrame() != null) {
            strategy.setTimeFrame(strategyUpdates.getTimeFrame());
        }
        if (strategyUpdates.getSuccessRate() != null) {
            strategy.setSuccessRate(strategyUpdates.getSuccessRate());
        }
        if (strategyUpdates.getBestMarketCondition() != null) {
            strategy.setBestMarketCondition(strategyUpdates.getBestMarketCondition());
        }
        if (strategyUpdates.getRiskRating() != null) {
            strategy.setRiskRating(strategyUpdates.getRiskRating());
        }
        if (strategyUpdates.getParameters() != null) {
            strategy.setParameters(strategyUpdates.getParameters());
        }
        
        return ResponseEntity.ok(strategyService.saveStrategy(strategy));
    }
    
    /**
     * Delete a strategy
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteStrategy(@PathVariable String id) {
        Optional<Strategy> strategyOpt = strategyService.getStrategyById(id);
        
        if (strategyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        strategyService.deleteStrategy(id);
        return ResponseEntity.noContent().build();
    }
    
    /**
     * Initialize default strategies
     */
    @PostMapping("/initialize-defaults")
    public ResponseEntity<?> initializeDefaultStrategies() {
        strategyService.initializeDefaultStrategies();
        Map<String, String> response = new HashMap<>();
        response.put("message", "Default strategies initialized");
        return ResponseEntity.ok(response);
    }
}