import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

// Define types
interface Strategy {
  id: number;
  name: string;
  description: string;
  timeFrame: string;
  successRate: string;
  bestMarketCondition: string;
  riskRating: string;
}

interface Symbol {
  id: number;
  name: string;
  symbol: string;
  exchange: string;
  type: string;
  description: string;
}

interface StrategyFormProps {
  onStrategyChange: (strategyId: number) => void;
  onSymbolChange: (symbol: string) => void;
  strategies: Strategy[];
  isLoading: boolean;
}

// Form schema
const simulationFormSchema = z.object({
  market: z.string().min(1, "Please select a market"),
  symbol: z.string().min(1, "Please select a symbol"),
  strategy: z.string().min(1, "Please select a strategy"),
  investment: z.coerce.number().min(1000, "Minimum investment is ₹1,000").max(1000000, "Maximum investment is ₹10,00,000"),
  timeperiod: z.string().min(1, "Please select a simulation period"),
  interval: z.string().min(1, "Please select a trade interval"),
  riskLevel: z.string().optional(),
  stopLoss: z.coerce.number().min(1, "Minimum stop loss is 1%").max(20, "Maximum stop loss is 20%").optional(),
  takeProfit: z.coerce.number().min(1, "Minimum take profit is 1%").max(50, "Maximum take profit is 50%").optional(),
  dataSource: z.string().optional(),
});

type SimulationFormValues = z.infer<typeof simulationFormSchema>;

