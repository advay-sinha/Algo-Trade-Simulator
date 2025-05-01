package com.trading.app.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.LocalDateTime;

@Document(collection = "trades")
public class Trade {

    @Id
    private String id;
    
    @Indexed
    private String simulationId;
    
    @Indexed
    private LocalDateTime timestamp;
    
    private String type; // buy, sell
    private double price;
    private double quantity;
    private double amount;
    private double profitLoss;
    private double profitLossPercentage;
    private String status; // pending, executed, failed
    private String reason; // The reason for the trade decision
    
    public Trade() {
        this.timestamp = LocalDateTime.now();
        this.status = "pending";
    }
    
    public Trade(String simulationId, String type, double price, double quantity) {
        this.simulationId = simulationId;
        this.type = type;
        this.price = price;
        this.quantity = quantity;
        this.amount = price * quantity;
        this.timestamp = LocalDateTime.now();
        this.status = "pending";
        this.profitLoss = 0.0;
        this.profitLossPercentage = 0.0;
    }
    
    // Getters and setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getSimulationId() {
        return simulationId;
    }
    
    public void setSimulationId(String simulationId) {
        this.simulationId = simulationId;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public double getPrice() {
        return price;
    }
    
    public void setPrice(double price) {
        this.price = price;
        this.amount = this.price * this.quantity;
    }
    
    public double getQuantity() {
        return quantity;
    }
    
    public void setQuantity(double quantity) {
        this.quantity = quantity;
        this.amount = this.price * this.quantity;
    }
    
    public double getAmount() {
        return amount;
    }
    
    public void setAmount(double amount) {
        this.amount = amount;
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
    
    public String getReason() {
        return reason;
    }
    
    public void setReason(String reason) {
        this.reason = reason;
    }
    
    // Helper methods
    
    public void execute() {
        this.status = "executed";
    }
    
    public void fail() {
        this.status = "failed";
    }
    
    public boolean isPending() {
        return "pending".equals(this.status);
    }
    
    public boolean isExecuted() {
        return "executed".equals(this.status);
    }
    
    public boolean isFailed() {
        return "failed".equals(this.status);
    }
    
    public boolean isBuy() {
        return "buy".equals(this.type);
    }
    
    public boolean isSell() {
        return "sell".equals(this.type);
    }
    
    @Override
    public String toString() {
        return "Trade{" +
                "id='" + id + '\'' +
                ", simulationId='" + simulationId + '\'' +
                ", timestamp=" + timestamp +
                ", type='" + type + '\'' +
                ", price=" + price +
                ", quantity=" + quantity +
                ", amount=" + amount +
                ", profitLoss=" + profitLoss +
                ", profitLossPercentage=" + profitLossPercentage +
                ", status='" + status + '\'' +
                ", reason='" + reason + '\'' +
                '}';
    }
}