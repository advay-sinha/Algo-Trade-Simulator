package com.trading.app.repository;

import com.trading.app.model.MarketData;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MarketDataRepository extends MongoRepository<MarketData, String> {
    List<MarketData> findBySymbolId(String symbolId);
    
    @Query("{ 'symbolId': ?0 }")
    List<MarketData> findLatestBySymbolId(String symbolId, Pageable pageable);
    
    Optional<MarketData> findTopBySymbolIdOrderByTimestampDesc(String symbolId);
    
    List<MarketData> findBySymbolIdAndTimestampBetween(
            String symbolId,
            LocalDateTime startTime,
            LocalDateTime endTime
    );
    
    long countBySymbolId(String symbolId);
}