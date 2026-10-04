import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartPoint } from "../../types";
import { cssVar, useThemeVersion } from "../../lib/theme";
import { formatFraction, formatMoney, formatPrice } from "../../lib/format";

export interface LineSeriesInput {
  id: string;
  label: string;
  /** CSS custom property holding the series colour, e.g. "--series-1". */
  colorVar: string;
  points: Array<{ timestamp: string; value: number }>;
  /** "area" draws a 10% wash under the line (e.g. drawdown). */
  kind?: "line" | "area";
}

export type ChartValueFormat = "price" | "percent" | "money";

interface TimeSeriesChartProps {
  candles?: ChartPoint[];
  lines?: LineSeriesInput[];
  intraday?: boolean;
  size?: "normal" | "small";
  /** Accessible summary of what the chart shows (the table view carries exact values). */
  ariaLabel: string;
  currency?: string | null;
  /** How values are shown on the axis and in the readout. */
  valueFormat?: ChartValueFormat;
}

function formatterFor(format: ChartValueFormat, currency?: string | null): (value: number | undefined) => string {
  if (format === "percent") return (value) => formatFraction(value, 1);
  if (format === "money") return (value) => formatMoney(value, currency || "USD");
  return (value) => formatPrice(value);
}

// Stable default: a fresh [] per render would re-trigger the chart effects endlessly.
const NO_LINES: LineSeriesInput[] = [];

function toTime(timestamp: string): UTCTimestamp {
  return Math.floor(Date.parse(timestamp) / 1000) as UTCTimestamp;
}

/** lightweight-charts needs strictly ascending, unique times. */
function normalise<T extends { time: UTCTimestamp }>(rows: T[]): T[] {
  const sorted = rows.filter((row) => Number.isFinite(row.time)).sort((a, b) => a.time - b.time);
  const unique: T[] = [];
  for (const row of sorted) {
    if (unique.length && unique[unique.length - 1].time === row.time) unique[unique.length - 1] = row;
    else unique.push(row);
  }
  return unique;
}

interface Readout {
  candle?: { open: number; high: number; low: number; close: number };
  lines: Record<string, number | undefined>;
  time?: number;
}

/**
 * Price/indicator chart. Candles: up bars are hollow and down bars filled, so direction reads
 * without colour. The readout above the plot doubles as the legend and lists every series at
 * the hovered time (latest bar otherwise). Times are shown in UTC.
 */
