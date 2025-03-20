import DashboardLayout from "@/components/layouts/dashboard-layout";
import MarketSearch from "@/components/market/market-search";
import MarketMovers from "@/components/market/market-movers";
import MarketDataTable from "@/components/market/market-data-table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type FilterOptions = {
  market: string;
  filter: string;
  search: string;
};

export default function MarketPage() {
  // State for filters
  const [filters, setFilters] = useState<FilterOptions>({
    market: "all",
    filter: "gainers",
    search: "",
  });

  // Fetch top gainers
  const { data: topGainers, isLoading: gainersLoading } = useQuery({
    queryKey: ["/api/market/movers/gainers"],
  });

  // Fetch top losers
  const { data: topLosers, isLoading: losersLoading } = useQuery({
    queryKey: ["/api/market/movers/losers"],
  });

  // Fetch market indices
  const { data: marketIndices, isLoading: indicesLoading } = useQuery({
    queryKey: ["/api/market/indices"],
  });

  // Fetch market data
  const { data: marketData, isLoading: marketDataLoading } = useQuery({
    queryKey: ["/api/market/data", filters],
  });

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }));
  };

  return (
    <DashboardLayout>
      {/* Market Search & Filter */}
      <MarketSearch
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      {/* Market Movers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MarketMovers
          title="Top Gainers"
          data={topGainers}
          isLoading={gainersLoading}
          variant="gainers"
        />
        
        <MarketMovers
          title="Top Losers"
          data={topLosers}
          isLoading={losersLoading}
          variant="losers"
        />
        
        <MarketMovers
          title="Market Indices"
          data={marketIndices}
          isLoading={indicesLoading}
          variant="indices"
        />
      </div>
      
      {/* Market Data Table */}
      <MarketDataTable
        data={marketData}
        isLoading={marketDataLoading}
      />
    </DashboardLayout>
  );
}
