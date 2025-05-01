package com.trading.app.controller;

import com.trading.app.model.Simulation;
import com.trading.app.model.Strategy;
import com.trading.app.model.Trade;
import com.trading.app.service.SimulationService;
import com.trading.app.service.StrategyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/simulation")
public class SimulationController {
    
    private static final Logger logger = LoggerFactory.getLogger(SimulationController.class);
    
    @Autowired
    private SimulationService simulationService;
    
    @Autowired
    private StrategyService strategyService;
    
    /**
     * Get all strategies
     */
    @GetMapping("/strategies")
    public ResponseEntity<List<Strategy>> getAllStrategies() {
        List<Strategy> strategies = strategyService.getAllStrategies();
        return ResponseEntity.ok(strategies);
    }
    
    /**
     * Get a strategy by ID
     */
    @GetMapping("/strategies/{id}")
    public ResponseEntity<Strategy> getStrategyById(@PathVariable String id) {
        Optional<Strategy> strategy = strategyService.getStrategyById(id);
        return strategy.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Initialize default strategies
     */
    @GetMapping("/init-default-strategies")
    public ResponseEntity<String> initializeDefaultStrategies() {
        try {
            strategyService.initializeDefaultStrategies();
            return ResponseEntity.ok("Default strategies initialized successfully");
        } catch (Exception e) {
            logger.error("Error initializing default strategies: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error initializing default strategies: " + e.getMessage());
        }
    }
    
    /**
     * Get all simulations for a user
     */
    @GetMapping("/simulations/{userId}")
    public ResponseEntity<List<Simulation>> getSimulationsForUser(@PathVariable String userId) {
        List<Simulation> simulations = simulationService.getSimulationsForUser(userId);
        return ResponseEntity.ok(simulations);
    }
    
    /**
     * Get active simulations for a user
     */
    @GetMapping("/simulations/active/{userId}")
    public ResponseEntity<List<Simulation>> getActiveSimulationsForUser(@PathVariable String userId) {
        List<Simulation> simulations = simulationService.getActiveSimulationsForUser(userId);
        return ResponseEntity.ok(simulations);
    }
    
    /**
     * Get a simulation by ID
     */
    @GetMapping("/simulations/detail/{id}")
    public ResponseEntity<Simulation> getSimulationById(@PathVariable String id) {
        Optional<Simulation> simulation = simulationService.getSimulationById(id);
        return simulation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Create a new simulation
     */
    @PostMapping("/simulations")
    public ResponseEntity<?> createSimulation(@RequestBody Simulation simulation) {
        try {
            Simulation createdSimulation = simulationService.createSimulation(simulation);
            return ResponseEntity.status(HttpStatus.CREATED).body(createdSimulation);
        } catch (Exception e) {
            logger.error("Error creating simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Update a simulation
     */
    @PutMapping("/simulations/{id}")
    public ResponseEntity<?> updateSimulation(
            @PathVariable String id,
            @RequestBody Simulation simulationUpdates) {
        
        try {
            Optional<Simulation> updatedSimulation = simulationService.updateSimulation(id, simulationUpdates);
            
            return updatedSimulation.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("Error updating simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Pause a simulation
     */
    @PutMapping("/simulations/{id}/pause")
    public ResponseEntity<?> pauseSimulation(@PathVariable String id) {
        try {
            Optional<Simulation> pausedSimulation = simulationService.pauseSimulation(id);
            
            return pausedSimulation.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("Error pausing simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Resume a simulation
     */
    @PutMapping("/simulations/{id}/resume")
    public ResponseEntity<?> resumeSimulation(@PathVariable String id) {
        try {
            Optional<Simulation> resumedSimulation = simulationService.resumeSimulation(id);
            
            return resumedSimulation.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("Error resuming simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Stop a simulation
     */
    @PutMapping("/simulations/{id}/stop")
    public ResponseEntity<?> stopSimulation(@PathVariable String id) {
        try {
            Optional<Simulation> stoppedSimulation = simulationService.stopSimulation(id);
            
            return stoppedSimulation.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("Error stopping simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Get trades for a simulation
     */
    @GetMapping("/trades/{simulationId}")
    public ResponseEntity<List<Trade>> getTradesForSimulation(@PathVariable String simulationId) {
        List<Trade> trades = simulationService.getTradesForSimulation(simulationId);
        return ResponseEntity.ok(trades);
    }
    
    /**
     * Get recent trades for a simulation
     */
    @GetMapping("/trades/recent/{simulationId}")
    public ResponseEntity<List<Trade>> getRecentTradesForSimulation(
            @PathVariable String simulationId,
            @RequestParam(defaultValue = "10") int limit) {
        
        List<Trade> trades = simulationService.getRecentTradesForSimulation(simulationId, limit);
        return ResponseEntity.ok(trades);
    }
    
    /**
     * Get recent trades for a user
     */
    @GetMapping("/trades/user/{userId}")
    public ResponseEntity<List<Trade>> getRecentTradesForUser(
            @PathVariable String userId,
            @RequestParam(defaultValue = "10") int limit) {
        
        List<Trade> trades = simulationService.getRecentTradesForUser(userId, limit);
        return ResponseEntity.ok(trades);
    }
    
    /**
     * Execute a manual trade for a simulation
     */
    @PostMapping("/trades")
    public ResponseEntity<?> executeTrade(@RequestBody Trade trade) {
        try {
            Trade executedTrade = simulationService.executeTrade(trade);
            return ResponseEntity.status(HttpStatus.CREATED).body(executedTrade);
        } catch (Exception e) {
            logger.error("Error executing trade: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
    
    /**
     * Process a simulation manually (trigger the strategy evaluation)
     */
    @PostMapping("/process/{id}")
    public ResponseEntity<?> processSimulation(@PathVariable String id) {
        try {
            Optional<Simulation> simulation = simulationService.getSimulationById(id);
            
            if (simulation.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            // This will trigger the simulation processing
            // The actual trade execution will happen asynchronously
            simulationService.processSimulation(simulation.get());
            
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            logger.error("Error processing simulation: {}", e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}