export default function StrategyForm({ 
  onStrategyChange, 
  onSymbolChange,
  strategies, 
  isLoading 
}: StrategyFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Form with default values
  const form = useForm<SimulationFormValues>({
    resolver: zodResolver(simulationFormSchema),
    defaultValues: {
      market: "NSE",
      symbol: "",
      strategy: "1",
      investment: 10000,
      timeperiod: "24 Hours",
      interval: "2 Hours",
      riskLevel: "Medium (2% per trade)",
      stopLoss: 3,
      takeProfit: 5,
      dataSource: "Alpha Vantage",
    },
  });

  // Get selected strategy ID
  const strategyId = parseInt(form.watch("strategy") || "1");

  // Fetch symbols
  const { data: symbols, isLoading: symbolsLoading } = useQuery<Symbol[]>({
    queryKey: ["/api/market/symbols"],
    queryFn: async () => {
      try {
        const defaultSymbols = [
          { id: 1, name: "HDFC Bank", symbol: "HDFCBANK", exchange: "NSE", type: "Equity", description: "" },
          { id: 2, name: "Reliance Industries", symbol: "RELIANCE", exchange: "NSE", type: "Equity", description: "" },
          { id: 3, name: "Infosys", symbol: "INFY", exchange: "NSE", type: "Equity", description: "" },
          { id: 4, name: "Tata Consultancy Services", symbol: "TCS", exchange: "NSE", type: "Equity", description: "" },
          { id: 5, name: "ICICI Bank", symbol: "ICICIBANK", exchange: "NSE", type: "Equity", description: "" },
        ];
        
        // Try to fetch symbols from API
        const res = await fetch("/api/market/symbols");
        if (!res.ok) {
          throw new Error("Failed to fetch symbols");
        }
        
        const data = await res.json();
        return data.length > 0 ? data : defaultSymbols;
      } catch (error) {
        console.error("Error fetching symbols:", error);
        // Return default symbols if API fails
        return [
          { id: 1, name: "HDFC Bank", symbol: "HDFCBANK", exchange: "NSE", type: "Equity", description: "" },
          { id: 2, name: "Reliance Industries", symbol: "RELIANCE", exchange: "NSE", type: "Equity", description: "" },
          { id: 3, name: "Infosys", symbol: "INFY", exchange: "NSE", type: "Equity", description: "" },
          { id: 4, name: "Tata Consultancy Services", symbol: "TCS", exchange: "NSE", type: "Equity", description: "" },
          { id: 5, name: "ICICI Bank", symbol: "ICICIBANK", exchange: "NSE", type: "Equity", description: "" },
        ];
      }
    }
  });

  // Create simulation mutation
  const createSimulationMutation = useMutation({
    mutationFn: async (data: SimulationFormValues) => {
      const selectedSymbol = symbols?.find(s => s.symbol === data.symbol);
      if (!selectedSymbol) {
        throw new Error("Invalid symbol selected");
      }
      
      const simulationData = {
        userId: user?.id,
        symbolId: selectedSymbol.id,
        strategyId: parseInt(data.strategy),
        investment: data.investment,
        timeperiod: data.timeperiod,
        interval: data.interval,
        settings: {
          riskLevel: data.riskLevel,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          dataSource: data.dataSource,
        }
      };
      
      const res = await apiRequest("POST", "/api/simulation/simulations", simulationData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Simulation started",
        description: "Your trading simulation has been started successfully.",
      });
      
      // Reset form
      form.reset(form.getValues());
      
      // Invalidate simulations queries
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/simulations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/simulations/active"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: SimulationFormValues) => {
    createSimulationMutation.mutate(data);
  };

  // Handle strategy change
  const handleStrategyChange = (value: string) => {
    const strategyId = parseInt(value);
    form.setValue("strategy", value);
    onStrategyChange(strategyId);
  };

  // Handle symbol change
  const handleSymbolChange = (value: string) => {
    form.setValue("symbol", value);
    onSymbolChange(value);
  };

  // Reset form
  const handleReset = () => {
    form.reset();
    setShowAdvanced(false);
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Configure New Simulation</CardTitle>
        <CardDescription>Set up parameters for your algorithmic trading simulation.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Market Selection */}
              <FormField
                control={form.control}
                name="market"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Market</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a market" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NSE">NSE (National Stock Exchange)</SelectItem>
                        <SelectItem value="BSE">BSE (Bombay Stock Exchange)</SelectItem>
                        <SelectItem value="MCX">MCX (Multi Commodity Exchange)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Symbol Selection */}
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <Select
                      onValueChange={(value) => handleSymbolChange(value)}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a symbol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {symbolsLoading ? (
                          <div className="p-2">
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-full" />
                          </div>
                        ) : (
                          symbols?.map((symbol) => (
                            <SelectItem key={symbol.id} value={symbol.symbol}>
                              {symbol.name} ({symbol.symbol})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Strategy Selection */}
              <FormField
                control={form.control}
                name="strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strategy</FormLabel>
                    <Select
                      onValueChange={(value) => handleStrategyChange(value)}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a strategy" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoading ? (
                          <div className="p-2">
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-full" />
                          </div>
                        ) : (
                          strategies.map((strategy) => (
                            <SelectItem key={strategy.id} value={strategy.id.toString()}>
                              {strategy.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Investment Amount */}
              <FormField
                control={form.control}
                name="investment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Investment Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1000" step="1000" {...field} />
                    </FormControl>
                    <FormDescription>
                      Amount to invest in this simulation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Time Period */}
              <FormField
                control={form.control}
                name="timeperiod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Simulation Period</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a time period" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="6 Hours">6 Hours</SelectItem>
                        <SelectItem value="12 Hours">12 Hours</SelectItem>
                        <SelectItem value="24 Hours">24 Hours</SelectItem>
                        <SelectItem value="3 Days">3 Days</SelectItem>
                        <SelectItem value="1 Week">1 Week</SelectItem>
                        <SelectItem value="2 Weeks">2 Weeks</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Trade Interval */}
              <FormField
                control={form.control}
                name="interval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trade Interval</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select trade interval" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="30 Minutes">30 Minutes</SelectItem>
                        <SelectItem value="1 Hour">1 Hour</SelectItem>
                        <SelectItem value="2 Hours">2 Hours</SelectItem>
                        <SelectItem value="4 Hours">4 Hours</SelectItem>
                        <SelectItem value="6 Hours">6 Hours</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Advanced Settings Toggle */}
            <div className="mt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center text-sm text-primary hover:text-primary/80 p-0 text-black dark:text-gray-200 p-4"
              >
                {showAdvanced ? (
                  <ChevronDown className="mr-2 h-4 w-4 text-black dark:text-gray-200" />
                ) : (
                  <ChevronRight className="mr-2 h-4 w-4 text-black dark:text-gray-200" />
                )}
                <div className="text-black dark:text-gray-200">Advanced Settings</div>
              </Button>
              
              {showAdvanced && (
                <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* Risk Level */}
                  <FormField
                    control={form.control}
                    name="riskLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Risk Level</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Low (1% per trade)">Low (1% per trade)</SelectItem>
                            <SelectItem value="Medium (2% per trade)">Medium (2% per trade)</SelectItem>
                            <SelectItem value="High (5% per trade)">High (5% per trade)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Stop Loss */}
                  <FormField
                    control={form.control}
                    name="stopLoss"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stop Loss (%)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="20" step="0.5" {...field} />
                        </FormControl>
                        <FormDescription>
                          Maximum loss percentage before exiting a position.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Take Profit */}
                  <FormField
                    control={form.control}
                    name="takeProfit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Take Profit (%)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="50" step="0.5" {...field} />
                        </FormControl>
                        <FormDescription>
                          Target profit percentage to exit a position.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* API Data Source */}
                  <FormField
                    control={form.control}
                    name="dataSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Source</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select data source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Alpha Vantage">Alpha Vantage</SelectItem>
                            <SelectItem value="Yahoo Finance">Yahoo Finance</SelectItem>
                            <SelectItem value="NSE India API">NSE India API</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleReset}
                disabled={createSimulationMutation.isPending}
              >
                Reset
              </Button>
              <Button 
                type="submit" 
                disabled={createSimulationMutation.isPending}
              >
                {createSimulationMutation.isPending ? "Starting Simulation..." : "Start Simulation"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
