import {
  CreditCard,
  ChartLine,
  Bot,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

type StatsCardProps = {
  title: string;
  value: string | number;
  change?: string | number;
  changeType?: "positive" | "negative" | "neutral";
  icon: "portfolio" | "pnl" | "strategies" | "trades";
};

export function StatsCard({ title, value, change, changeType = "neutral", icon }: StatsCardProps) {
  // Determine the icon to display
  const getIcon = () => {
    switch (icon) {
      case "portfolio":
        return <CreditCard className="text-primary" />;
      case "pnl":
        return <ChartLine className="text-green-600 dark:text-green-400" />;
      case "strategies":
        return <Bot className="text-amber-600 dark:text-amber-400" />;
      case "trades":
        return <ArrowLeftRight className="text-blue-600 dark:text-blue-400" />;
      default:
        return <CreditCard className="text-primary" />;
    }
  };

  // Get background color for the icon container
  const getBgColor = () => {
    switch (icon) {
      case "portfolio":
        return "bg-primary-100 dark:bg-primary-900";
      case "pnl":
        return "bg-green-100 dark:bg-green-900";
      case "strategies":
        return "bg-amber-100 dark:bg-amber-900";
      case "trades":
        return "bg-blue-100 dark:bg-blue-900";
      default:
        return "bg-primary-100 dark:bg-primary-900";
    }
  };

  // Get change icon and color
  const getChangeContent = () => {
    if (!change) return null;
    
    const color = changeType === "positive" 
      ? "text-green-600 dark:text-green-400" 
      : changeType === "negative" 
        ? "text-red-600 dark:text-red-400" 
        : "text-gray-500 dark:text-gray-400";
    
    const changeIcon = changeType === "positive" 
      ? <TrendingUp className="h-4 w-4" /> 
      : changeType === "negative" 
        ? <TrendingDown className="h-4 w-4" /> 
        : null;
    
    return (
      <div className={`ml-2 flex items-baseline text-sm font-semibold ${color}`}>
        {changeIcon}
        <span className="ml-1">{change}</span>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md p-3 ${getBgColor()}`}>
            {getIcon()}
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
                {getChangeContent()}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
