// Pattern 9 — Analytics (operational): range first, filter, KPI strip, primary chart, detail table.
import { useCallback, useMemo, useState } from "react";
import { fetchChart, fetchWatchlist, searchSymbols } from "../api";
import { TimeSeriesChart } from "../components/charts/TimeSeriesChart";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { DataSourceBadge, ErrorState, MetricCard, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import {
  direction,
  directionArrow,
  formatDateTime,
  formatPrice,
  formatSignedNumber,
  formatSignedPercentPoints,
  formatTime,
} from "../lib/format";
import { useAuthedQuery, useVisiblePolling } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import { SYMBOL_RE } from "../lib/symbols";
import { SymbolCombobox } from "../components/ui/SymbolCombobox";

export const WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"];

const RANGES = [
  { id: "5d", label: "5D", interval: "1h", intraday: true },
  { id: "1mo", label: "1M", interval: "1d", intraday: false },
  { id: "3mo", label: "3M", interval: "1d", intraday: false },
  { id: "6mo", label: "6M", interval: "1d", intraday: false },
  { id: "1y", label: "1Y", interval: "1d", intraday: false },
] as const;

const section = SECTIONS.monitor;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";

export function MonitorPage() {
  const { token, handleAuthError } = useAuthed();
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("1mo");
  const [symbol, setSymbol] = useState(WATCHLIST[0]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[1];

  const symbols = useMemo(() => (WATCHLIST.includes(symbol) ? WATCHLIST : [...WATCHLIST, symbol]), [symbol]);
  const quotes = useAuthedQuery(
    async (authToken) => {
      const data = await fetchWatchlist(authToken, symbols);
      setLastRefresh(new Date());
      return data;
    },
    [symbols.join(",")],
    { action: "load quotes" },
  );
  const chart = useAuthedQuery((authToken) => fetchChart(authToken, symbol, { range: range.id, interval: range.interval }), [symbol, range.id], {
    action: `load the ${symbol} chart`,
  });
  useVisiblePolling(() => void quotes.reload(), 30_000);

  const selectedQuote = quotes.data?.find((quote) => quote.symbol === symbol);
  const windowStats = useMemo(() => {
    const points = chart.data?.points ?? [];
    if (!points.length) return null;
    return {
      high: Math.max(...points.map((point) => point.high)),
      low: Math.min(...points.map((point) => point.low)),
      first: points[0].close,
      last: points[points.length - 1].close,
    };
  }, [chart.data]);

  const remoteSearch = useCallback(
    async (term: string) => {
      try {
        return await searchSymbols(token, term);
      } catch (error) {
        handleAuthError(error);
        throw error;
      }
    },
    [token, handleAuthError],
  );

  const choose = (next: string) => {
    if (!SYMBOL_RE.test(next)) return;
    setSymbol(next.toUpperCase());
  };

  return (
    <div className="page">
      <SectionHeader
        section={section}
        actions={
          <button type="button" className="btn" onClick={() => void Promise.all([quotes.reload(), chart.reload()])}>
            <Icon name="refresh" />
            Refresh now
          </button>
        }
      />

      <section className="panel panel-body stack" aria-label="Filters">
        <div className="cluster" style={{ justifyContent: "space-between", gap: "var(--space-4)" }}>
          <div className="stack" style={{ gap: "var(--space-1)" }}>
            <span className="field-label">
              <LabelWithHint label="Range" text={featureText("range")}>
                Range
              </LabelWithHint>
            </span>
            <div className="segmented" role="group" aria-label="Chart range">
              {RANGES.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === rangeId} onClick={() => setRangeId(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: "1 1 280px", maxWidth: 420 }}>
            <SymbolCombobox
              id="monitor-symbol"
              label={
                <LabelWithHint label="Find a symbol" text={featureText("search")}>
                  Find a symbol
                </LabelWithHint>
              }
              value={query}
              onChange={setQuery}
              onSelect={choose}
              remoteSearch={remoteSearch}
              pickOnEnter
              clearOnSelect
            />
          </div>
        </div>
      </section>

      <section aria-label={`${symbol} key figures`} className="kpi-strip">
        <MetricCard
          label={`${symbol} last price`}
          value={selectedQuote ? formatPrice(selectedQuote.price) : quotes.loading ? <Skeleton height={28} width="60%" /> : "—"}
          sub={selectedQuote?.currency ?? undefined}
        />
        <MetricCard
          label="Change today"
          value={
            selectedQuote ? (
              <span className={direction(selectedQuote.change)}>
                {directionArrow(selectedQuote.change)} {formatSignedPercentPoints(selectedQuote.changePercent)}
              </span>
            ) : (
              "—"
            )
          }
          sub={selectedQuote ? `${formatSignedNumber(selectedQuote.change)} vs previous close` : undefined}
        />
        <MetricCard label={`${range.label} high / low`} value={windowStats ? `${formatPrice(windowStats.high)} / ${formatPrice(windowStats.low)}` : "—"} />
        <MetricCard
          label="Data source"
          hint={featureText("source")}
          value={selectedQuote?.source && selectedQuote.source !== "live" ? "Fallback" : selectedQuote ? "Live" : "—"}
          sub={selectedQuote ? <DataSourceBadge source={selectedQuote.source} updated={selectedQuote.updated} /> : undefined}
        />
      </section>

      <section className={`panel ${chart.refreshing ? "is-refreshing" : ""}`} aria-labelledby="chart-heading">
        <div className="panel-header">
          <h2 id="chart-heading" style={{ fontSize: "var(--text-h4)" }}>
            {symbol} · {range.label}
          </h2>
          <DataSourceBadge source={chart.data?.source} />
        </div>
        <div className="panel-body">
          {chart.error ? (
            <ErrorState message={chart.error} onRetry={() => void chart.reload()} />
          ) : chart.loading ? (
            <Skeleton height={340} />
          ) : chart.data?.points.length ? (
            <TimeSeriesChart
              candles={chart.data.points}
              intraday={range.intraday}
              currency={chart.data.currency}
              ariaLabel={`${symbol} candlestick chart for ${range.label}. Exact values are in the watchlist table below.`}
            />
          ) : (
            <p className="text-secondary">No price history came back for {symbol} in this range. Try a longer range.</p>
          )}
        </div>
      </section>

      <section className={`table-frame ${quotes.refreshing ? "is-refreshing" : ""}`} aria-labelledby="quotes-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="quotes-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Watchlist quotes" text={featureText("quotes")}>
              Watchlist quotes
            </LabelWithHint>
          </h2>
          <span className="text-meta num" aria-live="polite">
            Updated {formatTime(lastRefresh)} · refreshes every 30 s
          </span>
        </div>
        {quotes.error ? (
          <div className="panel-body">
            <ErrorState message={quotes.error} onRetry={() => void quotes.reload()} />
          </div>
        ) : quotes.loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col" className="right">
                    Price
                  </th>
                  <th scope="col" className="right">
                    Change
                  </th>
                  <th scope="col" className="right">
                    Change %
                  </th>
                  <th scope="col">Source</th>
                  <th scope="col">Quoted</th>
                </tr>
              </thead>
              <tbody>
                {(quotes.data ?? []).map((quote) => {
                  const dir = direction(quote.change);
                  return (
                    <tr key={quote.symbol} className={quote.symbol === symbol ? "is-selected" : undefined}>
                      <td>
                        <button
                          type="button"
                          className="row-select"
                          aria-pressed={quote.symbol === symbol}
                          aria-label={`Chart ${quote.symbol}`}
                          onClick={() => choose(quote.symbol)}
                        >
                          {quote.symbol}
                          <Icon name="chevronRight" className="icon chevron" />
                        </button>
                      </td>
                      <td className="right num">{formatPrice(quote.price)}</td>
                      <td className={`right num ${dir}`}>{formatSignedNumber(quote.change)}</td>
                      <td className={`right num ${dir}`}>
                        {directionArrow(quote.change)} {formatSignedPercentPoints(quote.changePercent)}
                      </td>
                      <td>{quote.source && quote.source !== "live" ? <DataSourceBadge source={quote.source} updated={quote.updated} /> : <span className="text-secondary">Live</span>}</td>
                      <td className="text-secondary num">{formatDateTime(quote.updated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
