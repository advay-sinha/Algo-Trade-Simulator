import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Strategy } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

// Define the schema for simulation form
const simulationSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  strategy: z.string().min(1, "Strategy is required"),
  duration: z.string().min(1, "Duration is required"),
  initialBalance: z.number().min(1000, "Initial balance must be at least ₹1,000"),
});

type SimulationFormValues = z.infer<typeof simulationSchema>;

export default function SimulationForm() {
  const { toast } = useToast();
  const [selectedDuration, setSelectedDuration] = useState("24h");
  
  // Fetch strategies
  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });
  
  // Initialize form
  const form = useForm<SimulationFormValues>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      symbol: "HDFCBANK.NS",
      strategy: "Moving Average Crossover",
      duration: "24h",
      initialBalance: 100000, // ₹1,00,000
    },
  });
  
  // Define mutation for creating a simulation
  const createSimulationMutation = useMutation({
    mutationFn: async (data: SimulationFormValues) => {
      const res = await apiRequest("POST", "/api/simulations", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Simulation started",
        description: "Your algorithmic trading simulation has started successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/simulations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: SimulationFormValues) => {
    createSimulationMutation.mutate(data);
  };
  
  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-wrap items-center justify-between mb-4">
            <div className="w-full sm:w-auto mb-4 sm:mb-0">
              <h2 className="text-lg font-medium">Simulation Period</h2>
            </div>
            <div className="w-full sm:w-auto flex flex-wrap gap-2">
              <Button 
                type="button"
                variant={selectedDuration === "24h" ? "default" : "outline"}
                onClick={() => {
                  setSelectedDuration("24h");
                  form.setValue("duration", "24h");
                }}
              >
                24 Hours
              </Button>
              <Button 
                type="button"
                variant={selectedDuration === "48h" ? "default" : "outline"}
                onClick={() => {
                  setSelectedDuration("48h");
                  form.setValue("duration", "48h");
                }}
              >
                48 Hours
              </Button>
              <Button 
                type="button"
                variant={selectedDuration === "1w" ? "default" : "outline"}
                onClick={() => {
                  setSelectedDuration("1w");
                  form.setValue("duration", "1w");
                }}
              >
                1 Week
              </Button>
              <Button 
                type="button"
                variant={selectedDuration === "custom" ? "default" : "outline"}
                onClick={() => {
                  setSelectedDuration("custom");
                  form.setValue("duration", "custom");
                }}
              >
                Custom
              </Button>
            </div>
          </div>
          
          {/* Market & Strategy Selection */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="symbol">Select Market</Label>
              <Select 
                onValueChange={(value) => form.setValue("symbol", value)}
                defaultValue={form.getValues("symbol")}
              >
                <SelectTrigger id="symbol" className="mt-1">
                  <SelectValue placeholder="Select a market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NIFTY50.NS">NIFTY50</SelectItem>
                  <SelectItem value="SENSEX.BO">SENSEX</SelectItem>
                  <SelectItem value="HDFCBANK.NS">HDFC Bank</SelectItem>
                  <SelectItem value="RELIANCE.NS">Reliance Industries</SelectItem>
                  <SelectItem value="TCS.NS">TCS</SelectItem>
                  <SelectItem value="INFY.NS">Infosys</SelectItem>
                  <SelectItem value="BTCINR=X">Bitcoin/INR</SelectItem>
                  <SelectItem value="ETHINR=X">Ethereum/INR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="strategy">Trading Strategy</Label>
              <Select 
                onValueChange={(value) => form.setValue("strategy", value)}
                defaultValue={form.getValues("strategy")}
                disabled={strategiesLoading}
              >
                <SelectTrigger id="strategy" className="mt-1">
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategiesLoading ? (
                    <SelectItem value="loading">Loading strategies...</SelectItem>
                  ) : (
                    strategies?.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.name}>
                        {strategy.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Submit Button */}
          <div className="mt-6 flex justify-end">
            <Button 
              type="submit" 
              disabled={createSimulationMutation.isPending}
            >
              {createSimulationMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Start Simulation
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
