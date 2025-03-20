package com.trading.app.service;

import com.trading.app.model.MarketData;
import com.trading.app.model.Symbol;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class YahooFinanceService {

    @Value("${yahoo.finance.api.key}")
    private String apiKey;
    
    @Value("${yahoo.finance.api.baseUrl}")
    private String baseUrl;
    
    private final RestTemplate restTemplate;
    
    public YahooFinanceService() {
        this.restTemplate = new RestTemplate();
    }
    
    /**
     * Get market movers (top gainers, losers, etc.)
     */
    public List<Map<String, Object>> getMarketMovers(String type, String region) {
        String url = baseUrl + "/market/v2/get-movers";
        
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        
        HttpEntity<String> entity = new HttpEntity<>(headers);
        
        ResponseEntity<Map> response = restTemplate.exchange(
                url + "?region=" + region + "&lang=en",
                HttpMethod.GET,
                entity,
                Map.class
        );
        
        Map<String, Object> responseBody = response.getBody();
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (responseBody != null && responseBody.containsKey("finance")) {
            Map<String, Object> finance = (Map<String, Object>) responseBody.get("finance");
            if (finance.containsKey("result")) {
                List<Map<String, Object>> results = (List<Map<String, Object>>) finance.get("result");
                
                for (Map<String, Object> movers : results) {
                    if (movers.containsKey("id") && movers.get("id").toString().contains(type)) {
                        if (movers.containsKey("quotes")) {
                            result = (List<Map<String, Object>>) movers.get("quotes");
                            break;
                        }
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * Get quotes for multiple symbols
     */
    public List<Map<String, Object>> getQuotes(List<String> symbols) {
        String symbolList = String.join(",", symbols);
        String url = baseUrl + "/market/v2/get-quotes?region=IN&symbols=" + symbolList;
        
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        
        HttpEntity<String> entity = new HttpEntity<>(headers);
        
        ResponseEntity<Map> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                entity,
                Map.class
        );
        
        Map<String, Object> responseBody = response.getBody();
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (responseBody != null && responseBody.containsKey("quoteResponse")) {
            Map<String, Object> quoteResponse = (Map<String, Object>) responseBody.get("quoteResponse");
            if (quoteResponse.containsKey("result")) {
                result = (List<Map<String, Object>>) quoteResponse.get("result");
            }
        }
        
        return result;
    }
    
    /**
     * Get quotes for a single symbol
     */
    public Map<String, Object> getQuote(String symbol) {
        List<String> symbols = new ArrayList<>();
        symbols.add(symbol);
        
        List<Map<String, Object>> quotes = getQuotes(symbols);
        
        if (!quotes.isEmpty()) {
            return quotes.get(0);
        }
        
        return null;
    }
    
    /**
     * Get historical data for a symbol
     */
    public List<Map<String, Object>> getHistoricalData(String symbol, String interval, String range) {
        String url = baseUrl + "/market/get-charts?region=IN&lang=en&symbol=" + symbol + "&interval=" + interval + "&range=" + range;
        
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        
        HttpEntity<String> entity = new HttpEntity<>(headers);
        
        ResponseEntity<Map> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                entity,
                Map.class
        );
        
        Map<String, Object> responseBody = response.getBody();
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (responseBody != null && responseBody.containsKey("chart")) {
            Map<String, Object> chart = (Map<String, Object>) responseBody.get("chart");
            if (chart.containsKey("result")) {
                List<Map<String, Object>> results = (List<Map<String, Object>>) chart.get("result");
                
                if (!results.isEmpty()) {
                    Map<String, Object> data = results.get(0);
                    
                    List<Long> timestamps = (List<Long>) data.get("timestamp");
                    List<Map<String, Object>> indicators = (List<Map<String, Object>>) ((Map<String, Object>) data.get("indicators")).get("quote");
                    Map<String, Object> quote = indicators.get(0);
                    
                    List<Double> opens = (List<Double>) quote.get("open");
                    List<Double> highs = (List<Double>) quote.get("high");
                    List<Double> lows = (List<Double>) quote.get("low");
                    List<Double> closes = (List<Double>) quote.get("close");
                    List<Long> volumes = (List<Long>) quote.get("volume");
                    
                    for (int i = 0; i < timestamps.size(); i++) {
                        if (opens.get(i) != null && highs.get(i) != null && lows.get(i) != null && closes.get(i) != null) {
                            Map<String, Object> point = Map.of(
                                    "timestamp", timestamps.get(i),
                                    "open", opens.get(i),
                                    "high", highs.get(i),
                                    "low", lows.get(i),
                                    "close", closes.get(i),
                                    "volume", volumes.get(i) != null ? volumes.get(i) : 0
                            );
                            result.add(point);
                        }
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * Search for symbols
     */
    public List<Map<String, Object>> searchSymbols(String query) {
        String url = baseUrl + "/market/v2/auto-complete?region=IN&lang=en&query=" + query;
        
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        
        HttpEntity<String> entity = new HttpEntity<>(headers);
        
        ResponseEntity<Map> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                entity,
                Map.class
        );
        
        Map<String, Object> responseBody = response.getBody();
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (responseBody != null && responseBody.containsKey("quotes")) {
            result = (List<Map<String, Object>>) responseBody.get("quotes");
        }
        
        return result;
    }
    
    /**
     * Convert a Yahoo Finance quote to a Symbol object
     */
    public Symbol convertToSymbol(Map<String, Object> quote) {
        Symbol symbol = new Symbol();
        
        if (quote.containsKey("symbol")) {
            symbol.setCode(quote.get("symbol").toString());
        }
        if (quote.containsKey("shortName")) {
            symbol.setName(quote.get("shortName").toString());
        }
        if (quote.containsKey("exchange")) {
            symbol.setExchange(quote.get("exchange").toString());
        }
        if (quote.containsKey("typeDisp")) {
            symbol.setType(quote.get("typeDisp").toString());
        }
        if (quote.containsKey("longName")) {
            symbol.setDescription(quote.get("longName").toString());
        }
        if (quote.containsKey("sector")) {
            symbol.setSector(quote.get("sector").toString());
        }
        if (quote.containsKey("industry")) {
            symbol.setIndustry(quote.get("industry").toString());
        }
        
        return symbol;
    }
    
    /**
     * Convert a Yahoo Finance quote to a MarketData object
     */
    public MarketData convertToMarketData(Map<String, Object> quote, String symbolId) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        marketData.setTimestamp(LocalDateTime.now());
        marketData.setSource("Yahoo Finance");
        
        if (quote.containsKey("regularMarketOpen")) {
            marketData.setOpen(Double.parseDouble(quote.get("regularMarketOpen").toString()));
        }
        if (quote.containsKey("regularMarketDayHigh")) {
            marketData.setHigh(Double.parseDouble(quote.get("regularMarketDayHigh").toString()));
        }
        if (quote.containsKey("regularMarketDayLow")) {
            marketData.setLow(Double.parseDouble(quote.get("regularMarketDayLow").toString()));
        }
        if (quote.containsKey("regularMarketPrice")) {
            marketData.setClose(Double.parseDouble(quote.get("regularMarketPrice").toString()));
        }
        if (quote.containsKey("regularMarketVolume")) {
            marketData.setVolume(Long.parseLong(quote.get("regularMarketVolume").toString()));
        }
        
        return marketData;
    }
    
    /**
     * Convert historical data point to a MarketData object
     */
    public MarketData convertHistoricalDataToMarketData(Map<String, Object> dataPoint, String symbolId) {
        MarketData marketData = new MarketData();
        
        marketData.setSymbolId(symbolId);
        
        // Convert timestamp (seconds) to LocalDateTime
        long timestamp = (Long) dataPoint.get("timestamp");
        marketData.setTimestamp(LocalDateTime.now()); // This should be converted properly
        
        marketData.setOpen((Double) dataPoint.get("open"));
        marketData.setHigh((Double) dataPoint.get("high"));
        marketData.setLow((Double) dataPoint.get("low"));
        marketData.setClose((Double) dataPoint.get("close"));
        marketData.setVolume((Long) dataPoint.get("volume"));
        
        marketData.setSource("Yahoo Finance");
        
        return marketData;
    }
    
    /**
     * Test connection to the API
     */
    public Map<String, Object> testConnection() {
        try {
            List<String> testSymbols = List.of("RELIANCE.NS", "INFY.NS");
            List<Map<String, Object>> quotes = getQuotes(testSymbols);
            return Map.of("success", true, "message", "Successfully connected to Yahoo Finance API", "responseSize", quotes.size());
        } catch (Exception e) {
            return Map.of("success", false, "message", "Failed to connect to Yahoo Finance API: " + e.getMessage());
        }
    }
}