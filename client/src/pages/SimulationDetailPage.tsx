// Pattern 2 — Detail / Record: one paper simulation, evaluated live; tabs for performance, fills, metrics, assumptions.
import * as Tabs from "@radix-ui/react-tabs";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchChart, fetchRunnableStrategies, fetchSimulation, fetchSimulationReport, updateSimulation } from "../api";
import { TimeSeriesChart, type ChartMarker } from "../components/charts/TimeSeriesChart";
import { Icon } from "../components/ui/Icon";
import { InfoHint } from "../components/ui/InfoHint";
import { ConfirmDialog } from "../components/ui/overlays";
import { DataSourceBadge, EmptyState, ErrorState, MetricCard, Notice, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import {
  direction,
  directionArrow,
  formatDate,
  formatDateTime,
  formatFraction,
  formatPrice,
  formatSignedFraction,
  formatSignedSimulationMoney,
  formatSimulationMoney,
} from "../lib/format";
import { useAuthedQuery, useVisiblePolling } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import { defaultsFor, toNumbers, validateParam, type ParamValues } from "../lib/strategyParams";
import type { Simulation, SimulationReport, SimulationStatus, StrategySpec } from "../types";
import { statusText } from "./SimulationsPage";

const section = SECTIONS.simulations;
const TERMINAL = new Set(["completed", "archived"]);

function chartRangeFor(startedAt: string | undefined): "3mo" | "6mo" | "1y" | "2y" {
  const days = startedAt ? (Date.now() - Date.parse(startedAt)) / 86_400_000 : 0;
  if (days <= 45) return "3mo";
  if (days <= 140) return "6mo";
  if (days <= 300) return "1y";
  return "2y";
}

function Signed({ value, kind }: { value: number | null | undefined; kind: "money" | "fraction" }) {
  const dir = direction(value);
  return (
    <span className={dir} style={{ whiteSpace: "nowrap" }}>
      {directionArrow(value)} {kind === "money" ? formatSignedSimulationMoney(value) : formatSignedFraction(value)}
    </span>
  );
}

function SetupStrategy({ simulation, onDone }: { simulation: Simulation; onDone: (updated: Simulation) => void }) {
  const { token, handleAuthError } = useAuthed();
  const strategies = useAuthedQuery(() => fetchRunnableStrategies(), [], { action: "load strategies" });
  const [strategyId, setStrategyId] = useState("sma-crossover");
  const [params, setParams] = useState<ParamValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const strategy: StrategySpec | undefined = strategies.data?.find((item) => item.id === strategyId);
  const values = params ?? defaultsFor(strategy);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string | undefined> = {};
    for (const param of strategy?.parameters ?? []) found[param.name] = validateParam(param, values[param.name] ?? "");
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    try {
      onDone(await updateSimulation(token, simulation.id, { strategy: strategyId, params: toNumbers(values) }));
    } catch (error) {
      if (handleAuthError(error)) return;
      setSubmitError(describeError(error, "set up this simulation"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel panel-body stack" onSubmit={submit} noValidate aria-labelledby="setup-heading">
      <h2 id="setup-heading" style={{ fontSize: "var(--text-h4)" }}>
        Choose a strategy to start tracking
      </h2>
      <p className="text-secondary">
        This simulation was saved as “{simulation.strategy}” before strategies were tracked, so there's nothing to replay. Pick a strategy; tracking starts at the next market open.
      </p>
      {submitError ? <ErrorState message={submitError} /> : null}
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="setup-strategy">
            Strategy
          </label>
          <select
            id="setup-strategy"
            className="select"
            value={strategyId}
            disabled={!strategies.data}
            onChange={(event) => {
              setStrategyId(event.target.value);
              setParams(null);
              setErrors({});
            }}
          >
            {(strategies.data ?? [{ id: strategyId, name: "Loading…" } as StrategySpec]).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {(strategy?.parameters ?? []).map((param) => (
          <div className="field" key={param.name}>
            <label className="field-label" htmlFor={`setup-${param.name}`}>
              {param.label}
            </label>
            <input
              id={`setup-${param.name}`}
              className="input"
              inputMode={param.type === "integer" ? "numeric" : "decimal"}
              value={values[param.name] ?? ""}
              aria-invalid={errors[param.name] ? true : undefined}
              aria-describedby={errors[param.name] ? `setup-${param.name}-error` : undefined}
              onChange={(event) => {
                setParams({ ...values, [param.name]: event.target.value });
                if (errors[param.name] && !validateParam(param, event.target.value)) setErrors((previous) => ({ ...previous, [param.name]: undefined }));
              }}
            />
            {errors[param.name] ? (
              <span className="field-error" id={`setup-${param.name}-error`}>
                {errors[param.name]}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !strategies.data}>
          {busy ? "Starting…" : "Start tracking"}
        </button>
      </div>
    </form>
  );
}

function SignalPanel({ report }: { report: SimulationReport }) {
  const signal = report.signal;
  if (!signal) return null;
  const pending = signal.pending;
  return (
    <section className="panel" aria-labelledby="signal-heading">
      <div className="panel-header">
        <h2 id="signal-heading" style={{ fontSize: "var(--text-h4)" }}>
          Signal and next order
        </h2>
        {report.session ? <span className="status-pill">{report.session.label}</span> : null}
      </div>
      <div className="panel-body stack">
        <p>
          <strong>{report.strategy?.name}</strong> is currently <strong>{signal.label.toLowerCase()}</strong>
          {signal.provisional ? " on today's price so far" : " as of the last close"}.
        </p>
        {signal.paused ? (
          <Notice icon="clock">Paused — no orders are placed until you resume. Any open position keeps its market value.</Notice>
        ) : pending ? (
          <Notice tone={pending.provisional ? "info" : "warn"} icon={pending.side === "buy" ? "plus" : "logout"}>
            <span className="label-with-hint">
              <strong>Pending: {pending.side === "buy" ? "buy" : "sell"} at the next open.</strong>
              <InfoHint label="Pending order" term="pendingOrder" />
            </span>{" "}
            {pending.reason}
          </Notice>
        ) : TERMINAL.has(report.status) ? null : (
          <p className="text-secondary">No order pending — the position already matches the signal.</p>
        )}
      </div>
    </section>
  );
}

function PositionPanel({ report }: { report: SimulationReport }) {
  const position = report.position;
  const currency = report.instrument?.currency;
  return (
    <section className="panel" aria-labelledby="position-heading">
      <div className="panel-header">
        <h2 id="position-heading" style={{ fontSize: "var(--text-h4)" }}>
          Position
        </h2>
        <DataSourceBadge source={report.mark?.source ?? report.instrument?.source} updated={report.mark?.time} />
      </div>
      <div className="panel-body">
        {position ? (
          <dl className="kv-list">
            <div>
              <dt>Shares</dt>
              <dd className="num">{position.shares.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Average fill price</dt>
              <dd className="num">{formatPrice(position.avgPrice, currency)}</dd>
            </div>
            <div>
              <dt>Last price</dt>
              <dd className="num">{formatPrice(position.lastPrice, currency)}</dd>
            </div>
            <div>
              <dt className="label-with-hint">
                Market value <InfoHint label="Marked to market" term="markToMarket" />
              </dt>
              <dd className="num">{formatSimulationMoney(position.marketValue)}</dd>
            </div>
            <div>
              <dt className="label-with-hint">
                Unrealized P&amp;L <InfoHint label="Unrealized P&L" term="unrealizedPnl" />
              </dt>
              <dd className="num">
                <Signed value={position.unrealizedPnl} kind="money" /> ({formatSignedFraction(position.unrealizedReturn)})
              </dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd className="num">{formatSimulationMoney(report.summary.cash)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-secondary">No open position — {formatSimulationMoney(report.summary.cash)} in cash.</p>
        )}
        {report.fx ? (
          <p className="text-meta" style={{ marginTop: "var(--space-3)" }}>
            <span className="label-with-hint">
              {report.instrument?.currency} prices converted at {report.fx.pair.replace("=X", "")} {report.fx.rate.toFixed(2)} (latest daily rate).
              <InfoHint label="Exchange-rate conversion" term="fxConversion" />
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FillsTable({ report }: { report: SimulationReport }) {
  const currency = report.instrument?.currency;
  if (!report.trades.length) {
    return <EmptyState icon="history" title="No fills yet" body="The strategy hasn't traded since the simulation started. Fills appear here at the session open after a signal change." />;
  }
  return (
    <section className="table-frame" aria-labelledby="fills-heading">
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 id="fills-heading" className="label-with-hint" style={{ fontSize: "var(--text-h4)" }}>
          Simulated fills <InfoHint label="Simulated fill" term="paperFill" />
        </h2>
        <span className="text-meta">Newest first · prices include slippage · INR amounts include costs</span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Side</th>
              <th scope="col" className="right">
                Shares
              </th>
              <th scope="col" className="right">
                Price
              </th>
              <th scope="col" className="right">
                Amount (INR)
              </th>
              <th scope="col" className="right">
                P&amp;L (INR)
              </th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {report.trades.map((fill) => (
              <tr key={`${fill.time}-${fill.side}`}>
                <td className="num">{formatDate(fill.time)}</td>
                <td>{fill.side === "buy" ? "▲ Buy" : "▼ Sell"}</td>
                <td className="right num">{fill.shares.toLocaleString()}</td>
                <td className="right num">{formatPrice(fill.price, currency)}</td>
                <td className="right num">{formatSimulationMoney(fill.notional)}</td>
                <td className="right num">{fill.side === "sell" ? <Signed value={fill.pnl} kind="money" /> : "—"}</td>
                <td className="text-secondary" style={{ minWidth: 240 }}>
                  {fill.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricsTab({ report }: { report: SimulationReport }) {
  const rows: Array<{ key: string; label: string; term: "volatility" | "sharpe" | "sortino" | "cagr" | "maxDrawdown"; fraction: boolean }> = [
    { key: "maxDrawdown", label: "Max drawdown", term: "maxDrawdown", fraction: true },
    { key: "volatility", label: "Volatility (annualized)", term: "volatility", fraction: true },
    { key: "sharpe", label: "Sharpe ratio", term: "sharpe", fraction: false },
    { key: "sortino", label: "Sortino ratio", term: "sortino", fraction: false },
    { key: "cagr", label: "CAGR", term: "cagr", fraction: true },
  ];
  return (
    <div className="kpi-strip" aria-label="Risk metrics">
      {rows.map((row) => {
        const value = report.metrics[row.key];
        const reason = report.metricReasons[row.key];
        return (
          <MetricCard
            key={row.key}
            label={row.label}
            term={row.term}
            value={value == null ? "—" : row.fraction ? formatFraction(value) : value.toFixed(2)}
            sub={value == null ? reason : undefined}
            muted={value == null}
          />
        );
      })}
    </div>
  );
}

export function SimulationDetailPage() {
  const { simulationId = "" } = useParams();
  const { token, handleAuthError } = useAuthed();
  const record = useAuthedQuery((authToken) => fetchSimulation(authToken, simulationId), [simulationId], { action: "load this simulation" });
  const report = useAuthedQuery((authToken) => fetchSimulationReport(authToken, simulationId), [simulationId, record.data?.strategy], { action: "value this simulation" });
  const terminal = record.data ? TERMINAL.has(record.data.status) : true;
  useVisiblePolling(() => void report.reload(), 30_000, !terminal && report.data?.state !== "needs_setup");
  const range = chartRangeFor(record.data?.startedAt);
  const symbol = record.data?.symbol;
  const chart = useAuthedQuery((authToken) => (symbol ? fetchChart(authToken, symbol, { range, interval: "1d" }) : Promise.resolve(null)), [symbol, range], {
    action: "load the price chart",
  });
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const changeStatus = async (status: SimulationStatus) => {
    if (!record.data) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await updateSimulation(token, record.data.id, { status });
      record.setData(() => updated);
      await report.reload();
    } catch (error) {
      if (handleAuthError(error)) return;
      setActionError(describeError(error, "update this simulation"));
    } finally {
      setBusy(false);
      setConfirmComplete(false);
    }
  };

  const data = report.data;
  const equityLines = useMemo(() => {
    if (!data) return [];
    return [
      { id: "strategy", label: data.strategy?.name ?? "Strategy", colorVar: "--series-1", points: data.equity },
      { id: "buyhold", label: `Hold ${data.symbol}`, colorVar: "--series-2", points: data.buyHold },
      ...(data.benchmark.length ? [{ id: "benchmark", label: `${data.benchmarkSymbol} (scaled)`, colorVar: "--series-3", points: data.benchmark }] : []),
    ];
  }, [data]);
  const startedTime = record.data?.startedAt ? Date.parse(record.data.startedAt) : 0;
  const candles = useMemo(() => (chart.data?.points ?? []).filter((point) => Date.parse(point.timestamp) >= startedTime - 30 * 86_400_000), [chart.data, startedTime]);
  const markers = useMemo<ChartMarker[]>(() => (data?.trades ?? []).map((fill) => ({ timestamp: fill.barTime, side: fill.side })), [data]);

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={section.route}>Simulations</Link>
        </li>
        <li aria-current="page">{record.data ? `${record.data.symbol} simulation` : "Simulation"}</li>
      </ol>
    </nav>
  );

  if (record.error) {
    return (
      <div className="page">
        {breadcrumb}
        {/404|couldn't find|not found/i.test(record.error) ? (
          <EmptyState
            icon="search"
            title="This simulation isn't available"
            body="It may have been deleted or created on another account."
            action={
              <Link to={section.route} className="btn btn-primary">
                Back to simulations
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

  const sim = record.data;
  const params = data?.strategy?.params ?? sim.params ?? {};
  const paramText = Object.entries(params)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");

  return (
    <div className="page">
      <header className="section-header">
        <div className="section-header-top">
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {breadcrumb}
            <div className="section-title-row">
              <h1>
                {sim.symbol} · {sim.strategyName ?? sim.strategy}
              </h1>
              <span className="status-pill">{statusText(sim.status)}</span>
              {data?.session && !terminal ? <span className="status-pill">{data.session.label}</span> : null}
            </div>
            <p className="text-secondary">
              {data?.instrument?.name ? `${data.instrument.name} · ` : ""}
              {sim.tracking === "needs_setup" ? "Saved" : "Started"} {formatDateTime(sim.startedAt ?? sim.createdAt)} · {formatSimulationMoney(sim.startingCapital)} paper capital
              {paramText ? ` · ${paramText}` : ""}
              {data?.costs ? ` · costs ${data.costs.costBps} bps · slippage ${data.costs.slippageBps} bps` : ""}
              {data?.benchmarkSymbol ? ` · benchmark ${data.benchmarkSymbol}` : ""}
            </p>
          </div>
          <div className="section-actions">
            <button type="button" className="btn" onClick={() => void report.reload()} disabled={report.loading}>
              <Icon name="refresh" />
              Refresh
            </button>
            {sim.tracking !== "needs_setup" && sim.status === "active" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void changeStatus("paused")}>
                <Icon name="clock" />
                Pause
              </button>
            ) : null}
            {sim.tracking !== "needs_setup" && sim.status === "paused" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void changeStatus("active")}>
                <Icon name="activity" />
                Resume
              </button>
            ) : null}
            {!terminal && sim.tracking !== "needs_setup" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => setConfirmComplete(true)}>
                <Icon name="check" />
                Complete
              </button>
            ) : null}
            {sim.status === "completed" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void changeStatus("archived")}>
                Archive
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {actionError ? <ErrorState message={actionError} /> : null}
      {sim.notes ? <p className="text-secondary">{sim.notes}</p> : null}

      {report.error ? (
        <ErrorState message={report.error} onRetry={() => void report.reload()} />
      ) : report.loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data ? null : data.state === "needs_setup" ? (
        <SetupStrategy
          simulation={sim}
          onDone={(updated) => {
            record.setData(() => updated);
          }}
        />
      ) : data.state === "unavailable" ? (
        <Notice tone="warn" icon="alert">
          {data.reason} <button type="button" className="btn btn-ghost" onClick={() => void report.reload()}>Try again</button>
        </Notice>
      ) : (
        <>
          {data.notes.map((note) => (
            <Notice key={note}>{note}</Notice>
          ))}
          {data.state === "waiting" ? (
            <Notice icon="clock">
              {data.reason} The first order is placed at the next session open
              {data.signal?.pending ? ` — the strategy is currently long, so it will buy ${data.symbol}.` : " if the strategy is long by then."}
            </Notice>
          ) : null}

          <section className="kpi-strip" aria-label="Key figures">
            <MetricCard label="Value" value={formatSimulationMoney(data.summary.equity)} sub={`from ${formatSimulationMoney(data.summary.startingCapital)}`} />
            <MetricCard label="Profit / loss" term="totalReturn" value={<Signed value={data.summary.pnl} kind="money" />} sub={formatSignedFraction(data.summary.totalReturn)} />
            <MetricCard
              label="vs buy-and-hold"
              term="excessReturn"
              value={data.summary.excessVsBuyHold == null ? "—" : <Signed value={data.summary.excessVsBuyHold} kind="fraction" />}
              sub={data.summary.buyHoldReturn == null ? "Starts at the first open" : `Holding: ${formatSignedFraction(data.summary.buyHoldReturn)}`}
            />
            <MetricCard
              label={`vs ${data.benchmarkSymbol ?? "market"}`}
              term="benchmark"
              value={data.summary.excessVsBenchmark == null ? "—" : <Signed value={data.summary.excessVsBenchmark} kind="fraction" />}
              sub={data.summary.benchmarkReturn == null ? "Benchmark unavailable" : `Index: ${formatSignedFraction(data.summary.benchmarkReturn)}`}
            />
            <MetricCard
              label="Max drawdown"
              term="maxDrawdown"
              value={formatFraction(data.summary.maxDrawdown)}
              sub={`In the market ${formatFraction(data.summary.exposure, 0)} of ${data.summary.tradingDays} trading days`}
            />
          </section>

          <div className="grid-2">
            <SignalPanel report={data} />
            <PositionPanel report={data} />
          </div>

          <Tabs.Root defaultValue="performance">
            <Tabs.List className="tabs-list" aria-label="Simulation sections">
              <Tabs.Trigger className="tabs-trigger" value="performance">
                Performance
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="fills">
                Fills ({data.trades.length})
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="metrics">
                Risk metrics
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="assumptions">
                Assumptions
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content className="tabs-content stack-lg" value="performance">
              <section className="panel" aria-labelledby="equity-heading">
                <div className="panel-header">
                  <h2 id="equity-heading" style={{ fontSize: "var(--text-h4)" }}>
                    Value vs holding {data.symbol}
                    {data.benchmark.length ? ` vs ${data.benchmarkSymbol}` : ""}
                  </h2>
                  <DataSourceBadge source={data.instrument?.source} />
                </div>
                <div className="panel-body">
                  {data.equity.length >= 2 ? (
                    <TimeSeriesChart
                      lines={equityLines}
                      valueFormat="money"
                      currency="INR"
                      ariaLabel={`Daily value of the ${data.symbol} simulation in rupees compared with holding the stock and the benchmark index, all starting from the same capital.`}
                    />
                  ) : (
                    <p className="text-secondary">The value chart appears after the second trading session.</p>
                  )}
                </div>
              </section>
              <section className="panel" aria-labelledby="price-heading">
                <div className="panel-header">
                  <h2 id="price-heading" style={{ fontSize: "var(--text-h4)" }}>
                    {data.symbol} price with simulated fills
                  </h2>
                  <DataSourceBadge source={chart.data?.source} />
                </div>
                <div className="panel-body">
                  {chart.error ? (
                    <ErrorState message={chart.error} onRetry={() => void chart.reload()} />
                  ) : chart.loading && !chart.data ? (
                    <Skeleton height={280} />
                  ) : candles.length ? (
                    <TimeSeriesChart
                      candles={candles}
                      markers={markers}
                      currency={data.instrument?.currency}
                      ariaLabel={`Daily ${data.symbol} candles from a month before the start, with an up arrow marked B for each simulated buy and a down arrow marked S for each sell.`}
                    />
                  ) : (
                    <p className="text-secondary">No price history to show.</p>
                  )}
                </div>
              </section>
            </Tabs.Content>
            <Tabs.Content className="tabs-content" value="fills">
              <FillsTable report={data} />
            </Tabs.Content>
            <Tabs.Content className="tabs-content" value="metrics">
              <MetricsTab report={data} />
            </Tabs.Content>
            <Tabs.Content className="tabs-content" value="assumptions">
              <ul className="stack" style={{ paddingLeft: "var(--space-5)" }}>
                {data.assumptions.map((item) => (
                  <li key={item} className="text-secondary">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-meta">Valued {formatDateTime(data.asOf)}. Paper trading only — no real orders are placed.</p>
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={(open) => !open && setConfirmComplete(false)}
        title={`Complete the ${sim.symbol} simulation?`}
        body="It stops trading now and its final report is frozen. A completed simulation can't be resumed."
        confirmLabel={`Complete ${sim.symbol} simulation`}
        onConfirm={() => void changeStatus("completed")}
        busy={busy}
      />
    </div>
  );
}
