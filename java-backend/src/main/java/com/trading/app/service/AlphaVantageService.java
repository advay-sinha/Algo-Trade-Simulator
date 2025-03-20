package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AlphaVantageService {
    
    private static final Logger logger = LoggerFactory.getLogger(AlphaVantageService.class);
    
    @Value("${api.alpha-vantage.key}")
    private String apiKey;
    
    @Value("${api.alpha-vantage.base-url}")
    private String baseUrl;
    
    @Autowired
    private RestTemplate restTemplate;
    
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    
    /**
     * Check if the Alpha Vantage API is working
     */
    public boolean isApiWorking() {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "TIME_SERIES_INTRADAY")
                    .queryParam("symbol", "RELIANCE.BSE")
                    .queryParam("interval", "5min")
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            return response.getStatusCode().is2xxSuccessful() && !response.getBody().containsKey("Error Message");
        } catch (Exception e) {
            logger.error("Error checking Alpha Vantage API: {}", e.getMessage());
            return false;
        }
    }
    
    /**
     * Search for symbols
     */
    public List<Map<String, Object>> searchSymbols(String query) throws Exception {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "SYMBOL_SEARCH")
                    .queryParam("keywords", query)
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to search symbols: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            
            if (data.containsKey("Error Message")) {
                throw new Exception("Alpha Vantage API error: " + data.get("Error Message"));
            }
            
            List<Map<String, Object>> matches = (List<Map<String, Object>>) data.get("bestMatches");
            
            if (matches == null) {
                return new ArrayList<>();
            }
            
            // Filter to get only Indian stocks
            List<Map<String, Object>> filteredMatches = new ArrayList<>();
            
            for (Map<String, Object> match : matches) {
                String region = (String) match.get("4. region");
                if ("India".equals(region)) {
                    filteredMatches.add(match);
                }
            }
            
            return filteredMatches;
        } catch (Exception e) {
            logger.error("Error searching symbols in Alpha Vantage: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get intraday data for a symbol
     */
    public List<Map<String, Object>> getIntradayData(String symbol, String interval) throws Exception {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "TIME_SERIES_INTRADAY")
                    .queryParam("symbol", symbol)
                    .queryParam("interval", interval)
                    .queryParam("outputsize", "compact")
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get intraday data: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            
            if (data.containsKey("Error Message")) {
                throw new Exception("Alpha Vantage API error: " + data.get("Error Message"));
            }
            
            String timeSeriesKey = "Time Series (" + interval + ")";
            Map<String, Map<String, String>> timeSeries = (Map<String, Map<String, String>>) data.get(timeSeriesKey);
            
            if (timeSeries == null) {
                throw new Exception("No intraday data found for symbol: " + symbol);
            }
            
            List<Map<String, Object>> intradayData = new ArrayList<>();
            
            for (Map.Entry<String, Map<String, String>> entry : timeSeries.entrySet()) {
                String timestamp = entry.getKey();
                Map<String, String> values = entry.getValue();
                
                Map<String, Object> dataPoint = new HashMap<>();
                dataPoint.put("timestamp", timestamp);
                dataPoint.put("open", Double.parseDouble(values.get("1. open")));
                dataPoint.put("high", Double.parseDouble(values.get("2. high")));
                dataPoint.put("low", Double.parseDouble(values.get("3. low")));
                dataPoint.put("close", Double.parseDouble(values.get("4. close")));
                dataPoint.put("volume", Double.parseDouble(values.get("5. volume")));
                
                intradayData.add(dataPoint);
            }
            
            return intradayData;
        } catch (Exception e) {
            logger.error("Error getting intraday data from Alpha Vantage: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get daily data for a symbol
     */
    public List<Map<String, Object>> getDailyData(String symbol) throws Exception {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "TIME_SERIES_DAILY")
                    .queryParam("symbol", symbol)
                    .queryParam("outputsize", "compact")
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get daily data: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            
            if (data.containsKey("Error Message")) {
                throw new Exception("Alpha Vantage API error: " + data.get("Error Message"));
            }
            
            Map<String, Map<String, String>> timeSeries = (Map<String, Map<String, String>>) data.get("Time Series (Daily)");
            
            if (timeSeries == null) {
                throw new Exception("No daily data found for symbol: " + symbol);
            }
            
            List<Map<String, Object>> dailyData = new ArrayList<>();
            
            for (Map.Entry<String, Map<String, String>> entry : timeSeries.entrySet()) {
                String timestamp = entry.getKey();
                Map<String, String> values = entry.getValue();
                
                Map<String, Object> dataPoint = new HashMap<>();
                dataPoint.put("timestamp", timestamp);
                dataPoint.put("open", Double.parseDouble(values.get("1. open")));
                dataPoint.put("high", Double.parseDouble(values.get("2. high")));
                dataPoint.put("low", Double.parseDouble(values.get("3. low")));
                dataPoint.put("close", Double.parseDouble(values.get("4. close")));
                dataPoint.put("volume", Double.parseDouble(values.get("5. volume")));
                
                dailyData.add(dataPoint);
            }
            
            return dailyData;
        } catch (Exception e) {
            logger.error("Error getting daily data from Alpha Vantage: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get company overview for a symbol
     */
    public Map<String, Object> getCompanyOverview(String symbol) throws Exception {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "OVERVIEW")
                    .queryParam("symbol", symbol)
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get company overview: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            
            if (data == null || data.isEmpty() || data.containsKey("Error Message")) {
                throw new Exception("No company overview found for symbol: " + symbol);
            }
            
            return data;
        } catch (Exception e) {
            logger.error("Error getting company overview from Alpha Vantage: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get quote for a symbol
     */
    public Map<String, Object> getQuote(String symbol) throws Exception {
        try {
            String url = baseUrl;
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("function", "GLOBAL_QUOTE")
                    .queryParam("symbol", symbol)
                    .queryParam("apikey", apiKey);
            
            ResponseEntity<Map> response = restTemplate.getForEntity(
                    builder.toUriString(),
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get quote: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            
            if (data.containsKey("Error Message")) {
                throw new Exception("Alpha Vantage API error: " + data.get("Error Message"));
            }
            
            Map<String, String> quote = (Map<String, String>) data.get("Global Quote");
            
            if (quote == null || quote.isEmpty()) {
                throw new Exception("No quote found for symbol: " + symbol);
            }
            
            // Convert the quote to a simpler format
            Map<String, Object> formattedQuote = new HashMap<>();
            formattedQuote.put("symbol", quote.get("01. symbol"));
            formattedQuote.put("open", Double.parseDouble(quote.get("02. open")));
            formattedQuote.put("high", Double.parseDouble(quote.get("03. high")));
            formattedQuote.put("low", Double.parseDouble(quote.get("04. low")));
            formattedQuote.put("price", Double.parseDouble(quote.get("05. price")));
            formattedQuote.put("volume", Double.parseDouble(quote.get("06. volume")));
            formattedQuote.put("date", quote.get("07. latest trading day"));
            formattedQuote.put("previous", Double.parseDouble(quote.get("08. previous close")));
            formattedQuote.put("change", Double.parseDouble(quote.get("09. change")));
            formattedQuote.put("changePercent", quote.get("10. change percent"));
            
            return formattedQuote;
        } catch (Exception e) {
            logger.error("Error getting quote from Alpha Vantage: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Convert Alpha Vantage quote to MarketData
     */
    public MarketData convertToMarketData(String symbolId, Map<String, Object> quoteData) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        marketData.setTimestamp(LocalDateTime.now());
        
        double open = (double) quoteData.get("open");
        double high = (double) quoteData.get("high");
        double low = (double) quoteData.get("low");
        double close = (double) quoteData.get("price");
        double volume = (double) quoteData.get("volume");
        
        marketData.setOpen(open);
        marketData.setHigh(high);
        marketData.setLow(low);
        marketData.setClose(close);
        marketData.setVolume(volume);
        marketData.setSource("Alpha Vantage");
        
        return marketData;
    }
    
    /**
     * Convert Alpha Vantage intraday data to MarketData
     */
    public MarketData convertIntradayToMarketData(String symbolId, Map<String, Object> dataPoint) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        
        String timestampStr = (String) dataPoint.get("timestamp");
        marketData.setTimestamp(LocalDateTime.parse(timestampStr, DATE_TIME_FORMATTER));
        
        double open = (double) dataPoint.get("open");
        double high = (double) dataPoint.get("high");
        double low = (double) dataPoint.get("low");
        double close = (double) dataPoint.get("close");
        double volume = (double) dataPoint.get("volume");
        
        marketData.setOpen(open);
        marketData.setHigh(high);
        marketData.setLow(low);
        marketData.setClose(close);
        marketData.setVolume(volume);
        marketData.setSource("Alpha Vantage");
        
        return marketData;
    }
    
    /**
     * Convert Alpha Vantage symbol data to Symbol
     */
    public Symbol convertToSymbol(Map<String, Object> symbolData) {
        String code = symbolData.get("1. symbol").toString();
        String name = symbolData.get("2. name").toString();
        String type = symbolData.get("3. type").toString();
        String region = symbolData.get("4. region").toString();
        String exchange = symbolData.get("5. marketOpen") != null ? symbolData.get("5. marketOpen").toString() : "NSE";
        String description = name;
        
        return new Symbol(code, name, exchange, type, description, "", "");
    }
    
    /**
     * Test connection to the Alpha Vantage API
     */
    public Map<String, Object> testConnection() {
        Map<String, Object> result = new HashMap<>();
        try {
            boolean isWorking = isApiWorking();
            result.put("success", isWorking);
            result.put("message", isWorking ? "Successfully connected to Alpha Vantage API" : "Failed to connect to Alpha Vantage API");
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "Error connecting to Alpha Vantage API: " + e.getMessage());
        }
        return result;
    }
}