package com.trading.app.repository;

import com.trading.app.model.Trade;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface TradeRepository extends MongoRepository<Trade, String> {
    List<Trade> findBySimulationId(String simulationId);
    
    @Query("{'simulationId': ?0}")
    List<Trade> findLatestBySimulationId(String simulationId, Pageable pageable);
    
    List<Trade> findBySimulationIdAndType(String simulationId, String type);
    
    List<Trade> findBySimulationIdAndTimestampBetween(
            String simulationId,
            LocalDateTime startTime,
            LocalDateTime endTime
    );
    
    @Query(value = "{'simulationId': {$in: ?0}}")
    List<Trade> findBySimulationIds(List<String> simulationIds, Pageable pageable);
    
    long countBySimulationId(String simulationId);
    
    long countBySimulationIdAndType(String simulationId, String type);
}