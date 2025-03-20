import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format number to Indian currency format (₹)
export function formatIndianCurrency(amount: number): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  
  return formatter.format(amount);
}

// Format large numbers with K, M, B suffixes
export function formatCompactNumber(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toString();
}

// Format time ago
export function formatTimeAgo(timestamp: string | Date): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

// Get symbol display name
export function getSymbolDisplayName(symbol: string): string {
  const symbolMap: Record<string, string> = {
    "NIFTY50.NS": "NIFTY 50",
    "SENSEX.BO": "BSE SENSEX",
    "HDFCBANK.NS": "HDFC Bank",
    "RELIANCE.NS": "Reliance",
    "TCS.NS": "TCS",
    "INFY.NS": "Infosys",
    "BTCINR=X": "Bitcoin/INR",
    "ETHINR=X": "Ethereum/INR"
  };
  
  return symbolMap[symbol] || symbol;
}

// Format percentage with sign
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0.00%";
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
