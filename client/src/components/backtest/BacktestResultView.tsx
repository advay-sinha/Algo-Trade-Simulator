import { useMemo, useState } from "react";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { DataSourceBadge, MetricCard, Notice, Pagination } from "../ui/primitives";
import { formatDate, formatFraction, formatInteger, formatMoney, formatPrice, formatSignedFraction } from "../../lib/format";
import type { BacktestRecord, BacktestTrade } from "../../types";

const TRADE_PAGE = 15;

/** Headline figures (≤ 5 tiles). */
export function BacktestKpis({ record }: { record: BacktestRecord }) {
  const s = record.summary;
  const currency = record.currency || "USD";
  return (
    <section aria-label="Backtest results" className="kpi-strip">
      <MetricCard label="Final equity" term="finalEquity" value={formatMoney(s.finalEquity, currency)} sub={`from ${formatMoney(s.startingCapital, currency)}`} />
      <MetricCard
        label="Total return"
        term="totalReturn"
        value={<span className={s.totalReturn >= 0 ? "up" : "down"}>{formatSignedFraction(s.totalReturn)}</span>}
        sub={`Buy-and-hold ${formatSignedFraction(s.buyHoldReturn)}`}
      />
      <MetricCard
        label="vs buy-and-hold"
        term="excessReturn"
        value={<span className={s.excessReturn >= 0 ? "up" : "down"}>{formatSignedFraction(s.excessReturn)}</span>}
        sub="Same symbol, window, and costs"
      />
      <MetricCard label="Max drawdown" term="maxDrawdown" value={formatFraction(s.maxDrawdown)} sub="Of the equity curve" />
      <MetricCard
        label="Closed trades"
        term="closedTrades"
        value={formatInteger(s.tradeCount)}
        sub={`${s.winningTrades} profitable · ${formatFraction(s.exposure, 0)} time in market${s.openPosition ? " · 1 open" : ""}`}
      />
    </section>
  );
}

export function BacktestCharts({ record }: { record: BacktestRecord }) {
  const equityLines = useMemo(
    () => [
      { id: "strategy", label: record.strategy.name, colorVar: "--series-1", points: record.equity },
      { id: "buyhold", label: `Buy-and-hold ${record.symbol}`, colorVar: "--series-2", points: record.buyHold },
      ...(record.benchmarkEquity?.length && record.risk?.benchmark.available
        ? [{ id: "benchmark", label: `${record.risk.benchmark.symbol} (scaled)`, colorVar: "--series-3", points: record.benchmarkEquity }]
        : []),
    ],
    [record],
  );
  const drawdownLines = useMemo(() => [{ id: "drawdown", label: "Drawdown", colorVar: "--series-1", points: record.drawdown, kind: "area" as const }], [record]);
  return (
    <>
      <section className="panel" aria-labelledby="equity-heading">
        <div className="panel-header">
          <h2 id="equity-heading" style={{ fontSize: "var(--text-h4)" }}>
            {record.risk?.benchmark.available ? `Equity vs buy-and-hold vs ${record.risk.benchmark.symbol}` : "Equity vs buy-and-hold"}
          </h2>
          <DataSourceBadge source={record.dataSource} />
        </div>
        <div className="panel-body">
          <TimeSeriesChart
            lines={equityLines}
            valueFormat="money"
            currency={record.currency}
            ariaLabel={`Equity curve of ${record.strategy.name} on ${record.symbol} compared with buy-and-hold. Final values are in the summary above.`}
          />
        </div>
      </section>
      <section className="panel" aria-labelledby="drawdown-heading">
        <div className="panel-header">
          <h2 id="drawdown-heading" style={{ fontSize: "var(--text-h4)" }}>
            Drawdown
          </h2>
        </div>
        <div className="panel-body">
          <TimeSeriesChart
            lines={drawdownLines}
            valueFormat="percent"
            size="small"
            ariaLabel={`Drawdown of the strategy's equity from its running peak; the worst point is ${formatFraction(record.summary.maxDrawdown)}.`}
          />
        </div>
      </section>
    </>
  );
}

export function TradesTable({ trades, currency }: { trades: BacktestTrade[]; currency?: string | null }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(trades.length / TRADE_PAGE));
  const visible = trades.slice(page * TRADE_PAGE, (page + 1) * TRADE_PAGE);
  return (
    <section className="table-frame" aria-labelledby="trades-heading">
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 id="trades-heading" style={{ fontSize: "var(--text-h4)" }}>
          Trade log
        </h2>
        <span className="text-meta">Fill prices include slippage; PnL includes costs</span>
      </div>
      {trades.length === 0 ? (
        <div className="state-block">
          <h3 style={{ fontSize: "var(--text-body)" }}>No trades in this window</h3>
          <p>The strategy never signalled an entry. Try a longer range or different parameters.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Entry</th>
                <th scope="col" className="right">Entry price</th>
                <th scope="col">Exit</th>
                <th scope="col" className="right">Exit price</th>
                <th scope="col" className="right">Shares</th>
                <th scope="col" className="right">PnL</th>
                <th scope="col" className="right">Return</th>
                <th scope="col" className="right">Costs</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((trade) => (
                <tr key={trade.entryTime}>
                  <td className="num">{formatDate(trade.entryTime)}</td>
                  <td className="right num">{formatPrice(trade.entryPrice)}</td>
                  <td className="num">{trade.open ? <span className="text-secondary">Open · marked at last close</span> : formatDate(trade.exitTime)}</td>
                  <td className="right num">{formatPrice(trade.exitPrice)}</td>
                  <td className="right num">{formatInteger(trade.shares)}</td>
                  <td className={`right num ${trade.pnl >= 0 ? "up" : "down"}`}>{formatMoney(trade.pnl, currency || "USD")}</td>
                  <td className={`right num ${trade.returnPct >= 0 ? "up" : "down"}`}>{formatSignedFraction(trade.returnPct)}</td>
                  <td className="right num text-secondary">{formatMoney(trade.costs, currency || "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} total={trades.length} pageSize={TRADE_PAGE} onPage={setPage} noun="trades" />
    </section>
  );
}

export function AssumptionsList({ record }: { record: BacktestRecord }) {
  return (
    <div className="stack">
      {record.dataSource !== "live" ? (
        <Notice tone="warn" icon="alert">
          This run used fallback ({record.dataSource}) prices because the provider was unreachable. Its results don't describe real market history.
        </Notice>
      ) : null}
      <div className="table-frame">
        <dl style={{ margin: 0 }}>
          {Object.entries(record.assumptions).map(([key, text]) => (
            <div className="list-row" key={key} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main">
                <dt className="list-row-title" style={{ textTransform: "capitalize" }}>
                  {key}
                </dt>
                <dd style={{ margin: 0 }} className="text-secondary">
                  {text}
                </dd>
              </div>
            </div>
          ))}
          <div className="list-row" style={{ alignItems: "flex-start" }}>
            <div className="list-row-main">
              <dt className="list-row-title">Configuration</dt>
              <dd style={{ margin: 0 }} className="text-secondary">
                {Object.entries(record.strategy.params)
                  .map(([name, value]) => `${name} = ${value}`)
                  .join(", ")}{" "}
                · capital {formatMoney(record.config.startingCapital, record.currency || "USD")} · costs {record.config.costBps} bps · slippage{" "}
                {record.config.slippageBps} bps · {record.period.bars} daily bars
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </div>
  );
}
