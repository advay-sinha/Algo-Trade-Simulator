import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

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
  // Dynamically populate asset options based on assetType
  const getAssetOptions = () => {
    switch (config.assetType) {
      case 'stocks':
        return [
          { value: 'reliance', label: 'Reliance (RELIANCE)' },
          { value: 'tcs', label: 'TCS (TCS)' },
          { value: 'infosys', label: 'Infosys (INFY)' },
          { value: 'hdfc', label: 'HDFC Bank (HDFCBANK)' }
        ];
      case 'crypto':
        return [
          { value: 'bitcoin', label: 'Bitcoin (BTC)' },
          { value: 'ethereum', label: 'Ethereum (ETH)' },
          { value: 'binancecoin', label: 'Binance Coin (BNB)' },
          { value: 'solana', label: 'Solana (SOL)' }
        ];
      case 'forex':
        return [
          { value: 'usdinr', label: 'USD/INR' },
          { value: 'eurinr', label: 'EUR/INR' },
          { value: 'gbpinr', label: 'GBP/INR' },
          { value: 'jpyinr', label: 'JPY/INR' }
        ];
      default:
        return [];
    }
  };

  const handleTradeAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amount = parseInt(e.target.value);
    if (!isNaN(amount)) {
      onChange({ tradeAmount: amount });
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow mb-6">
      <CardHeader>
        <CardTitle>Simulation Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <Label htmlFor="asset-type">Asset Type</Label>
              <Select
                value={config.assetType}
                onValueChange={(value) => onChange({ assetType: value })}
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
            </div>
            
            <div>
              <Label htmlFor="asset-name">Asset Name</Label>
              <Select
                value={config.assetName}
                onValueChange={(value) => onChange({ assetName: value })}
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
            </div>
            
            <div>
              <Label htmlFor="time-period">Time Period</Label>
              <Select
                value={config.timePeriod}
                onValueChange={(value) => onChange({ timePeriod: value })}
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
            </div>
            
            <div>
              <Label htmlFor="strategy">Trading Strategy</Label>
              <Select
                value={config.strategy}
                onValueChange={(value) => onChange({ strategy: value })}
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
            <p className="mt-1 text-xs text-gray-500">
              Amount to invest in each trade (Default: ₹10,000)
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
              Simulations run with fake trades of ₹10,000 every 2 hours
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
