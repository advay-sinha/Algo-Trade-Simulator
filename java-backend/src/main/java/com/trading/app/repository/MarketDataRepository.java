package com.trading.app.repository;

import com.trading.app.model.MarketData;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface MarketDataRepository extends MongoRepository<MarketData, String> {
    
    /**
     * Find the latest market data for a symbol
     */
    Optional<MarketData> findTopBySymbolIdOrderByTimestampDesc(String symbolId);
    
    /**
     * Find historical market data for a symbol with limit
     */
    List<MarketData> findBySymbolIdOrderByTimestampDesc(String symbolId, Pageable pageable);
    
    /**
     * Find market data for a specific time range
     */
    List<MarketData> findBySymbolIdAndTimestampBetweenOrderByTimestampAsc(
            String symbolId, LocalDateTime startTime, LocalDateTime endTime);
    
    /**
     * Find market data by source
     */
    List<MarketData> findBySymbolIdAndSourceOrderByTimestampDesc(String symbolId, String source);
    
    /**
     * Delete all market data for a symbol
     */
    void deleteBySymbolId(String symbolId);
    
    /**
     * Delete old market data (older than a certain date)
     */
    void deleteByTimestampBefore(LocalDateTime olderThan);
}