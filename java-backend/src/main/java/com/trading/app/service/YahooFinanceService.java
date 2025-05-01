package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class YahooFinanceService {
    
    private static final Logger logger = LoggerFactory.getLogger(YahooFinanceService.class);
    
    @Value("${api.yahoo.key}")
    private String apiKey;
    
    @Value("${api.yahoo.base-url}")
    private String baseUrl;
    
    @Autowired
    private RestTemplate restTemplate;
    
    /**
     * Check if the Yahoo Finance API is working
     */
    public boolean isApiWorking() {
        try {
            String url = baseUrl + "/market/v2/get-summary";
            HttpHeaders headers = createHeaders();
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            logger.error("Error checking Yahoo Finance API: {}", e.getMessage());
            return false;
        }
    }
    
    /**
     * Search for symbols
     */
    public List<Map<String, Object>> searchSymbols(String query) throws Exception {
        try {
            String url = baseUrl + "/market/v2/auto-complete";
            
            HttpHeaders headers = createHeaders();
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("q", query)
                    .queryParam("region", "IN");
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    builder.toUriString(),
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to search symbols: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            List<Map<String, Object>> quotes = (List<Map<String, Object>>) data.get("quotes");
            
            // Filter to get only Indian stocks (symbols ending with .NS or .BO)
            List<Map<String, Object>> filteredQuotes = new ArrayList<>();
            
            for (Map<String, Object> quote : quotes) {
                String symbol = quote.get("symbol").toString();
                if (symbol.endsWith(".NS") || symbol.endsWith(".BO") || symbol.startsWith("^")) {
                    filteredQuotes.add(quote);
                }
            }
            
            return filteredQuotes;
        } catch (Exception e) {
            logger.error("Error searching symbols in Yahoo Finance: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get historical data for a symbol
     */
    public List<Map<String, Object>> getHistoricalData(String symbol, String interval, String range) throws Exception {
        try {
            String url = baseUrl + "/market/v2/get-chart";
            
            HttpHeaders headers = createHeaders();
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("symbol", symbol)
                    .queryParam("interval", interval)
                    .queryParam("range", range)
                    .queryParam("region", "IN");
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    builder.toUriString(),
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get historical data: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            Map<String, Object> chart = (Map<String, Object>) data.get("chart");
            List<Map<String, Object>> result = (List<Map<String, Object>>) chart.get("result");
            
            if (result == null || result.isEmpty()) {
                throw new Exception("No data found for symbol: " + symbol);
            }
            
            Map<String, Object> resultData = result.get(0);
            Map<String, Object> indicators = (Map<String, Object>) resultData.get("indicators");
            List<Map<String, Object>> quotes = (List<Map<String, Object>>) indicators.get("quote");
            List<Long> timestamps = (List<Long>) resultData.get("timestamp");
            
            if (quotes == null || quotes.isEmpty() || timestamps == null || timestamps.isEmpty()) {
                throw new Exception("No quote data found for symbol: " + symbol);
            }
            
            Map<String, Object> quote = quotes.get(0);
            
            List<Map<String, Object>> historicalData = new ArrayList<>();
            
            List<Double> opens = (List<Double>) quote.get("open");
            List<Double> highs = (List<Double>) quote.get("high");
            List<Double> lows = (List<Double>) quote.get("low");
            List<Double> closes = (List<Double>) quote.get("close");
            List<Long> volumes = (List<Long>) quote.get("volume");
            
            for (int i = 0; i < timestamps.size(); i++) {
                if (i < opens.size() && i < highs.size() && i < lows.size() && i < closes.size() && i < volumes.size()) {
                    // Skip data points with null values
                    if (opens.get(i) == null || highs.get(i) == null || lows.get(i) == null || closes.get(i) == null || volumes.get(i) == null) {
                        continue;
                    }
                    
                    Map<String, Object> dataPoint = new HashMap<>();
                    dataPoint.put("timestamp", timestamps.get(i));
                    dataPoint.put("open", opens.get(i));
                    dataPoint.put("high", highs.get(i));
                    dataPoint.put("low", lows.get(i));
                    dataPoint.put("close", closes.get(i));
                    dataPoint.put("volume", volumes.get(i));
                    
                    historicalData.add(dataPoint);
                }
            }
            
            return historicalData;
        } catch (Exception e) {
            logger.error("Error getting historical data from Yahoo Finance: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get the latest market data for a symbol
     */
    public Map<String, Object> getQuote(String symbol) throws Exception {
        try {
            String url = baseUrl + "/market/v2/get-quotes";
            
            HttpHeaders headers = createHeaders();
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("symbols", symbol)
                    .queryParam("region", "IN");
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    builder.toUriString(),
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get quote: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            Map<String, Object> quoteResponse = (Map<String, Object>) data.get("quoteResponse");
            List<Map<String, Object>> result = (List<Map<String, Object>>) quoteResponse.get("result");
            
            if (result == null || result.isEmpty()) {
                throw new Exception("No quote data found for symbol: " + symbol);
            }
            
            return result.get(0);
        } catch (Exception e) {
            logger.error("Error getting quote from Yahoo Finance: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get the top gainers in the market
     */
    public List<Map<String, Object>> getTopGainers() throws Exception {
        try {
            String url = baseUrl + "/market/v2/get-movers";
            
            HttpHeaders headers = createHeaders();
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("region", "IN")
                    .queryParam("lang", "en-IN")
                    .queryParam("count", 5)
                    .queryParam("start", 0);
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    builder.toUriString(),
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get top gainers: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            Map<String, Object> finance = (Map<String, Object>) data.get("finance");
            List<Map<String, Object>> result = (List<Map<String, Object>>) finance.get("result");
            
            if (result == null || result.isEmpty()) {
                throw new Exception("No top gainers found");
            }
            
            List<Map<String, Object>> quotes = new ArrayList<>();
            
            for (Map<String, Object> mover : result) {
                String id = mover.get("id").toString();
                if (id.equals("nse_gainers")) {
                    quotes = (List<Map<String, Object>>) mover.get("quotes");
                    break;
                }
            }
            
            return quotes;
        } catch (Exception e) {
            logger.error("Error getting top gainers from Yahoo Finance: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Get the top losers in the market
     */
    public List<Map<String, Object>> getTopLosers() throws Exception {
        try {
            String url = baseUrl + "/market/v2/get-movers";
            
            HttpHeaders headers = createHeaders();
            
            UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(url)
                    .queryParam("region", "IN")
                    .queryParam("lang", "en-IN")
                    .queryParam("count", 5)
                    .queryParam("start", 0);
            
            HttpEntity<?> entity = new HttpEntity<>(headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(
                    builder.toUriString(),
                    HttpMethod.GET,
                    entity,
                    Map.class
            );
            
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new Exception("Failed to get top losers: " + response.getStatusCode());
            }
            
            Map<String, Object> data = response.getBody();
            Map<String, Object> finance = (Map<String, Object>) data.get("finance");
            List<Map<String, Object>> result = (List<Map<String, Object>>) finance.get("result");
            
            if (result == null || result.isEmpty()) {
                throw new Exception("No top losers found");
            }
            
            List<Map<String, Object>> quotes = new ArrayList<>();
            
            for (Map<String, Object> mover : result) {
                String id = mover.get("id").toString();
                if (id.equals("nse_losers")) {
                    quotes = (List<Map<String, Object>>) mover.get("quotes");
                    break;
                }
            }
            
            return quotes;
        } catch (Exception e) {
            logger.error("Error getting top losers from Yahoo Finance: {}", e.getMessage());
            throw e;
        }
    }
    
    /**
     * Convert Yahoo Finance quote to MarketData
     */
    public MarketData convertToMarketData(String symbolId, Map<String, Object> quoteData) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        marketData.setTimestamp(LocalDateTime.now());
        
        double open = Double.parseDouble(quoteData.get("regularMarketOpen").toString());
        double high = Double.parseDouble(quoteData.get("regularMarketDayHigh").toString());
        double low = Double.parseDouble(quoteData.get("regularMarketDayLow").toString());
        double close = Double.parseDouble(quoteData.get("regularMarketPrice").toString());
        double volume = Double.parseDouble(quoteData.get("regularMarketVolume").toString());
        
        marketData.setOpen(open);
        marketData.setHigh(high);
        marketData.setLow(low);
        marketData.setClose(close);
        marketData.setVolume(volume);
        marketData.setSource("Yahoo Finance");
        
        return marketData;
    }
    
    /**
     * Convert Yahoo Finance historical data to MarketData
     */
    public MarketData convertHistoricalToMarketData(String symbolId, Map<String, Object> histData) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        
        // Convert timestamp from Unix seconds to LocalDateTime
        long timestamp = (long) histData.get("timestamp");
        marketData.setTimestamp(LocalDateTime.ofEpochSecond(timestamp, 0, ZoneOffset.UTC));
        
        double open = (double) histData.get("open");
        double high = (double) histData.get("high");
        double low = (double) histData.get("low");
        double close = (double) histData.get("close");
        long volume = (long) histData.get("volume");
        
        marketData.setOpen(open);
        marketData.setHigh(high);
        marketData.setLow(low);
        marketData.setClose(close);
        marketData.setVolume(volume);
        marketData.setSource("Yahoo Finance");
        
        return marketData;
    }
    
    /**
     * Convert Yahoo Finance symbol data to Symbol
     */
    public Symbol convertToSymbol(Map<String, Object> symbolData) {
        String code = symbolData.get("symbol").toString();
        String name = symbolData.get("shortname") != null ? symbolData.get("shortname").toString() : 
                     (symbolData.get("longname") != null ? symbolData.get("longname").toString() : code);
        
        String exchange = symbolData.get("exchange") != null ? symbolData.get("exchange").toString() : "";
        String type = symbolData.get("quoteType") != null ? symbolData.get("quoteType").toString() : "Equity";
        
        String description = symbolData.get("longname") != null ? symbolData.get("longname").toString() : 
                           (symbolData.get("shortname") != null ? symbolData.get("shortname").toString() : "");
        
        String sector = symbolData.get("sector") != null ? symbolData.get("sector").toString() : "";
        String industry = symbolData.get("industry") != null ? symbolData.get("industry").toString() : "";
        
        return new Symbol(code, name, exchange, type, description, sector, industry);
    }
    
    /**
     * Create the headers for API requests
     */
    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        return headers;
    }
    
    /**
     * Test connection to the Yahoo Finance API
     */
    public Map<String, Object> testConnection() {
        Map<String, Object> result = new HashMap<>();
        try {
            boolean isWorking = isApiWorking();
            result.put("success", isWorking);
            result.put("message", isWorking ? "Successfully connected to Yahoo Finance API" : "Failed to connect to Yahoo Finance API");
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "Error connecting to Yahoo Finance API: " + e.getMessage());
        }
        return result;
    }
}