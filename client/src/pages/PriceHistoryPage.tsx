// Pattern 9 — Analytics (analytical): range first, symbol filter, KPI strip, chart, detail table, Export in header.
import { useMemo, useState, type FormEvent } from "react";
import { fetchChart } from "../api";
import { TimeSeriesChart } from "../components/charts/TimeSeriesChart";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { DataSourceBadge, ErrorState, MetricCard, Pagination, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { formatCompact, formatDate, formatPrice, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { SYMBOL_RE } from "../lib/symbols";
import { SymbolCombobox } from "../components/ui/SymbolCombobox";

const RANGES = [
  { id: "1mo", label: "1M" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
] as const;
const PAGE_SIZE = 25;
const section = SECTIONS.prices;

function toCsv(symbol: string, rows: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume?: number | null }>) {
  const header = "date,open,high,low,close,volume";
  const body = rows.map((row) => [row.timestamp.slice(0, 10), row.open, row.high, row.low, row.close, row.volume ?? ""].join(","));
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${symbol}-daily.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PriceHistoryPage() {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("6mo");
  const [symbol, setSymbol] = useState("AAPL");
  const [draft, setDraft] = useState("AAPL");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[2];
  const chart = useAuthedQuery((token) => fetchChart(token, symbol, { range: range.id, interval: "1d" }), [symbol, range.id], {
    action: `load ${symbol} price history`,
  });
  const points = chart.data?.points ?? [];
  const newestFirst = useMemo(() => [...points].reverse(), [points]);
  const pageCount = Math.max(1, Math.ceil(newestFirst.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const closeLine = useMemo(
    () => [{ id: "close", label: "Close", colorVar: "--series-1", points: points.map((point) => ({ timestamp: point.timestamp, value: point.close })) }],
    [points],
  );

  const stats = useMemo(() => {
    if (!points.length) return null;
    const volumes = points.map((point) => point.volume).filter((value): value is number => typeof value === "number");
    return {
      periodReturn: points[points.length - 1].close / points[0].close - 1,
      high: Math.max(...points.map((point) => point.high)),
      low: Math.min(...points.map((point) => point.low)),
      avgVolume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : null,
      bars: points.length,
    };
  }, [points]);

  const applySymbol = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (!SYMBOL_RE.test(next)) {
      setDraftError("Pick a match from the list, or type a ticker like AAPL or RELIANCE.NS.");
      return;
    }
    setDraftError(null);
    setSymbol(next);
    setPage(0);
  };

  return (
    <div className="page">
      <SectionHeader
        section={section}
        showSteps={false}
        actions={
          <button type="button" className="btn" disabled={!points.length} onClick={() => toCsv(symbol, points)}>
            <Icon name="download" />
            Export CSV
          </button>
        }
      />

      <section className="panel panel-body cluster" aria-label="Filters" style={{ justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: "var(--space-1)" }}>
          <span className="field-label">Range</span>
          <div className="segmented" role="group" aria-label="History range">
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === rangeId}
                onClick={() => {
                  setRangeId(item.id);
                  setPage(0);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <form className="cluster" onSubmit={applySymbol} style={{ alignItems: "flex-end" }} noValidate>
          <div style={{ flex: "1 1 260px", maxWidth: 360 }}>
            <SymbolCombobox
              id="prices-symbol"
              label="Symbol"
              value={draft}
              onChange={(value) => {
                setDraft(value);
                if (draftError && SYMBOL_RE.test(value.trim())) setDraftError(null);
              }}
              onSelect={(value) => {
                setDraftError(null);
                setSymbol(value.toUpperCase());
                setPage(0);
              }}
              error={draftError ?? undefined}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Show history
          </button>
        </form>
      </section>

      <section aria-label="Summary" className={`kpi-strip ${chart.refreshing ? "is-refreshing" : ""}`}>
        {chart.loading ? (
          Array.from({ length: 4 }, (_, index) => (
            <div className="metric-card" key={index}>
              <Skeleton width="60%" />
              <Skeleton height={28} width="45%" />
            </div>
          ))
        ) : (
          <>
            <MetricCard label={`${range.label} return`} term="totalReturn" value={<span className={stats && stats.periodReturn >= 0 ? "up" : "down"}>{formatSignedFraction(stats?.periodReturn)}</span>} sub="First to last close" />
            <MetricCard label="High / low" value={stats ? `${formatPrice(stats.high)} / ${formatPrice(stats.low)}` : "—"} sub={chart.data?.currency ?? undefined} />
            <MetricCard label="Average volume" value={formatCompact(stats?.avgVolume)} sub="Shares per day" />
            <MetricCard label="Bars" value={stats?.bars ?? "—"} sub="Daily, adjusted" hint={section.features[0].hoverText} />
          </>
        )}
      </section>

      <section className={`panel ${chart.refreshing ? "is-refreshing" : ""}`} aria-labelledby="prices-chart-heading">
        <div className="panel-header">
          <h2 id="prices-chart-heading" style={{ fontSize: "var(--text-h4)" }}>
            {symbol} daily close · {range.label}
          </h2>
          <DataSourceBadge source={chart.data?.source} />
        </div>
        <div className="panel-body">
          {chart.error ? (
            <ErrorState message={chart.error} onRetry={() => void chart.reload()} />
          ) : chart.loading ? (
            <Skeleton height={340} />
          ) : points.length ? (
            <TimeSeriesChart
              ariaLabel={`${symbol} daily closing price over ${range.label}. Exact values are in the table below.`}
              currency={chart.data?.currency}
              lines={closeLine}
            />
          ) : (
            <p className="text-secondary">No bars came back for {symbol}. Check the symbol or try a longer range.</p>
          )}
        </div>
      </section>

      <section className="table-frame" aria-labelledby="bars-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="bars-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Adjusted prices" text={section.features[0].hoverText}>
              Daily bars
            </LabelWithHint>
          </h2>
          <span className="text-meta">Newest first</span>
        </div>
        {chart.loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" aria-sort="descending">
                    Date ↓
                  </th>
                  <th scope="col" className="right">Open</th>
                  <th scope="col" className="right">High</th>
                  <th scope="col" className="right">Low</th>
                  <th scope="col" className="right">Close</th>
                  <th scope="col" className="right">Volume</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((point) => (
                  <tr key={point.timestamp}>
                    <td className="num">{formatDate(point.timestamp)}</td>
                    <td className="right num">{formatPrice(point.open)}</td>
                    <td className="right num">{formatPrice(point.high)}</td>
                    <td className="right num">{formatPrice(point.low)}</td>
                    <td className="right num">{formatPrice(point.close)}</td>
                    <td className="right num">{formatCompact(point.volume ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={safePage} pageCount={pageCount} total={newestFirst.length} pageSize={PAGE_SIZE} onPage={setPage} noun="bars" />
      </section>
    </div>
  );
}
