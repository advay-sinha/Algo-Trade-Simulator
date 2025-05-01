import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Filter } from "lucide-react";
import { useState } from "react";

type FilterOptions = {
  market: string;
  filter: string;
  search: string;
};

type MarketSearchProps = {
  filters: FilterOptions;
  onFilterChange: (filters: Partial<FilterOptions>) => void;
};

export default function MarketSearch({ filters, onFilterChange }: MarketSearchProps) {
  const [searchValue, setSearchValue] = useState(filters.search);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ search: searchValue });
  };

  return (
    <Card className="bg-white rounded-lg shadow mb-6">
      <CardContent className="p-5">
        <form className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4" onSubmit={handleSearchSubmit}>
          <div className="flex-grow">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by company name or symbol..."
                className="w-full pl-10 pr-4 py-2"
                value={searchValue}
                onChange={handleSearchChange}
              />
              <i className="ri-search-line absolute left-3 top-2.5 text-gray-400"></i>
            </div>
          </div>
          <div className="flex space-x-2 flex-shrink-0">
            <Select
              value={filters.market}
              onValueChange={(value) => onFilterChange({ market: value })}
            >
              <SelectTrigger className="w-full md:w-auto bg-white">
                <SelectValue placeholder="All Markets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets</SelectItem>
                <SelectItem value="nse">NSE</SelectItem>
                <SelectItem value="bse">BSE</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
            
            <Select
              value={filters.filter}
              onValueChange={(value) => onFilterChange({ filter: value })}
            >
              <SelectTrigger className="w-full md:w-auto bg-white">
                <SelectValue placeholder="Filter By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gainers">Top Gainers</SelectItem>
                <SelectItem value="losers">Top Losers</SelectItem>
                <SelectItem value="volume">High Volume</SelectItem>
                <SelectItem value="favorites">Favorites</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              type="button" 
              variant="outline" 
              size="icon" 
              className="rounded-md bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              aria-label="Advanced filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
