package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AlphaVantageService {

    @Value("${alpha.vantage.api.key}")
    private String apiKey;
    
    @Value("${alpha.vantage.api.baseUrl}")
    private String baseUrl;
    
    private final RestTemplate restTemplate;
    
    public AlphaVantageService() {
        this.restTemplate = new RestTemplate();
    }
    
    /**
     * Search for symbols
     */
    public List<Map<String, Object>> searchSymbols(String keywords) {
        String url = baseUrl + "/query?function=SYMBOL_SEARCH&keywords=" + keywords + "&apikey=" + apiKey;
        
        Map<String, Object> response = restTemplate.getForObject(url, Map.class);
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (response != null && response.containsKey("bestMatches")) {
            result = (List<Map<String, Object>>) response.get("bestMatches");
        }
        
        return result;
    }
    
    /**
     * Get intraday data for a symbol
     */
    public Map<String, Object> getIntradayData(String symbol, String interval) {
        String url = baseUrl + "/query?function=TIME_SERIES_INTRADAY&symbol=" + symbol + 
                "&interval=" + interval + "&apikey=" + apiKey;
        
        return restTemplate.getForObject(url, Map.class);
    }
    
    /**
     * Get daily data for a symbol
     */
    public Map<String, Object> getDailyData(String symbol) {
        String url = baseUrl + "/query?function=TIME_SERIES_DAILY&symbol=" + symbol + 
                "&apikey=" + apiKey;
        
        return restTemplate.getForObject(url, Map.class);
    }
    
    /**
     * Get weekly data for a symbol
     */
    public Map<String, Object> getWeeklyData(String symbol) {
        String url = baseUrl + "/query?function=TIME_SERIES_WEEKLY&symbol=" + symbol + 
                "&apikey=" + apiKey;
        
        return restTemplate.getForObject(url, Map.class);
    }
    
    /**
     * Get monthly data for a symbol
     */
    public Map<String, Object> getMonthlyData(String symbol) {
        String url = baseUrl + "/query?function=TIME_SERIES_MONTHLY&symbol=" + symbol + 
                "&apikey=" + apiKey;
        
        return restTemplate.getForObject(url, Map.class);
    }
    
    /**
     * Get quote for a symbol
     */
    public Map<String, Object> getQuote(String symbol) {
        String url = baseUrl + "/query?function=GLOBAL_QUOTE&symbol=" + symbol + 
                "&apikey=" + apiKey;
        
        return restTemplate.getForObject(url, Map.class);
    }
    
    /**
     * Convert Alpha Vantage search result to Symbol object
     */
    public Symbol convertToSymbol(Map<String, Object> result) {
        Symbol symbol = new Symbol();
        
        if (result.containsKey("1. symbol")) {
            symbol.setCode(result.get("1. symbol").toString());
        }
        if (result.containsKey("2. name")) {
            symbol.setName(result.get("2. name").toString());
        }
        if (result.containsKey("4. region")) {
            symbol.setExchange(result.get("4. region").toString());
        }
        if (result.containsKey("3. type")) {
            symbol.setType(result.get("3. type").toString());
        }
        
        return symbol;
    }
    
    /**
     * Convert Alpha Vantage quote to MarketData object
     */
    public MarketData convertToMarketData(Map<String, Object> quote, String symbolId) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        marketData.setTimestamp(LocalDateTime.now());
        marketData.setSource("Alpha Vantage");
        
        Map<String, Object> globalQuote = (Map<String, Object>) quote.get("Global Quote");
        
        if (globalQuote != null) {
            if (globalQuote.containsKey("02. open")) {
                marketData.setOpen(Double.parseDouble(globalQuote.get("02. open").toString()));
            }
            if (globalQuote.containsKey("03. high")) {
                marketData.setHigh(Double.parseDouble(globalQuote.get("03. high").toString()));
            }
            if (globalQuote.containsKey("04. low")) {
                marketData.setLow(Double.parseDouble(globalQuote.get("04. low").toString()));
            }
            if (globalQuote.containsKey("05. price")) {
                marketData.setClose(Double.parseDouble(globalQuote.get("05. price").toString()));
            }
            if (globalQuote.containsKey("06. volume")) {
                marketData.setVolume(Long.parseLong(globalQuote.get("06. volume").toString()));
            }
        }
        
        return marketData;
    }
    
    /**
     * Convert Alpha Vantage intraday data to list of MarketData objects
     */
    public List<MarketData> convertIntradayDataToMarketData(Map<String, Object> data, String symbolId) {
        List<MarketData> marketDataList = new ArrayList<>();
        
        if (data == null) {
            return marketDataList;
        }
        
        String intervalKey = "Time Series (5min)"; // Default to 5min
        
        if (data.containsKey("Meta Data") && data.get("Meta Data") instanceof Map) {
            Map<String, Object> metaData = (Map<String, Object>) data.get("Meta Data");
            if (metaData.containsKey("4. Interval")) {
                String interval = metaData.get("4. Interval").toString();
                intervalKey = "Time Series (" + interval + ")";
            }
        }
        
        if (data.containsKey(intervalKey) && data.get(intervalKey) instanceof Map) {
            Map<String, Object> timeSeries = (Map<String, Object>) data.get(intervalKey);
            
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            
            for (Map.Entry<String, Object> entry : timeSeries.entrySet()) {
                String timeStr = entry.getKey();
                Map<String, Object> values = (Map<String, Object>) entry.getValue();
                
                MarketData marketData = new MarketData();
                marketData.setSymbolId(symbolId);
                marketData.setTimestamp(LocalDateTime.parse(timeStr, formatter));
                marketData.setSource("Alpha Vantage");
                
                if (values.containsKey("1. open")) {
                    marketData.setOpen(Double.parseDouble(values.get("1. open").toString()));
                }
                if (values.containsKey("2. high")) {
                    marketData.setHigh(Double.parseDouble(values.get("2. high").toString()));
                }
                if (values.containsKey("3. low")) {
                    marketData.setLow(Double.parseDouble(values.get("3. low").toString()));
                }
                if (values.containsKey("4. close")) {
                    marketData.setClose(Double.parseDouble(values.get("4. close").toString()));
                }
                if (values.containsKey("5. volume")) {
                    marketData.setVolume(Long.parseLong(values.get("5. volume").toString()));
                }
                
                marketDataList.add(marketData);
            }
        }
        
        return marketDataList;
    }
    
    /**
     * Convert Alpha Vantage daily data to list of MarketData objects
     */
    public List<MarketData> convertDailyDataToMarketData(Map<String, Object> data, String symbolId) {
        List<MarketData> marketDataList = new ArrayList<>();
        
        if (data == null) {
            return marketDataList;
        }
        
        if (data.containsKey("Time Series (Daily)") && data.get("Time Series (Daily)") instanceof Map) {
            Map<String, Object> timeSeries = (Map<String, Object>) data.get("Time Series (Daily)");
            
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            
            for (Map.Entry<String, Object> entry : timeSeries.entrySet()) {
                String dateStr = entry.getKey();
                Map<String, Object> values = (Map<String, Object>) entry.getValue();
                
                MarketData marketData = new MarketData();
                marketData.setSymbolId(symbolId);
                marketData.setTimestamp(LocalDateTime.parse(dateStr + " 00:00:00", 
                        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
                marketData.setSource("Alpha Vantage");
                
                if (values.containsKey("1. open")) {
                    marketData.setOpen(Double.parseDouble(values.get("1. open").toString()));
                }
                if (values.containsKey("2. high")) {
                    marketData.setHigh(Double.parseDouble(values.get("2. high").toString()));
                }
                if (values.containsKey("3. low")) {
                    marketData.setLow(Double.parseDouble(values.get("3. low").toString()));
                }
                if (values.containsKey("4. close")) {
                    marketData.setClose(Double.parseDouble(values.get("4. close").toString()));
                }
                if (values.containsKey("5. volume")) {
                    marketData.setVolume(Long.parseLong(values.get("5. volume").toString()));
                }
                
                marketDataList.add(marketData);
            }
        }
        
        return marketDataList;
    }
    
    /**
     * Test connection to the API
     */
    public Map<String, Object> testConnection() {
        try {
            // Try with a simple API call
            Map<String, Object> result = searchSymbols("INFY");
            return Map.of("success", true, "message", "Successfully connected to Alpha Vantage API", "responseSize", result.size());
        } catch (Exception e) {
            return Map.of("success", false, "message", "Failed to connect to Alpha Vantage API: " + e.getMessage());
        }
    }
}