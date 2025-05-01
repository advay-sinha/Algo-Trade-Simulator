package com.trading.app.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;

@Document(collection = "simulations")
public class Simulation {

    @Id
    private String id;
    
    @Indexed
    private String userId;
    
    @Indexed
    private String symbolId;
    
    @Indexed
    private String strategyId;
    
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private double initialInvestment;
    private double currentBalance;
    private double profitLoss;
    private double profitLossPercentage;
    private String status; // active, paused, completed
    private Map<String, Object> parameters;
    private boolean reinvestProfits;
    private int totalTrades;
    private int successfulTrades;
    
    public Simulation() {
        this.parameters = new HashMap<>();
        this.startTime = LocalDateTime.now();
        this.status = "active";
        this.totalTrades = 0;
        this.successfulTrades = 0;
    }
    
    public Simulation(String userId, String symbolId, String strategyId, double initialInvestment, Map<String, Object> parameters, boolean reinvestProfits) {
        this.userId = userId;
        this.symbolId = symbolId;
        this.strategyId = strategyId;
        this.initialInvestment = initialInvestment;
        this.currentBalance = initialInvestment;
        this.profitLoss = 0.0;
        this.profitLossPercentage = 0.0;
        this.parameters = parameters != null ? parameters : new HashMap<>();
        this.reinvestProfits = reinvestProfits;
        this.startTime = LocalDateTime.now();
        this.status = "active";
        this.totalTrades = 0;
        this.successfulTrades = 0;
    }
    
    // Getters and setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getUserId() {
        return userId;
    }
    
    public void setUserId(String userId) {
        this.userId = userId;
    }
    
    public String getSymbolId() {
        return symbolId;
    }
    
    public void setSymbolId(String symbolId) {
        this.symbolId = symbolId;
    }
    
    public String getStrategyId() {
        return strategyId;
    }
    
    public void setStrategyId(String strategyId) {
        this.strategyId = strategyId;
    }
    
    public LocalDateTime getStartTime() {
        return startTime;
    }
    
    public void setStartTime(LocalDateTime startTime) {
        this.startTime = startTime;
    }
    
    public LocalDateTime getEndTime() {
        return endTime;
    }
    
    public void setEndTime(LocalDateTime endTime) {
        this.endTime = endTime;
    }
    
    public double getInitialInvestment() {
        return initialInvestment;
    }
    
    public void setInitialInvestment(double initialInvestment) {
        this.initialInvestment = initialInvestment;
    }
    
    public double getCurrentBalance() {
        return currentBalance;
    }
    
    public void setCurrentBalance(double currentBalance) {
        this.currentBalance = currentBalance;
        this.updateProfitLoss();
    }
    
    public double getProfitLoss() {
        return profitLoss;
    }
    
    public void setProfitLoss(double profitLoss) {
        this.profitLoss = profitLoss;
    }
    
    public double getProfitLossPercentage() {
        return profitLossPercentage;
    }
    
    public void setProfitLossPercentage(double profitLossPercentage) {
        this.profitLossPercentage = profitLossPercentage;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public Map<String, Object> getParameters() {
        return parameters;
    }
    
    public void setParameters(Map<String, Object> parameters) {
        this.parameters = parameters;
    }
    
    public boolean isReinvestProfits() {
        return reinvestProfits;
    }
    
    public void setReinvestProfits(boolean reinvestProfits) {
        this.reinvestProfits = reinvestProfits;
    }
    
    public int getTotalTrades() {
        return totalTrades;
    }
    
    public void setTotalTrades(int totalTrades) {
        this.totalTrades = totalTrades;
    }
    
    public int getSuccessfulTrades() {
        return successfulTrades;
    }
    
    public void setSuccessfulTrades(int successfulTrades) {
        this.successfulTrades = successfulTrades;
    }
    
    // Helper methods
    
    public void updateProfitLoss() {
        this.profitLoss = this.currentBalance - this.initialInvestment;
        this.profitLossPercentage = (this.profitLoss / this.initialInvestment) * 100;
    }
    
    public void incrementTotalTrades() {
        this.totalTrades++;
    }
    
    public void incrementSuccessfulTrades() {
        this.successfulTrades++;
    }
    
    public void pause() {
        this.status = "paused";
    }
    
    public void resume() {
        this.status = "active";
    }
    
    public void complete() {
        this.status = "completed";
        this.endTime = LocalDateTime.now();
    }
    
    public boolean isActive() {
        return "active".equals(this.status);
    }
    
    public boolean isPaused() {
        return "paused".equals(this.status);
    }
    
    public boolean isCompleted() {
        return "completed".equals(this.status);
    }
    
    public double getWinRate() {
        if (this.totalTrades == 0) {
            return 0.0;
        }
        return (double) this.successfulTrades / this.totalTrades * 100;
    }
    
    @Override
    public String toString() {
        return "Simulation{" +
                "id='" + id + '\'' +
                ", userId='" + userId + '\'' +
                ", symbolId='" + symbolId + '\'' +
                ", strategyId='" + strategyId + '\'' +
                ", startTime=" + startTime +
                ", endTime=" + endTime +
                ", initialInvestment=" + initialInvestment +
                ", currentBalance=" + currentBalance +
                ", profitLoss=" + profitLoss +
                ", profitLossPercentage=" + profitLossPercentage +
                ", status='" + status + '\'' +
                ", parameters=" + parameters +
                ", reinvestProfits=" + reinvestProfits +
                ", totalTrades=" + totalTrades +
                ", successfulTrades=" + successfulTrades +
                '}';
    }
}