/**
 * Format a number as Indian Rupees currency string
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '₹0';
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format a percentage value with + or - sign
 */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0%';
  }
  
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format a date to a readable string
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date to include time
 */
export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a volume number with abbreviations (K, M, B)
 */
export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toString();
}

/**
 * Format market cap with abbreviations (K, M, B, T)
 */
export function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `₹${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `₹${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `₹${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `₹${(value / 1_000).toFixed(2)}K`;
  }
  return `₹${value}`;
}
