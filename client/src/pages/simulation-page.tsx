import { useState } from "react";
import DashboardLayout from "@/components/layouts/dashboard-layout";
import SimulationSetup from "@/components/simulation/simulation-setup";
import StrategyParameters from "@/components/simulation/strategy-parameters";
import ActiveSimulation from "@/components/simulation/active-simulation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Simulation } from "@shared/schema";

export type SimulationConfig = {
  assetType: string;
  assetName: string;
  timePeriod: string;
  strategy: string;
  tradeAmount: number;
  reinvestProfits: boolean;
};

export type StrategyParams = {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  buyThreshold: number;
  sellThreshold: number;
  stopLoss: number;
};

export default function SimulationPage() {
  const { toast } = useToast();
  
  // Fetch active simulation if any
  const { data: activeSimulation, isLoading: simulationLoading } = useQuery({
    queryKey: ["/api/simulation/active"],
  });

  // Start simulation mutation
  const startSimulationMutation = useMutation({
    mutationFn: async (data: { config: SimulationConfig, params: StrategyParams }) => {
      try {
        // First, get the symbol ID for the selected asset
        const symbolResponse = await apiRequest("GET", `/api/symbols/${data.config.assetName.toUpperCase()}`);
        if (!symbolResponse.ok) {
          throw new Error(`Failed to fetch symbol: ${symbolResponse.statusText}`);
        }
        const symbolData = await symbolResponse.json();
        
        if (!symbolData || !symbolData.id) {
          throw new Error("Symbol not found");
        }

        // Create the simulation with the correct symbol ID
        const simulationData = {
          userId: "1",
          symbolId: symbolData.id.toString(),
          strategyId: "1",
          initialInvestment: data.config.tradeAmount,
          currentBalance: data.config.tradeAmount,
          parameters: {
            ...data.params,
            reinvestProfits: data.config.reinvestProfits
          },
          timeperiod: data.config.timePeriod,
          interval: "1h",
          profitLoss: 0,
          profitLossPercentage: 0,
          totalTrades: 0,
          successfulTrades: 0
        };

        const res = await apiRequest("POST", "/api/simulation/simulations", simulationData);
        if (!res.ok) {
          throw new Error(`Failed to create simulation: ${res.statusText}`);
        }
        return await res.json();
      } catch (error) {
        console.error("Error in simulation creation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/active"] });
      toast({
        title: "Simulation started",
        description: "Your simulation is now running.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pause simulation mutation
  const pauseSimulationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulation/pause");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/active"] });
      toast({
        title: "Simulation paused",
        description: "Your simulation has been paused.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to pause simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Stop simulation mutation
  const stopSimulationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulation/stop");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/active"] });
      toast({
        title: "Simulation stopped",
        description: "Your simulation has been stopped and results are available in Reports.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Default simulation config and strategy params
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    assetType: "stocks",
    assetName: "RELIANCE",
    timePeriod: "24h",
    strategy: "macd",
    tradeAmount: 10000,
    reinvestProfits: false,
  });

  const [strategyParams, setStrategyParams] = useState<StrategyParams>({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    buyThreshold: 0.0,
    sellThreshold: 0.0,
    stopLoss: 5.0,
  });

  // Handle setup form changes
  const handleSetupChange = (config: Partial<SimulationConfig>) => {
    setSimulationConfig((prev) => ({ ...prev, ...config }));
  };

  // Handle params form changes
  const handleParamsChange = (params: Partial<StrategyParams>) => {
    setStrategyParams((prev) => ({ ...prev, ...params }));
  };

  // Start new simulation
  const handleStartSimulation = () => {
    startSimulationMutation.mutate({
      config: simulationConfig,
      params: strategyParams,
    });
  };

  // Pause active simulation
  const handlePauseSimulation = () => {
    pauseSimulationMutation.mutate();
  };

  // Stop active simulation
  const handleStopSimulation = () => {
    stopSimulationMutation.mutate();
  };

  // Reset params to default
  const handleResetParams = () => {
    setStrategyParams({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      buyThreshold: 0.0,
      sellThreshold: 0.0,
      stopLoss: 5.0,
    });
  };

  const hasActiveSimulation = activeSimulation && !simulationLoading;
  const isDisabled = Boolean(hasActiveSimulation || startSimulationMutation.isPending);

  return (
    <DashboardLayout>
      <SimulationSetup
        config={simulationConfig}
        onChange={handleSetupChange}
        onStart={handleStartSimulation}
        disabled={isDisabled}
        isLoading={startSimulationMutation.isPending}
      />
      
      <StrategyParameters
        params={strategyParams}
        onChange={handleParamsChange}
        onReset={handleResetParams}
        disabled={isDisabled}
      />
      
      {(hasActiveSimulation || simulationLoading) && (
        <ActiveSimulation
          simulation={activeSimulation as Simulation}
          isLoading={simulationLoading}
          onPause={handlePauseSimulation}
          onStop={handleStopSimulation}
          isPausing={pauseSimulationMutation.isPending}
          isStopping={stopSimulationMutation.isPending}
        />
      )}
    </DashboardLayout>
  );
}
