package com.trading.app.repository;

import com.trading.app.model.Simulation;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface SimulationRepository extends MongoRepository<Simulation, String> {
    List<Simulation> findByUserId(String userId);
    
    List<Simulation> findByUserIdAndStatus(String userId, String status);
    
    List<Simulation> findByUserIdAndSymbolId(String userId, String symbolId);
    
    List<Simulation> findByUserIdAndStrategyId(String userId, String strategyId);
    
    long countByUserIdAndStatus(String userId, String status);
}