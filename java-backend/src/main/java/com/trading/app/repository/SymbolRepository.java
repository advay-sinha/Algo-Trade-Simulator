package com.trading.app.repository;

import com.trading.app.model.Symbol;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SymbolRepository extends MongoRepository<Symbol, String> {
    
    /**
     * Find a symbol by its code
     */
    Optional<Symbol> findByCode(String code);
    
    /**
     * Find symbols by exchange
     */
    List<Symbol> findByExchange(String exchange);
    
    /**
     * Find symbols by type
     */
    List<Symbol> findByType(String type);
    
    /**
     * Search for symbols by name or code
     */
    @Query("{ $or: [ { 'name': { $regex: ?0, $options: 'i' } }, { 'code': { $regex: ?0, $options: 'i' } } ] }")
    List<Symbol> search(String query);
    
    /**
     * Find symbols by sector
     */
    List<Symbol> findBySector(String sector);
    
    /**
     * Find symbols by industry
     */
    List<Symbol> findByIndustry(String industry);
}