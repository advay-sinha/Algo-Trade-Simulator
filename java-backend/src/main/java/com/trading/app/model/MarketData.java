package com.trading.app.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;

import java.time.LocalDateTime;

@Document(collection = "market_data")
@CompoundIndexes({
    @CompoundIndex(name = "symbolId_timestamp", def = "{'symbolId' : 1, 'timestamp': -1}")
})
public class MarketData {

    @Id
    private String id;
    
    @Indexed
    private String symbolId;
    
    @Indexed
    private LocalDateTime timestamp;
    
    private double open;
    private double high;
    private double low;
    private double close;
    private long volume;
    private String source;
    
    public MarketData() {
    }
    
    public MarketData(String symbolId, LocalDateTime timestamp, double open, double high, 
                     double low, double close, long volume, String source) {
        this.symbolId = symbolId;
        this.timestamp = timestamp;
        this.open = open;
        this.high = high;
        this.low = low;
        this.close = close;
        this.volume = volume;
        this.source = source;
    }
    
    // Getters and setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getSymbolId() {
        return symbolId;
    }
    
    public void setSymbolId(String symbolId) {
        this.symbolId = symbolId;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
    
    public double getOpen() {
        return open;
    }
    
    public void setOpen(double open) {
        this.open = open;
    }
    
    public double getHigh() {
        return high;
    }
    
    public void setHigh(double high) {
        this.high = high;
    }
    
    public double getLow() {
        return low;
    }
    
    public void setLow(double low) {
        this.low = low;
    }
    
    public double getClose() {
        return close;
    }
    
    public void setClose(double close) {
        this.close = close;
    }
    
    public long getVolume() {
        return volume;
    }
    
    public void setVolume(long volume) {
        this.volume = volume;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    @Override
    public String toString() {
        return "MarketData{" +
                "id='" + id + '\'' +
                ", symbolId='" + symbolId + '\'' +
                ", timestamp=" + timestamp +
                ", open=" + open +
                ", high=" + high +
                ", low=" + low +
                ", close=" + close +
                ", volume=" + volume +
                ", source='" + source + '\'' +
                '}';
    }
}