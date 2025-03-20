import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardProps {
  title: string;
  value: number;
  change?: number;
  prefix?: string;
  suffix?: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  valueColor?: string;
  loading?: boolean;
}

export default function StatsCard({
  title,
  value,
  change,
  prefix = "",
  suffix = "",
  description,
  icon,
  iconColor,
  valueColor = "",
  loading = false,
}: StatsCardProps) {
  // Format number to Indian format
  const formatIndianNumber = (num: number) => {
    const isNegative = num < 0;
    const absoluteValue = Math.abs(num);
    
    // Format to 2 decimal places if it has decimal part
    const formatted = Number.isInteger(absoluteValue) 
      ? absoluteValue.toString() 
      : absoluteValue.toFixed(2);
    
    // Add commas for Indian number system
    const parts = formatted.split('.');
    const lastThree = parts[0].length > 3 ? parts[0].substring(parts[0].length - 3) : parts[0];
    const otherNumbers = parts[0].length > 3 ? parts[0].substring(0, parts[0].length - 3) : '';
    
    const formattedNumber = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (otherNumbers ? ',' : '') + lastThree;
    
    return (isNegative ? '-' : '') + formattedNumber + (parts.length > 1 ? '.' + parts[1] : '');
  };
  
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-32 mt-1" />
            ) : (
              <h3 className={cn("text-2xl font-bold font-mono mt-1", valueColor)}>
                {prefix}{suffix === "₹" ? `${suffix}${formatIndianNumber(value)}` : `${formatIndianNumber(value)}${suffix}`}
              </h3>
            )}
          </div>
          <div className={cn("h-12 w-12 rounded-md flex items-center justify-center", iconColor)}>
            {icon}
          </div>
        </div>
        <div className="mt-2 flex items-center">
          {loading ? (
            <Skeleton className="h-4 w-36" />
          ) : (
            <>
              {change !== undefined && change !== 0 && (
                <span className={cn("text-sm font-medium flex items-center", 
                  change > 0 ? "text-green-500" : "text-red-500")}>
                  {change > 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                  {Math.abs(change).toFixed(1)}%
                </span>
              )}
              <span className="text-muted-foreground text-sm ml-2">{description}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
