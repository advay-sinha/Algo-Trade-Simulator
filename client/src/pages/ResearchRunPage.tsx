// Pattern 2 — Detail / Record: one research run (tabs) or one comparison (table + chart).
import * as Tabs from "@radix-ui/react-tabs";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { downloadResearchRun, fetchResearchRun, fetchResearchRunFills, fetchResearchRunHoldings, replayResearchRun } from "../api";
import { TimeSeriesChart } from "../components/charts/TimeSeriesChart";
import { ComparisonChart, ComparisonTable, MaturityPill, ResearchCaveats } from "../components/strategy/ResearchViews";
import { EmptyState, ErrorState, MetricCard, Pagination, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { formatDate, formatDateTime, formatFraction, formatInteger, formatPrice, formatSignedFraction, formatSimulationMoney } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { describeError } from "../lib/errors";
import { useAuthed } from "../lib/session";
import { Icon } from "../components/ui/Icon";
import type { ResearchComparison, ResearchReplay, ResearchRunRecord } from "../types";

const FILL_PAGE = 25;
const COST_LABELS: Record<string, string> = {
  brokerage: "Brokerage",
  stt: "Securities transaction tax",
  exchange: "Exchange transaction charges",
  sebi: "SEBI fee",
  stamp: "Stamp duty",
  gst: "GST",
  dp: "DP charges",
};

function Breadcrumb({ current, comparisonId }: { current: string; comparisonId?: string }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={SECTIONS.strategyLab.route}>Strategy research</Link>
        </li>
        {comparisonId ? (
          <li>
            <Link to={`/lab/runs/${comparisonId}`}>Comparison</Link>
          </li>
        ) : null}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

function universeName(id: string) {
  return id === "nifty100-current" ? "Nifty 100 (current members)" : id === "nifty50-current" ? "Nifty 50 (current members)" : id;
}

function ComparisonView({ data }: { data: ResearchComparison }) {
  return (
    <div className="page">
      <header className="section-header">
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <Breadcrumb current="Comparison" />
          <h1>{data.label}</h1>
          <p className="text-secondary">
            {universeName(data.dataset.universe)} · {formatDate(data.period.start)} – {formatDate(data.period.end)} · {formatInteger(data.period.sessions)} sessions · capital{" "}
            {formatSimulationMoney(data.settings.capital)} · dataset {data.dataset.version.slice(0, 8)} · run {formatDateTime(data.createdAt)}
          </p>
        </div>
      </header>
      <ResearchCaveats survivorshipBiased={data.dataset.survivorshipBiased} caveats={data.caveats} />
      <ComparisonTable rows={data.rows} benchmark={data.benchmark} />
      <ComparisonChart comparison={data} />
      <section className="table-frame" aria-labelledby="conventions-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="conventions-heading" style={{ fontSize: "var(--text-h4)" }}>
            How the runs were made comparable
          </h2>
        </div>
        <dl style={{ margin: 0 }}>
          {Object.entries(data.conventions).map(([key, text]) => (
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
        </dl>
      </section>
    </div>
  );
}

function FillsTab({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const fills = useAuthedQuery((token) => fetchResearchRunFills(token, id, page * FILL_PAGE, FILL_PAGE), [id, page], { action: "load the fills" });
  if (fills.error) return <ErrorState message={fills.error} onRetry={() => void fills.reload()} />;
  if (fills.loading || !fills.data) return <SkeletonRows rows={6} />;
  const data = fills.data;
  return (
    <section className={`table-frame ${fills.refreshing ? "is-refreshing" : ""}`} aria-labelledby="fills-heading">
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 id="fills-heading" style={{ fontSize: "var(--text-h4)" }}>
          Fills, newest first
        </h2>
        <span className="text-meta">
          {data.totalInRun > data.total ? `Latest ${formatInteger(data.total)} of ${formatInteger(data.totalInRun)} kept` : `${formatInteger(data.total)} fills`} · prices include slippage
        </span>
      </div>
      {data.items.length === 0 ? (
        <div className="state-block">
          <h3 style={{ fontSize: "var(--text-body)" }}>No fills</h3>
          <p>The strategy never held anything in this window.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Stock</th>
                <th scope="col">Side</th>
                <th scope="col" className="right">
                  Shares
                </th>
                <th scope="col" className="right">
                  Price
                </th>
                <th scope="col" className="right">
                  Charges
                </th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((fill, index) => (
                <tr key={`${fill.date}-${fill.symbol}-${fill.side}-${index}`}>
                  <td className="num">{formatDate(fill.date)}</td>
                  <td>{fill.symbol}</td>
                  <td>{fill.side === "buy" ? "▲ Buy" : "▼ Sell"}</td>
                  <td className="right num">{formatInteger(fill.shares)}</td>
                  <td className="right num">{formatPrice(fill.price)}</td>
                  <td className="right num text-secondary">{formatSimulationMoney(fill.costTotal)}</td>
                  <td className="text-secondary" style={{ minWidth: 240 }}>
                    {fill.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(data.total / FILL_PAGE))} total={data.total} pageSize={FILL_PAGE} onPage={setPage} noun="fills" />
    </section>
  );
}

function HoldingsTab({ id }: { id: string }) {
  const holdings = useAuthedQuery((token) => fetchResearchRunHoldings(token, id), [id], { action: "load holdings" });
  if (holdings.error) return <ErrorState message={holdings.error} onRetry={() => void holdings.reload()} />;
  if (holdings.loading || !holdings.data) return <SkeletonRows rows={5} />;
  const { positions, decision, asOf } = holdings.data;
  const weights = new Map(decision?.weights.map((item) => [item.symbol, item.weight]) ?? []);
  if (!positions.length && !decision) return <EmptyState title="Nothing held" body="The run ended in cash." />;
  return (
    <section className="table-frame" aria-labelledby="holdings-heading">
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 id="holdings-heading" style={{ fontSize: "var(--text-h4)" }}>
          Holdings at the end
        </h2>
        <span className="text-meta">
          {asOf ? `Positions on ${formatDate(asOf)}` : "No positions"}
          {decision ? ` · target weights from the ${formatDate(decision.date)} decision` : ""}
        </span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Stock</th>
              <th scope="col" className="right">
                Shares
              </th>
              <th scope="col" className="right">
                Target weight
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.symbol}>
                <td>{position.symbol}</td>
                <td className="right num">{formatInteger(position.shares)}</td>
                <td className="right num">{weights.has(position.symbol) ? formatFraction(weights.get(position.symbol), 1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReproducibilityActions({ data }: { data: ResearchRunRecord }) {
  const { token, handleAuthError } = useAuthed();
  const [replay, setReplay] = useState<ResearchReplay | null>(data.lastReplay ?? null);
  const [busy, setBusy] = useState<"replay" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runReplay = async () => {
    setBusy("replay");
    setError(null);
    try {
      setReplay(await replayResearchRun(token, data.id));
    } catch (caught) {
      if (!handleAuthError(caught)) setError(describeError(caught, "replay this run"));
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    setBusy("download");
    setError(null);
    try {
      const blob = await downloadResearchRun(token, data.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `research-run-${data.id.slice(0, 8)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      if (!handleAuthError(caught)) setError(describeError(caught, "download the run files"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="table-frame panel-body stack" aria-labelledby="repro-heading">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 id="repro-heading" style={{ fontSize: "var(--text-h4)" }}>
          Reproducibility
        </h2>
        <div className="cluster">
          <button type="button" className="btn" onClick={() => void runReplay()} disabled={busy !== null}>
            <Icon name="refresh" />
            {busy === "replay" ? "Replaying…" : "Replay from the snapshot"}
          </button>
          <button type="button" className="btn" onClick={() => void download()} disabled={busy !== null}>
            <Icon name="download" />
            {busy === "download" ? "Preparing…" : "Download run files"}
          </button>
        </div>
      </div>
      {replay ? (
        <p role="status" className={replay.identical ? "up" : "down"} style={{ margin: 0 }}>
          {replay.identical ? "✓ Replayed identically" : `✗ Not identical: ${replay.reason ?? "results differ"}`} · checked {formatDateTime(replay.checkedAt)}
        </p>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <p className="text-secondary" style={{ margin: 0 }}>
        Code {data.manifest?.code.commit ? data.manifest.code.commit.slice(0, 10) : "unknown"}
        {data.manifest?.code.dirty ? " (with uncommitted changes)" : ""} · engine v{data.engineVersion} · dataset {data.dataset.version.slice(0, 12)} · configuration{" "}
        {data.configHash.slice(0, 12)} · result {data.resultHash.slice(0, 12)}
        {data.manifest ? ` · trial ${data.manifest.trial.index} of ${data.manifest.trial.count}` : ""}
        {data.manifest?.costs.feeVersions.length
          ? ` · charges: ${data.manifest.costs.feeVersions.map((version) => (version < "2001" ? "approximate pre-Oct 2024 rates" : `rates from ${formatDate(version)}`)).join(" and ")}`
          : ""}
      </p>
      {data.tracking?.enabled ? (
        <p className="text-secondary" style={{ margin: 0 }}>
          {data.tracking.logged && data.tracking.url ? (
            <a href={data.tracking.url} target="_blank" rel="noreferrer">
              Open in experiment tracking
            </a>
          ) : (
            "Experiment tracking was unavailable when this run was saved; the run itself is complete."
          )}
          {data.tracking.logged ? ` · ${data.tracking.artifactsUploaded?.length ? "files attached" : "files kept here (tracking server stores artifacts elsewhere)"}` : ""}
        </p>
      ) : null}
    </section>
  );
}

function RunView({ data }: { data: ResearchRunRecord }) {
  const equityLines = useMemo(
    () => [
      { id: "run", label: data.label, colorVar: "--series-1", points: data.series.equity },
      ...(data.series.benchmark.length ? [{ id: "index", label: `${data.benchmark.symbol} index level (scaled)`, colorVar: "--series-3", points: data.series.benchmark }] : []),
    ],
    [data],
  );
  const drawdownLines = useMemo(() => [{ id: "drawdown", label: "Drawdown", colorVar: "--series-1", points: data.series.drawdown, kind: "area" as const }], [data]);
  const exposureLines = useMemo(() => [{ id: "exposure", label: "Invested share of equity", colorVar: "--series-2", points: data.series.exposure, kind: "area" as const }], [data]);
  const s = data.summary;
  const m = data.metrics;
  return (
    <div className="page">
      <header className="section-header">
        <div className="section-header-top">
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <Breadcrumb current={data.label} comparisonId={data.comparisonId} />
            <div className="section-title-row">
              <h1>{data.label}</h1>
              <MaturityPill maturity={data.strategy.metadata.maturity} />
            </div>
            <p className="text-secondary">
              {universeName(data.dataset.universe)} · {formatDate(data.period.start)} – {formatDate(data.period.end)} · {formatInteger(data.period.sessions)} sessions · rebalances{" "}
              {data.strategy.metadata.rebalance}
              {data.costMultiplier !== 1 ? ` · charges ×${data.costMultiplier}` : ""} · run {formatDateTime(data.createdAt)}
            </p>
          </div>
        </div>
      </header>
      <ResearchCaveats survivorshipBiased={data.dataset.survivorshipBiased} caveats={data.caveats} />
      <section aria-label="Run results" className="kpi-strip">
        <MetricCard label="Final equity" term="finalEquity" value={formatSimulationMoney(s.finalEquity)} sub={`from ${formatSimulationMoney(s.startingCapital)}`} />
        <MetricCard
          label="Total return"
          term="totalReturn"
          value={<span className={(m.totalReturn ?? 0) >= 0 ? "up" : "down"}>{formatSignedFraction(m.totalReturn)}</span>}
          sub={data.benchmark.metrics ? `Index ${formatSignedFraction(data.benchmark.metrics.totalReturn)}` : undefined}
        />
        <MetricCard label="CAGR" term="cagr" value={formatSignedFraction(m.cagr)} sub={`Sharpe ${m.sharpe == null ? "—" : m.sharpe.toFixed(2)}`} />
        <MetricCard label="Max drawdown" term="maxDrawdown" value={formatFraction(m.maxDrawdown)} sub={`Volatility ${formatFraction(m.volatility)}`} />
        <MetricCard label="Turnover / yr" term="turnover" value={s.annualTurnover.toFixed(2)} sub={`Charges ${formatSimulationMoney(s.totalCosts)} · ${formatInteger(s.fills)} fills`} />
      </section>
      <Tabs.Root defaultValue="performance">
        <Tabs.List className="tabs-list" aria-label="Run sections">
          <Tabs.Trigger className="tabs-trigger" value="performance">
            Performance
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="holdings">
            Holdings
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="fills">
            Fills ({formatInteger(data.counts.fills)})
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="costs">
            Charges
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="assumptions">
            Assumptions
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="tabs-content stack-lg" value="performance">
          <section className="panel" aria-labelledby="run-equity-heading">
            <div className="panel-header">
              <h2 id="run-equity-heading" style={{ fontSize: "var(--text-h4)" }}>
                Equity vs {data.benchmark.symbol}
              </h2>
            </div>
            <div className="panel-body">
              <TimeSeriesChart lines={equityLines} valueFormat="money" currency="INR" ariaLabel={`Equity of ${data.label} in rupees against the ${data.benchmark.symbol} index level scaled to the same starting capital.`} />
            </div>
          </section>
          <section className="panel" aria-labelledby="run-dd-heading">
            <div className="panel-header">
              <h2 id="run-dd-heading" style={{ fontSize: "var(--text-h4)" }}>
                Drawdown
              </h2>
            </div>
            <div className="panel-body">
              <TimeSeriesChart lines={drawdownLines} valueFormat="percent" size="small" ariaLabel={`Drawdown from the running peak; the worst point is ${formatFraction(m.maxDrawdown)}.`} />
            </div>
          </section>
          <section className="panel" aria-labelledby="run-exposure-heading">
            <div className="panel-header">
              <h2 id="run-exposure-heading" style={{ fontSize: "var(--text-h4)" }}>
                Invested share of equity
              </h2>
              <span className="text-meta">Average {formatFraction(s.averageExposure, 0)}</span>
            </div>
            <div className="panel-body">
              <TimeSeriesChart lines={exposureLines} valueFormat="percent" size="small" ariaLabel={`Share of equity invested over time; average ${formatFraction(s.averageExposure, 0)}.`} />
            </div>
          </section>
          {data.pending.length ? (
            <section className="table-frame panel-body" aria-label="Pending orders">
              <h2 style={{ fontSize: "var(--text-h4)" }}>Pending at the last close</h2>
              <p className="text-secondary" style={{ margin: 0 }}>
                {data.pending.length} order{data.pending.length === 1 ? "" : "s"} decided on {formatDate(data.pending[0].decidedOn)} would execute at the next open; they are not counted in the results.
              </p>
            </section>
          ) : null}
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="holdings">
          <HoldingsTab id={data.id} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="fills">
          <FillsTab id={data.id} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="costs">
          <section className="table-frame" aria-labelledby="costs-heading">
            <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
              <h2 id="costs-heading" style={{ fontSize: "var(--text-h4)" }}>
                Charges paid
              </h2>
              <span className="text-meta">Dividends received {formatSimulationMoney(s.dividends)}</span>
            </div>
            <dl style={{ margin: 0 }}>
              {Object.entries(s.costBreakdown).map(([key, value]) => (
                <div className="list-row" key={key}>
                  <dt className="list-row-main">{COST_LABELS[key] ?? key}</dt>
                  <dd className="num" style={{ margin: 0 }}>
                    {formatSimulationMoney(value)}
                  </dd>
                </div>
              ))}
              <div className="list-row">
                <dt className="list-row-main list-row-title">Total</dt>
                <dd className="num" style={{ margin: 0 }}>
                  {formatSimulationMoney(s.totalCosts)}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>
        <Tabs.Content className="tabs-content stack-lg" value="assumptions">
          <ReproducibilityActions data={data} />
          <div className="table-frame">
            <dl style={{ margin: 0 }}>
              {Object.entries(data.assumptions).map(([key, text]) => (
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
                  <dt className="list-row-title">Reproducibility</dt>
                  <dd style={{ margin: 0 }} className="text-secondary">
                    Engine v{data.engineVersion} · dataset {data.dataset.version.slice(0, 12)} · configuration {data.configHash.slice(0, 12)} · result {data.resultHash.slice(0, 12)} · parameters{" "}
                    {Object.entries(data.strategy.params)
                      .map(([name, value]) => `${name} = ${value}`)
                      .join(", ")}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

export function ResearchRunPage() {
  const { runId = "" } = useParams();
  const record = useAuthedQuery((token) => fetchResearchRun(token, runId), [runId], { action: "load this research run" });
  if (record.error) {
    return (
      <div className="page">
        <Breadcrumb current="Research run" />
        {/404|couldn't find|not found/i.test(record.error) ? (
          <EmptyState
            icon="search"
            title="This research run isn't available"
            body="It may belong to another account, or the server's in-memory storage was reset."
            action={
              <Link to={SECTIONS.strategyLab.route} className="btn btn-primary">
                Run a comparison
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
        <Breadcrumb current="Research run" />
        <SkeletonRows rows={8} />
      </div>
    );
  }
  return record.data.kind === "comparison" ? <ComparisonView data={record.data} /> : <RunView data={record.data} />;
}
