import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useState } from "react";

// Define the SimulationConfig type to match the simulation-page
type SimulationConfig = {
  assetType: string;
  assetName: string;
  timePeriod: string;
  strategy: string;
  tradeAmount: number;
  reinvestProfits: boolean;
};

type SimulationSetupProps = {
  config: SimulationConfig;
  onChange: (config: Partial<SimulationConfig>) => void;
  onStart: () => void;
  disabled: boolean;
  isLoading: boolean;
};

export default function SimulationSetup({ 
  config, 
  onChange, 
  onStart, 
  disabled, 
  isLoading 
}: SimulationSetupProps) {
  const [errors, setErrors] = useState<Partial<Record<keyof SimulationConfig, string>>>({});

  // Validate the form before submission
  const validateForm = () => {
    const newErrors: Partial<Record<keyof SimulationConfig, string>> = {};
    
    if (!config.assetType) {
      newErrors.assetType = "Please select an asset type";
    }
    if (!config.assetName) {
      newErrors.assetName = "Please select an asset";
    }
    if (!config.timePeriod) {
      newErrors.timePeriod = "Please select a time period";
    }
    if (!config.strategy) {
      newErrors.strategy = "Please select a strategy";
    }
    if (!config.tradeAmount || config.tradeAmount < 1000) {
      newErrors.tradeAmount = "Trade amount must be at least ₹1,000";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onStart();
    }
  };

  // Dynamically populate asset options based on assetType
  const getAssetOptions = () => {
    switch (config.assetType) {
      case 'stocks':
        return [
          { value: 'RELIANCE', label: 'Reliance (RELIANCE)' },
          { value: 'TCS', label: 'TCS (TCS)' },
          { value: 'INFY', label: 'Infosys (INFY)' },
          { value: 'HDFCBANK', label: 'HDFC Bank (HDFCBANK)' }
        ];
      case 'crypto':
        return [
          { value: 'BTC-INR', label: 'Bitcoin (BTC)' },
          { value: 'ETH-INR', label: 'Ethereum (ETH)' },
          { value: 'BNB-INR', label: 'Binance Coin (BNB)' },
          { value: 'SOL-INR', label: 'Solana (SOL)' }
        ];
      case 'forex':
        return [
          { value: 'USD-INR', label: 'USD/INR' },
          { value: 'EUR-INR', label: 'EUR/INR' },
          { value: 'GBP-INR', label: 'GBP/INR' },
          { value: 'JPY-INR', label: 'JPY/INR' }
        ];
      default:
        return [];
    }
  };

  const handleTradeAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amount = parseInt(e.target.value);
    if (!isNaN(amount)) {
      onChange({ tradeAmount: amount });
      if (errors.tradeAmount) {
        setErrors(prev => ({ ...prev, tradeAmount: undefined }));
      }
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow mb-6">
      <CardHeader>
        <CardTitle>Simulation Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <Label htmlFor="asset-type">Asset Type</Label>
              <Select
                value={config.assetType}
                onValueChange={(value) => {
                  onChange({ assetType: value });
                  if (errors.assetType) {
                    setErrors(prev => ({ ...prev, assetType: undefined }));
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger id="asset-type" className="w-full">
                  <SelectValue placeholder="Select asset type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stocks">Stocks</SelectItem>
                  <SelectItem value="crypto">Cryptocurrency</SelectItem>
                  <SelectItem value="forex">Forex</SelectItem>
                </SelectContent>
              </Select>
              {errors.assetType && (
                <p className="text-sm text-red-500 mt-1">{errors.assetType}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="asset-name">Asset Name</Label>
              <Select
                value={config.assetName}
                onValueChange={(value) => {
                  onChange({ assetName: value });
                  if (errors.assetName) {
                    setErrors(prev => ({ ...prev, assetName: undefined }));
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger id="asset-name" className="w-full">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {getAssetOptions().map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assetName && (
                <p className="text-sm text-red-500 mt-1">{errors.assetName}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="time-period">Time Period</Label>
              <Select
                value={config.timePeriod}
                onValueChange={(value) => {
                  onChange({ timePeriod: value });
                  if (errors.timePeriod) {
                    setErrors(prev => ({ ...prev, timePeriod: undefined }));
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger id="time-period" className="w-full">
                  <SelectValue placeholder="Select time period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 Hours</SelectItem>
                  <SelectItem value="3d">3 Days</SelectItem>
                  <SelectItem value="1w">1 Week</SelectItem>
                  <SelectItem value="2w">2 Weeks</SelectItem>
                  <SelectItem value="1m">1 Month</SelectItem>
                </SelectContent>
              </Select>
              {errors.timePeriod && (
                <p className="text-sm text-red-500 mt-1">{errors.timePeriod}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="strategy">Trading Strategy</Label>
              <Select
                value={config.strategy}
                onValueChange={(value) => {
                  onChange({ strategy: value });
                  if (errors.strategy) {
                    setErrors(prev => ({ ...prev, strategy: undefined }));
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger id="strategy" className="w-full">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="macd">MACD Crossover</SelectItem>
                  <SelectItem value="rsi">RSI Oversold/Overbought</SelectItem>
                  <SelectItem value="sma">Simple Moving Average</SelectItem>
                  <SelectItem value="custom">Custom Strategy</SelectItem>
                </SelectContent>
              </Select>
              {errors.strategy && (
                <p className="text-sm text-red-500 mt-1">{errors.strategy}</p>
              )}
            </div>
          </div>
          
          <div className="mt-6">
            <Label htmlFor="trade-amount">Trade Amount (₹)</Label>
            <Input
              type="number"
              id="trade-amount"
              value={config.tradeAmount}
              onChange={handleTradeAmountChange}
              className="w-full md:w-1/3"
              disabled={disabled}
            />
            {errors.tradeAmount && (
              <p className="text-sm text-red-500 mt-1">{errors.tradeAmount}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Amount to invest in each trade (Minimum: ₹1,000)
            </p>
          </div>
          
          <div className="mt-6 flex items-center space-x-2">
            <Checkbox
              id="reinvest-profits"
              checked={config.reinvestProfits}
              onCheckedChange={(checked) => onChange({ reinvestProfits: !!checked })}
              disabled={disabled}
            />
            <Label htmlFor="reinvest-profits">Reinvest profits</Label>
          </div>
          
          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between">
            <Button 
              type="submit" 
              disabled={disabled || isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Simulation
            </Button>
            <div className="flex items-center text-sm text-gray-500 mt-3 md:mt-0">
              <i className="ri-information-line mr-1"></i>
              Simulations run with fake trades every 2 hours
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
