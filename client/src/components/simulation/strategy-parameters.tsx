import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";

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

export default function StrategyParameters({ 
  params, 
  onChange, 
  onReset, 
  disabled 
}: StrategyParametersProps) {
  const handleNumberChange = (field: keyof StrategyParams, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      onChange({ [field]: value });
    }
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
          </div>
        </div>
        
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={onReset}
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
