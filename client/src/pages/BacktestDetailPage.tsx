// Pattern 2 — Detail / Record: one saved backtest; status + metadata, tabs that load on their own.
import * as Tabs from "@radix-ui/react-tabs";
import { Link, useParams } from "react-router-dom";
import { fetchBacktest, fetchBacktestTrades } from "../api";
import { AssumptionsList, BacktestCharts, BacktestKpis, TradesTable } from "../components/backtest/BacktestResultView";
import { RiskPanel } from "../components/backtest/RiskPanel";
import { Icon } from "../components/ui/Icon";
import { DataSourceBadge, EmptyState, ErrorState, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { formatDate, formatDateTime } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";

function TradesTab({ id, currency }: { id: string; currency?: string | null }) {
  const trades = useAuthedQuery((token) => fetchBacktestTrades(token, id), [id], { action: "load the trade log" });
  if (trades.error) return <ErrorState message={trades.error} onRetry={() => void trades.reload()} />;
  if (trades.loading) return <SkeletonRows rows={5} />;
  return <TradesTable trades={trades.data ?? []} currency={currency} />;
}

export function BacktestDetailPage() {
  const { backtestId = "" } = useParams();
  const record = useAuthedQuery((token) => fetchBacktest(token, backtestId), [backtestId], { action: "load this backtest" });

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={SECTIONS.backtests.route}>Backtests</Link>
        </li>
        <li aria-current="page">{record.data ? `${record.data.symbol} run` : "Saved run"}</li>
      </ol>
    </nav>
  );

  if (record.error) {
    return (
      <div className="page">
        {breadcrumb}
        {/404|couldn't find/i.test(record.error) ? (
          <EmptyState
            icon="search"
            title="This backtest isn't available"
            body="It may have been created on another account, or the server's in-memory storage was reset."
            action={
              <Link to={SECTIONS.backtests.route} className="btn btn-primary">
                Run a new backtest
              </Link>
            }
          />
        ) : (
          <ErrorState message={record.error} onRetry={() => void record.reload()} />
        )}
      </div>
    );
  }
  if (record.loading || !record.data) {
    return (
      <div className="page">
        {breadcrumb}
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const data = record.data;
  return (
    <div className="page">
      <header className="section-header">
        <div className="section-header-top">
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {breadcrumb}
            <div className="section-title-row">
              <h1>
                {data.symbol} · {data.strategy.name}
              </h1>
              <DataSourceBadge source={data.dataSource} />
            </div>
            <p className="text-secondary">
              {formatDate(data.period.start)} – {formatDate(data.period.end)} · {data.period.bars} daily bars · costs {data.config.costBps} bps · slippage{" "}
              {data.config.slippageBps} bps · run {formatDateTime(data.createdAt)}
            </p>
          </div>
          <div className="section-actions">
            <Link to={`${SECTIONS.backtests.route}?symbol=${encodeURIComponent(data.symbol)}&strategy=${encodeURIComponent(data.strategy.id)}`} className="btn">
              <Icon name="refresh" />
              Run again with changes
            </Link>
          </div>
        </div>
      </header>

      <Tabs.Root defaultValue="performance">
        <Tabs.List className="tabs-list" aria-label="Backtest sections">
          <Tabs.Trigger className="tabs-trigger" value="performance">
            Performance
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="risk">
            Risk
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="trades">
            Trades{typeof data.tradeCount === "number" ? ` (${data.tradeCount})` : ""}
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="assumptions">
            Assumptions
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="tabs-content stack-lg" value="performance">
          <BacktestKpis record={data} />
          <BacktestCharts record={data} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="risk">
          {data.risk ? (
            <RiskPanel risk={data.risk} strategyName={data.strategy.name} symbol={data.symbol} />
          ) : (
            <EmptyState
              title="No risk report for this run"
              body="This backtest was created before risk analytics existed. Run it again to get Sharpe, Sortino, beta, and the benchmark comparison."
              action={
                <Link to={`${SECTIONS.backtests.route}?symbol=${encodeURIComponent(data.symbol)}&strategy=${encodeURIComponent(data.strategy.id)}`} className="btn btn-primary">
                  Run it again
                </Link>
              }
            />
          )}
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="trades">
          <TradesTab id={data.id} currency={data.currency} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="assumptions">
          <AssumptionsList record={data} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
