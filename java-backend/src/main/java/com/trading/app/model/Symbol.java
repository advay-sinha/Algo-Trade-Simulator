package com.trading.app.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

@Document(collection = "symbols")
public class Symbol {

    @Id
    private String id;
    
    @Indexed(unique = true)
    private String code;
    
    private String name;
    private String exchange;
    private String type;
    private String description;
    private String sector;
    private String industry;
    
    public Symbol() {
    }
    
    public Symbol(String code, String name, String exchange, String type, 
                 String description, String sector, String industry) {
        this.code = code;
        this.name = name;
        this.exchange = exchange;
        this.type = type;
        this.description = description;
        this.sector = sector;
        this.industry = industry;
    }
    
    // Getters and setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getCode() {
        return code;
    }
    
    public void setCode(String code) {
        this.code = code;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getExchange() {
        return exchange;
    }
    
    public void setExchange(String exchange) {
        this.exchange = exchange;
    }
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getSector() {
        return sector;
    }
    
    public void setSector(String sector) {
        this.sector = sector;
    }
    
    public String getIndustry() {
        return industry;
    }
    
    public void setIndustry(String industry) {
        this.industry = industry;
    }
    
    @Override
    public String toString() {
        return "Symbol{" +
                "id='" + id + '\'' +
                ", code='" + code + '\'' +
                ", name='" + name + '\'' +
                ", exchange='" + exchange + '\'' +
                ", type='" + type + '\'' +
                ", description='" + description + '\'' +
                ", sector='" + sector + '\'' +
                ", industry='" + industry + '\'' +
                '}';
    }
}