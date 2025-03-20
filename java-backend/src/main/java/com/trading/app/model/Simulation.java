package com.trading.app.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "simulations")
public class Simulation {
    @Id
    private String id;
    
    private String userId;
    
    private String symbolId;
    
    private String strategyId;
    
    private LocalDateTime startTime;
    
    private LocalDateTime endTime;
    
    private String status; // ACTIVE, PAUSED, COMPLETED, FAILED
    
    private double initialInvestment;
    
    private double currentValue;
    
    private double profitLoss;
    
    private double profitLossPercentage;
    
    private int totalTrades;
    
    private String timePeriod;
    
    private boolean reinvestProfits;
    
    // Strategy parameters specific to this simulation
    private Strategy.StrategyParameters parameters;
}