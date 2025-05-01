package com.trading.app.repository;

import com.trading.app.model.Trade;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TradeRepository extends MongoRepository<Trade, String> {
    
    /**
     * Find trades for a simulation
     */
    List<Trade> findBySimulationId(String simulationId);
    
    /**
     * Find recent trades for a simulation with limit
     */
    List<Trade> findBySimulationIdOrderByTimestampDesc(String simulationId, Pageable pageable);
    
    /**
     * Find trades for a specific time range
     */
    List<Trade> findBySimulationIdAndTimestampBetweenOrderByTimestampAsc(
            String simulationId, LocalDateTime startTime, LocalDateTime endTime);
    
    /**
     * Find trades by type (buy/sell)
     */
    List<Trade> findBySimulationIdAndType(String simulationId, String type);
    
    /**
     * Find trades by status
     */
    List<Trade> findBySimulationIdAndStatus(String simulationId, String status);
    
    /**
     * Find recent trades for a user across all simulations
     */
    @Query("{ 'simulationId': { $in: ?0 } }")
    List<Trade> findBySimulationIdsOrderByTimestampDesc(List<String> simulationIds, Pageable pageable);
}