export function TimeSeriesChart({ candles, lines = NO_LINES, intraday, size = "normal", ariaLabel, currency, valueFormat = "price" }: TimeSeriesChartProps) {
  const format = useMemo(() => formatterFor(valueFormat, currency), [valueFormat, currency]);
  const containerRef = useRef<HTMLDivElement>(null);
  const themeVersion = useThemeVersion();
  const [readout, setReadout] = useState<Readout>({ lines: {} });
  const latestRef = useRef<Readout>({ lines: {} });

  const candleData = useMemo(
    () =>
      normalise(
        (candles ?? []).map((point) => ({
          time: toTime(point.timestamp),
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
        })),
      ),
    [candles],
  );
  const lineData = useMemo(
    () =>
      lines.map((series) => ({
        ...series,
        data: normalise(series.points.map((point) => ({ time: toTime(point.timestamp), value: point.value }))),
      })),
    [lines],
  );

  const latestReadout = useMemo<Readout>(() => {
    const lastCandle = candleData.at(-1);
    const values: Record<string, number | undefined> = {};
    for (const series of lineData) values[series.id] = series.data.at(-1)?.value;
    return { candle: lastCandle, lines: values, time: lastCandle?.time ?? lineData[0]?.data.at(-1)?.time };
  }, [candleData, lineData]);

  useEffect(() => {
    latestRef.current = latestReadout;
    setReadout(latestReadout);
  }, [latestReadout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: cssVar("--chart-surface") },
        textColor: cssVar("--chart-text"),
        fontFamily: cssVar("--font-sans"),
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: cssVar("--chart-grid") },
      },
      rightPriceScale: { borderColor: cssVar("--chart-axis") },
      timeScale: { borderColor: cssVar("--chart-axis"), timeVisible: Boolean(intraday), secondsVisible: false },
      crosshair: { mode: CrosshairMode.Magnet },
    });

    const lineApis = new Map<string, ReturnType<IChartApi["addSeries"]>>();
    let candleApi: ReturnType<IChartApi["addSeries"]> | null = null;

    if (candleData.length) {
      const up = cssVar("--candle-up");
      const down = cssVar("--candle-down");
      candleApi = chart.addSeries(CandlestickSeries, {
        upColor: "rgba(0,0,0,0)",
        borderUpColor: up,
        wickUpColor: up,
        downColor: down,
        borderDownColor: down,
        wickDownColor: down,
        borderVisible: true,
        priceLineVisible: false,
      });
      candleApi.setData(candleData);
    }
    const priceFormat =
      valueFormat === "price" ? undefined : { type: "custom" as const, formatter: (value: number) => format(value), minMove: 0.0001 };
    for (const series of lineData) {
      const color = cssVar(series.colorVar);
      const common = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4, ...(priceFormat ? { priceFormat } : {}) };
      const api =
        series.kind === "area"
          ? chart.addSeries(AreaSeries, { ...common, lineColor: color, lineWidth: 2, topColor: `${color}1a`, bottomColor: `${color}1a` })
          : chart.addSeries(LineSeries, { ...common, color, lineWidth: 2 });
      api.setData(series.data);
      lineApis.set(series.id, api);
    }
    chart.timeScale().fitContent();

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setReadout(latestRef.current);
        return;
      }
      const next: Readout = { lines: {}, time: param.time as number };
      if (candleApi) {
        const bar = param.seriesData.get(candleApi) as Readout["candle"] | undefined;
        if (bar) next.candle = bar;
      }
      for (const [id, api] of lineApis) {
        const point = param.seriesData.get(api) as { value?: number } | undefined;
        next.lines[id] = point?.value;
      }
      setReadout(next);
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [candleData, lineData, intraday, themeVersion, valueFormat, format]);

  const readoutTime = readout.time
    ? new Date(readout.time * 1000).toLocaleString(undefined, {
        timeZone: "UTC",
        dateStyle: "medium",
        ...(intraday ? { timeStyle: "short" } : {}),
      })
    : null;

  return (
    <figure className="stack" style={{ gap: "var(--space-2)", margin: 0 }}>
      <div className="chart-legend" aria-live="off">
        {readoutTime ? <span className="text-meta num">{readoutTime} UTC</span> : null}
        {readout.candle ? (
          <span className="legend-item num">
            O <span className="legend-value">{formatPrice(readout.candle.open)}</span> H{" "}
            <span className="legend-value">{formatPrice(readout.candle.high)}</span> L{" "}
            <span className="legend-value">{formatPrice(readout.candle.low)}</span> C{" "}
            <span className="legend-value">{formatPrice(readout.candle.close, currency)}</span>
          </span>
        ) : null}
        {lineData.map((series) => (
          <span className="legend-item" key={series.id}>
            <span className="legend-key" style={{ background: `var(${series.colorVar})` }} aria-hidden="true" />
            {series.label}
            <span className="legend-value">{format(readout.lines[series.id])}</span>
          </span>
        ))}
      </div>
      <div ref={containerRef} className={`chart-box ${size === "small" ? "small" : ""}`} role="img" aria-label={ariaLabel} />
      {candleData.length ? (
        <figcaption className="chart-caption">Hollow candles closed higher than they opened; filled candles closed lower. Times in UTC.</figcaption>
      ) : (
        <figcaption className="chart-caption">Times in UTC.</figcaption>
      )}
    </figure>
  );
}
