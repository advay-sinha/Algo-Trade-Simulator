package com.trading.app.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.util.Map;
import java.util.HashMap;

@Document(collection = "strategies")
public class Strategy {

    @Id
    private String id;
    
    @Indexed(unique = true)
    private String name;
    
    private String description;
    private String timeFrame;
    private String successRate;
    private String bestMarketCondition;
    private String riskRating;
    private Map<String, Object> parameters;
    
    public Strategy() {
        this.parameters = new HashMap<>();
    }
    
    public Strategy(String name, String description, String timeFrame, String successRate,
                   String bestMarketCondition, String riskRating) {
        this.name = name;
        this.description = description;
        this.timeFrame = timeFrame;
        this.successRate = successRate;
        this.bestMarketCondition = bestMarketCondition;
        this.riskRating = riskRating;
        this.parameters = new HashMap<>();
    }
    
    // Getters and setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getTimeFrame() {
        return timeFrame;
    }
    
    public void setTimeFrame(String timeFrame) {
        this.timeFrame = timeFrame;
    }
    
    public String getSuccessRate() {
        return successRate;
    }
    
    public void setSuccessRate(String successRate) {
        this.successRate = successRate;
    }
    
    public String getBestMarketCondition() {
        return bestMarketCondition;
    }
    
    public void setBestMarketCondition(String bestMarketCondition) {
        this.bestMarketCondition = bestMarketCondition;
    }
    
    public String getRiskRating() {
        return riskRating;
    }
    
    public void setRiskRating(String riskRating) {
        this.riskRating = riskRating;
    }
    
    public Map<String, Object> getParameters() {
        return parameters;
    }
    
    public void setParameters(Map<String, Object> parameters) {
        this.parameters = parameters;
    }
    
    public void addParameter(String key, Object value) {
        this.parameters.put(key, value);
    }
    
    public Object getParameter(String key) {
        return this.parameters.get(key);
    }
    
    @Override
    public String toString() {
        return "Strategy{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", timeFrame='" + timeFrame + '\'' +
                ", successRate='" + successRate + '\'' +
                ", bestMarketCondition='" + bestMarketCondition + '\'' +
                ", riskRating='" + riskRating + '\'' +
                ", parameters=" + parameters +
                '}';
    }
}