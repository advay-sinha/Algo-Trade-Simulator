package com.trading.app.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "symbols")
public class Symbol {
    @Id
    private String id;
    
    @Indexed(unique = true)
    private String symbol;
    
    private String name;
    
    private String exchange;
    
    private String type;
    
    private String description;
    
    private String sector;
    
    private String industry;
    
    private boolean active = true;
}