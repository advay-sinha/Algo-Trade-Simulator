package com.trading.app.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "trades")
public class Trade {
    @Id
    private String id;
    
    private String simulationId;
    
    private LocalDateTime timestamp;
    
    private String type; // BUY, SELL
    
    private double price;
    
    private int quantity;
    
    private double amount;
    
    private double profitLoss;
    
    private double profitLossPercentage;
    
    private String status; // EXECUTED, CANCELLED, PENDING
    
    private String reason; // The trading signal/reason that triggered this trade
}