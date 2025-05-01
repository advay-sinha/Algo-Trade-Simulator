import { Card, CardContent } from "@/components/ui/card";

interface Strategy {
  id: number;
  name: string;
  description: string;
  timeFrame: string;
  successRate: string;
  bestMarketCondition: string;
  riskRating: string;
}

interface StrategyDescriptionProps {
  strategy: Strategy;
}

export default function StrategyDescription({ strategy }: StrategyDescriptionProps) {
  return (
    <Card className="shadow-md">
      <CardContent className="p-5">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{strategy.name}</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
          <p>{strategy.description}</p>
        </div>
        <div className="mt-5">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Time Frame</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{strategy.timeFrame}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Typical Success Rate</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{strategy.successRate}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Best Market Condition</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{strategy.bestMarketCondition}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Risk Rating</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{strategy.riskRating}</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
