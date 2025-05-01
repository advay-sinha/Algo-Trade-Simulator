import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type MetricsCardProps = {
  title: string;
  value: string;
  change: string;
  changePercent: string;
  changeType: "increase" | "decrease" | "neutral";
  timePeriod: string;
  icon: string;
  iconColor: string;
  iconBgColor: string;
  isLoading: boolean;
};

export default function MetricsCard({
  title,
  value,
  change,
  changePercent,
  changeType,
  timePeriod,
  icon,
  iconColor,
  iconBgColor,
  isLoading,
}: MetricsCardProps) {
  const changeTextColor = changeType === "increase" 
    ? "text-green-600" 
    : changeType === "decrease" 
      ? "text-red-600" 
      : "text-gray-600";

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <Skeleton className="h-8 w-28 mb-3" />
        <Skeleton className="h-4 w-40" />
      </Card>
    );
  }

  return (
    <Card className="p-5 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <h3 className="text-2xl font-bold font-mono text-gray-900">{value}</h3>
        </div>
        <div className={`p-3 rounded-full ${iconBgColor}`}>
          <i className={`${icon} text-xl ${iconColor}`}></i>
        </div>
      </div>
      <div className="flex items-center mt-4">
        <span className={`text-sm font-medium ${changeTextColor} mr-1`}>
          {change} {changePercent && `(${changePercent})`}
        </span>
        <i className={`${
          changeType === "increase" 
            ? "ri-arrow-up-s-line text-green-600" 
            : changeType === "decrease" 
              ? "ri-arrow-down-s-line text-red-600" 
              : ""
        }`}></i>
        <span className="text-xs text-gray-500 ml-auto">{timePeriod}</span>
      </div>
    </Card>
  );
}
