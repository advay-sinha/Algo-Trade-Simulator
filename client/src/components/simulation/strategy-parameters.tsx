import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

// Define the StrategyParams type to match the simulation-page
type StrategyParams = {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  buyThreshold: number;
  sellThreshold: number;
  stopLoss: number;
};

type StrategyParametersProps = {
  params: StrategyParams;
  onChange: (params: Partial<StrategyParams>) => void;
  onReset: () => void;
  disabled: boolean;
};

const DEFAULT_PARAMS: StrategyParams = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  buyThreshold: 0.5,
  sellThreshold: -0.5,
  stopLoss: 2.0
};

export default function StrategyParameters({ 
  params, 
  onChange, 
  onReset, 
  disabled 
}: StrategyParametersProps) {
  const [errors, setErrors] = useState<Partial<Record<keyof StrategyParams, string>>>({});

  const validateParam = (field: keyof StrategyParams, value: number): string | undefined => {
    switch (field) {
      case 'fastPeriod':
        return value < 1 ? "Fast period must be at least 1" : undefined;
      case 'slowPeriod':
        return value < params.fastPeriod ? "Slow period must be greater than fast period" : undefined;
      case 'signalPeriod':
        return value < 1 ? "Signal period must be at least 1" : undefined;
      case 'buyThreshold':
        return value <= 0 ? "Buy threshold must be positive" : undefined;
      case 'sellThreshold':
        return value >= 0 ? "Sell threshold must be negative" : undefined;
      case 'stopLoss':
        return value <= 0 ? "Stop loss must be positive" : undefined;
      default:
        return undefined;
    }
  };

  const handleNumberChange = (field: keyof StrategyParams, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      const error = validateParam(field, value);
      if (error) {
        setErrors(prev => ({ ...prev, [field]: error }));
      } else {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
      onChange({ [field]: value });
    }
  };

  const handleReset = () => {
    setErrors({});
    onReset();
  };

  return (
    <Card className="bg-white rounded-lg shadow mb-6">
      <CardHeader>
        <CardTitle>Strategy Parameters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <Label htmlFor="fast-period">Fast Period</Label>
            <Input
              type="number"
              id="fast-period"
              value={params.fastPeriod}
              onChange={(e) => handleNumberChange('fastPeriod', e)}
              className="w-full"
              disabled={disabled}
            />
            {errors.fastPeriod && (
              <p className="text-sm text-red-500 mt-1">{errors.fastPeriod}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="slow-period">Slow Period</Label>
            <Input
              type="number"
              id="slow-period"
              value={params.slowPeriod}
              onChange={(e) => handleNumberChange('slowPeriod', e)}
              className="w-full"
              disabled={disabled}
            />
            {errors.slowPeriod && (
              <p className="text-sm text-red-500 mt-1">{errors.slowPeriod}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="signal-period">Signal Period</Label>
            <Input
              type="number"
              id="signal-period"
              value={params.signalPeriod}
              onChange={(e) => handleNumberChange('signalPeriod', e)}
              className="w-full"
              disabled={disabled}
            />
            {errors.signalPeriod && (
              <p className="text-sm text-red-500 mt-1">{errors.signalPeriod}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="buy-threshold">Buy Threshold</Label>
            <Input
              type="number"
              id="buy-threshold"
              value={params.buyThreshold}
              onChange={(e) => handleNumberChange('buyThreshold', e)}
              step="0.01"
              className="w-full"
              disabled={disabled}
            />
            {errors.buyThreshold && (
              <p className="text-sm text-red-500 mt-1">{errors.buyThreshold}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="sell-threshold">Sell Threshold</Label>
            <Input
              type="number"
              id="sell-threshold"
              value={params.sellThreshold}
              onChange={(e) => handleNumberChange('sellThreshold', e)}
              step="0.01"
              className="w-full"
              disabled={disabled}
            />
            {errors.sellThreshold && (
              <p className="text-sm text-red-500 mt-1">{errors.sellThreshold}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="stop-loss">Stop Loss (%)</Label>
            <Input
              type="number"
              id="stop-loss"
              value={params.stopLoss}
              onChange={(e) => handleNumberChange('stopLoss', e)}
              step="0.5"
              className="w-full"
              disabled={disabled}
            />
            {errors.stopLoss && (
              <p className="text-sm text-red-500 mt-1">{errors.stopLoss}</p>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={disabled}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
