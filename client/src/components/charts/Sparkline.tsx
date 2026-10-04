import type { SparklinePoint } from "../../types";

/** Tiny single-series trend line (2px, series-1). Exact values live in tables elsewhere. */
export function Sparkline({ points, label }: { points: SparklinePoint[]; label: string }) {
  if (points.length < 2) {
    return <span className="text-meta">Not enough data</span>;
  }
  const width = 200;
  const height = 48;
  const pad = 3;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const coords = closes.map((close, index) => {
    const x = pad + (index / (closes.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (close - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
