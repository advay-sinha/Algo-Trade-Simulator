import { useState } from "react";
import Layout from "@/components/layout/layout";
import StrategyForm from "@/components/simulator/strategy-form";
import SymbolPreview from "@/components/simulator/symbol-preview";
import StrategyDescription from "@/components/simulator/strategy-description";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface Symbol {
  id: number;
  name: string;
  symbol: string;
  exchange: string;
  type: string;
  description: string;
}

interface Strategy {
  id: number;
  name: string;
  description: string;
  timeFrame: string;
  successRate: string;
  bestMarketCondition: string;
  riskRating: string;
}

export default function SimulatorPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<number>(1);

  // Fetch strategies for the dropdown
  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/simulation/strategies"],
  });

  // Fetch selected strategy details when strategy changes
  const { data: strategyDetails, isLoading: strategyDetailsLoading } = useQuery<Strategy>({
    queryKey: ["/api/simulation/strategies", selectedStrategy],
    enabled: !!selectedStrategy,
  });

  // Handle strategy selection change
  const handleStrategyChange = (strategyId: number) => {
    setSelectedStrategy(strategyId);
  };

  // Handle symbol selection change
  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <Layout title="Trading Simulator">
      <div className="grid grid-cols-1 gap-8">
        {/* Simulator Configuration */}
        <StrategyForm 
          onStrategyChange={handleStrategyChange}
          onSymbolChange={handleSymbolChange}
          strategies={strategies || []}
          isLoading={strategiesLoading}
        />

        {/* Symbol Preview */}
        {selectedSymbol && (
          <SymbolPreview symbol={selectedSymbol} />
        )}

        {/* Strategy Description */}
        {strategiesLoading || strategyDetailsLoading ? (
          <div className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6">
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
            <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="sm:col-span-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-6 w-48" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          strategyDetails && <StrategyDescription strategy={strategyDetails} />
        )}
      </div>
    </Layout>
  );
}
