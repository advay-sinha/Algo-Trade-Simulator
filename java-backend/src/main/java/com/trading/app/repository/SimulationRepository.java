package com.trading.app.repository;

import com.trading.app.model.Simulation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SimulationRepository extends MongoRepository<Simulation, String> {
    
    /**
     * Find all simulations for a user
     */
    List<Simulation> findByUserId(String userId);
    
    /**
     * Find active simulations for a user
     */
    List<Simulation> findByUserIdAndStatus(String userId, String status);
    
    /**
     * Find simulations by strategy
     */
    List<Simulation> findByStrategyId(String strategyId);
    
    /**
     * Find simulations by symbol
     */
    List<Simulation> findBySymbolId(String symbolId);
    
    /**
     * Find active simulations
     */
    List<Simulation> findByStatus(String status);
    
    /**
     * Find simulations by user and strategy
     */
    List<Simulation> findByUserIdAndStrategyId(String userId, String strategyId);
    
    /**
     * Find simulations by user and symbol
     */
    List<Simulation> findByUserIdAndSymbolId(String userId, String symbolId);
}