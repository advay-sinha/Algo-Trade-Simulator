package com.trading.app.repository;

import com.trading.app.model.Symbol;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface SymbolRepository extends MongoRepository<Symbol, String> {
    Optional<Symbol> findBySymbol(String symbol);
    
    List<Symbol> findByExchange(String exchange);
    
    List<Symbol> findByType(String type);
    
    List<Symbol> findBySymbolContainingIgnoreCase(String keyword);
    
    List<Symbol> findByNameContainingIgnoreCase(String keyword);
}