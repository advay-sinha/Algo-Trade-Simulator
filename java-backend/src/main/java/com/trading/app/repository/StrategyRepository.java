package com.trading.app.repository;

import com.trading.app.model.Strategy;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface StrategyRepository extends MongoRepository<Strategy, String> {
    Optional<Strategy> findByName(String name);
    
    List<Strategy> findByTimeFrame(String timeFrame);
    
    List<Strategy> findByRiskRating(String riskRating);
}