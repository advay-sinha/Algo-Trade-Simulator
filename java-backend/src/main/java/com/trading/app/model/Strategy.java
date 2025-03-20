package com.trading.app.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "strategies")
public class Strategy {
    @Id
    private String id;
    
    private String name;
    
    private String description;
    
    private String timeFrame;
    
    private String successRate;
    
    private String bestMarketCondition;
    
    private String riskRating;
    
    private LocalDateTime createdAt = LocalDateTime.now();
    
    private StrategyParameters parameters;
    
    @Data
    public static class StrategyParameters {
        private int fastPeriod;
        private int slowPeriod;
        private int signalPeriod;
        private double buyThreshold;
        private double sellThreshold;
        private double stopLoss;
    }
}