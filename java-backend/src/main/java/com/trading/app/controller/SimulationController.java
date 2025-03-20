package com.trading.app.controller;

import com.trading.app.model.Simulation;
import com.trading.app.model.Trade;
import com.trading.app.service.SimulationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/simulations")
public class SimulationController {

    @Autowired
    private SimulationService simulationService;
    
    /**
     * Get all simulations for a user
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<List<Simulation>> getSimulationsForUser(@PathVariable String userId) {
        return ResponseEntity.ok(simulationService.getSimulationsForUser(userId));
    }
    
    /**
     * Get active simulations for a user
     */
    @GetMapping("/user/{userId}/active")
    public ResponseEntity<List<Simulation>> getActiveSimulationsForUser(@PathVariable String userId) {
        return ResponseEntity.ok(simulationService.getActiveSimulationsForUser(userId));
    }
    
    /**
     * Get a simulation by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getSimulationById(@PathVariable String id) {
        Optional<Simulation> simulationOpt = simulationService.getSimulationById(id);
        return simulationOpt.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Create a new simulation
     */
    @PostMapping("")
    public ResponseEntity<Simulation> createSimulation(@RequestBody Simulation simulation) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(simulationService.createSimulation(simulation));
    }
    
    /**
     * Update a simulation
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateSimulation(
            @PathVariable String id,
            @RequestBody Simulation simulationUpdates) {
        Optional<Simulation> updatedSimulation = simulationService.updateSimulation(id, simulationUpdates);
        return updatedSimulation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Pause a simulation
     */
    @PostMapping("/{id}/pause")
    public ResponseEntity<?> pauseSimulation(@PathVariable String id) {
        Optional<Simulation> pausedSimulation = simulationService.pauseSimulation(id);
        return pausedSimulation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Resume a simulation
     */
    @PostMapping("/{id}/resume")
    public ResponseEntity<?> resumeSimulation(@PathVariable String id) {
        Optional<Simulation> resumedSimulation = simulationService.resumeSimulation(id);
        return resumedSimulation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Stop a simulation
     */
    @PostMapping("/{id}/stop")
    public ResponseEntity<?> stopSimulation(@PathVariable String id) {
        Optional<Simulation> stoppedSimulation = simulationService.stopSimulation(id);
        return stoppedSimulation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Get trades for a simulation
     */
    @GetMapping("/{id}/trades")
    public ResponseEntity<List<Trade>> getTradesForSimulation(@PathVariable String id) {
        return ResponseEntity.ok(simulationService.getTradesForSimulation(id));
    }
    
    /**
     * Get recent trades for a simulation
     */
    @GetMapping("/{id}/trades/recent")
    public ResponseEntity<List<Trade>> getRecentTradesForSimulation(
            @PathVariable String id,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(simulationService.getRecentTradesForSimulation(id, limit));
    }
    
    /**
     * Get recent trades for a user
     */
    @GetMapping("/user/{userId}/trades/recent")
    public ResponseEntity<List<Trade>> getRecentTradesForUser(
            @PathVariable String userId,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(simulationService.getRecentTradesForUser(userId, limit));
    }
    
    /**
     * Execute a trade for a simulation
     */
    @PostMapping("/{id}/trades")
    public ResponseEntity<Trade> executeTrade(
            @PathVariable String id,
            @RequestBody Trade trade) {
        // Set the simulation ID
        trade.setSimulationId(id);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(simulationService.executeTrade(trade));
    }
    
    /**
     * Force a processing run for active simulations
     */
    @PostMapping("/process")
    public ResponseEntity<?> processActiveSimulations() {
        try {
            simulationService.processActiveSimulations();
            Map<String, String> response = new HashMap<>();
            response.put("message", "Active simulations processed successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}