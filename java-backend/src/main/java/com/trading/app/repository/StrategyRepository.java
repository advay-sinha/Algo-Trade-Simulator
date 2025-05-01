package com.trading.app.repository;

import com.trading.app.model.Strategy;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StrategyRepository extends MongoRepository<Strategy, String> {
    
    /**
     * Find a strategy by its name
     */
    Optional<Strategy> findByName(String name);
    
    /**
     * Find strategies by time frame
     */
    List<Strategy> findByTimeFrame(String timeFrame);
    
    /**
     * Find strategies by risk rating
     */
    List<Strategy> findByRiskRating(String riskRating);
    
    /**
     * Find strategies by best market condition
     */
    List<Strategy> findByBestMarketCondition(String bestMarketCondition);
    
    /**
     * Search for strategies by name or description
     */
    @Query("{ $or: [ { 'name': { $regex: ?0, $options: 'i' } }, { 'description': { $regex: ?0, $options: 'i' } } ] }")
    List<Strategy> search(String query);
}