// Single place for number/date formatting so units stay consistent across the console.

const DASH = "—";

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatPrice(value: number | null | undefined, currency?: string | null): string {
  if (!isFiniteNumber(value)) return DASH;
  const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (!isFiniteNumber(value)) return DASH;
  try {
    return value.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}

export function formatCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return DASH;
  return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

export function formatInteger(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return DASH;
  return Math.round(value).toLocaleString();
}

/** Ratios from the API are fractions (0.12 → "12.00%"). */
export function formatFraction(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedFraction(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return DASH;
  const pct = value * 100;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(digits)}%`;
}

/** Quote change percentages already arrive in percent units (1.5 = 1.5%). */
export function formatSignedPercentPoints(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return DASH;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function formatSignedNumber(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return DASH;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
}

export function direction(value: number | null | undefined): "up" | "down" | "flat" {
  if (!isFiniteNumber(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function directionArrow(value: number | null | undefined): string {
  const dir = direction(value);
  return dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function formatTime(date: Date | null): string {
  if (!date) return DASH;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}
