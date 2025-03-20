package com.trading.app.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "market_data")
public class MarketData {
    @Id
    private String id;
    
    private String symbolId;
    
    private LocalDateTime timestamp;
    
    private double open;
    
    private double high;
    
    private double low;
    
    private double close;
    
    private long volume;
    
    private String source;
    
    // For day's performance
    private double previousClose;
    
    private double change;
    
    private double changePercent;
}