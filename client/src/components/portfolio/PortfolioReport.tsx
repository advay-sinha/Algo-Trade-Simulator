// Portfolio risk report (Phase 10c): value, concentration, exposure, risk of the portfolio as held,
// benchmark comparison, correlation, and user-driven what-if / stress. Wording describes facts only.
import { useMemo, useState, type FormEvent } from "react";
import { fetchPortfolioReport, runPortfolioWhatIf } from "../../api";
import { describeError } from "../../lib/errors";
import { direction, directionArrow, formatDate, formatFraction, formatPrice, formatSignedFraction, formatSignedSimulationMoney, formatSimulationMoney } from "../../lib/format";
import { useAuthedQuery } from "../../lib/hooks";
import { useAuthed } from "../../lib/session";
import type { MixItem, PortfolioHolding, PortfolioReportData, WhatIfResult } from "../../types";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { InfoHint } from "../ui/InfoHint";
import { ErrorState, MetricCard, Notice, Skeleton, SkeletonRows } from "../ui/primitives";

const RANGES = ["6mo", "1y", "2y", "5y"] as const;
const RANGE_LABELS: Record<string, string> = { "6mo": "6M", "1y": "1Y", "2y": "2Y", "5y": "5Y" };
const BENCHMARKS = [
  { symbol: "^NSEI", label: "Nifty 50" },
  { symbol: "^BSESN", label: "Sensex" },
  { symbol: "^NSEBANK", label: "Nifty Bank" },
  { symbol: "^GSPC", label: "S&P 500" },
];
const SOURCE_NOTES: Record<string, string> = {
  live: "Live quote",
  cached: "Recent quote (cached)",
  last_close: "Last close — live quote unavailable",
  amfi: "AMFI NAV",
};

function Signed({ value, kind }: { value: number | null | undefined; kind: "money" | "fraction" }) {
  return (
    <span className={direction(value)} style={{ whiteSpace: "nowrap" }}>
      {value == null ? "—" : `${directionArrow(value)} ${kind === "money" ? formatSignedSimulationMoney(value) : formatSignedFraction(value)}`}
    </span>
  );
}

function BarList({ items, label, limit = 10 }: { items: MixItem[]; label: string; limit?: number }) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restWeight = rest.reduce((sum, item) => sum + item.weight, 0);
  const max = Math.max(...shown.map((item) => item.weight), restWeight, 0.0001);
  return (
    <ul className="bar-list" aria-label={label}>
      {[...shown, ...(rest.length ? [{ label: `${rest.length} more`, weight: restWeight }] : [])].map((item) => (
        <li key={item.label}>
          <span className="bar-list-label">{item.label}</span>
          <span className="bar-list-track" aria-hidden="true">
            <span className="bar-list-fill" style={{ width: `${(item.weight / max) * 100}%` }} />
          </span>
          <span className="bar-list-value num">{formatFraction(item.weight, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

function CorrelationTable({ report }: { report: PortfolioReportData }) {
  const { keys, matrix, reason } = report.correlation;
  const labels = useMemo(() => new Map(report.positions.map((p) => [p.key, p.symbol ?? (p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label)])), [report.positions]);
  if (!keys.length) return <p className="text-secondary">{reason ?? "Not enough overlapping history."}</p>;
  return (
    <div className="table-scroll">
      <table className="table corr-table">
        <caption className="text-meta" style={{ captionSide: "bottom", textAlign: "left", paddingTop: "var(--space-2)" }}>
          Correlation of daily returns, −1 to 1. Darker cells move together more closely; negative values are shown with a minus sign on a plain cell.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Holding</span>
            </th>
            {keys.map((key) => (
              <th scope="col" key={key} className="right mono">
                {labels.get(key) ?? key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((rowKey, row) => (
            <tr key={rowKey}>
              <th scope="row" className="mono">
                {labels.get(rowKey) ?? rowKey}
              </th>
              {matrix[row].map((value, column) => (
                <td
                  key={column}
                  className="right num"
                  style={value != null && value > 0 && row !== column ? { background: `color-mix(in srgb, var(--series-1) ${Math.round(value * 45)}%, transparent)` } : undefined}
                >
                  {value == null ? "—" : row === column ? "1" : value.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WHATIF_ROWS: Array<{ label: string; get: (side: WhatIfResult["before"]) => number | null | undefined; fraction: boolean; digits?: number }> = [
  { label: "Largest holding", get: (side) => side.concentration.top1, fraction: true },
  { label: "Top five holdings", get: (side) => side.concentration.top5, fraction: true },
  { label: "Effective holdings", get: (side) => side.concentration.effectiveHoldings, fraction: false, digits: 1 },
  { label: "Volatility (annualized)", get: (side) => side.risk.volatility, fraction: true },
  { label: "1-day VaR", get: (side) => side.risk.var, fraction: true },
  { label: "Beta to index", get: (side) => side.risk.beta, fraction: false, digits: 2 },
  { label: "Max drawdown", get: (side) => side.risk.maxDrawdown, fraction: true },
];

function WhatIfPanel({ report, options }: { report: PortfolioReportData; options: { range: string; benchmark: string; confidence: number } }) {
  const { token, handleAuthError } = useAuthed();
  const [capKey, setCapKey] = useState("");
  const [capPct, setCapPct] = useState("20");
  const [shockKind, setShockKind] = useState<"none" | "market" | "sector">("market");
  const [shockSector, setShockSector] = useState(report.sectorMix[0]?.label ?? "");
  const [shockPct, setShockPct] = useState("-10");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const cap = Number(capPct);
    const shock = Number(shockPct);
    if (capKey && !(cap > 0 && cap < 100)) return setError("Use a cap between 1% and 99%.");
    if (shockKind !== "none" && !(shock >= -90 && shock <= 90)) return setError("Use a shock between −90% and 90%.");
    setBusy(true);
    setError(null);
    try {
      setResult(
        await runPortfolioWhatIf(token, {
          ...options,
          ...(capKey ? { cap: { key: capKey, maxWeight: cap / 100 } } : {}),
          ...(shockKind !== "none" ? { shock: { kind: shockKind, pct: shock / 100, ...(shockKind === "sector" ? { sector: shockSector } : {}) } } : {}),
        }),
      );
    } catch (caught) {
      if (handleAuthError(caught)) return;
      setError(describeError(caught, "run that scenario"));
    } finally {
      setBusy(false);
    }
  };

  const format = (value: number | null | undefined, fraction: boolean, digits = 2) => (value == null ? "—" : fraction ? formatFraction(value, 1) : value.toFixed(digits));

  return (
    <section className="panel" aria-labelledby="whatif-heading">
      <div className="panel-header">
        <h2 id="whatif-heading" style={{ fontSize: "var(--text-h4)" }}>
          What-if and stress
        </h2>
      </div>
      <form className="panel-body stack" onSubmit={run} noValidate>
        <p className="text-secondary">Pick the scenario yourself — the figures show how the portfolio as held would change. Nothing is traded or saved.</p>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="whatif-cap">
              Cap a holding
            </label>
            <select id="whatif-cap" className="select" value={capKey} onChange={(event) => setCapKey(event.target.value)}>
              <option value="">No cap</option>
              {report.positions.map((position) => (
                <option key={position.key} value={position.key}>
                  {position.label} ({formatFraction(position.weight, 0)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="whatif-cap-pct">
              At most (% of value)
            </label>
            <input id="whatif-cap-pct" className="input" inputMode="decimal" value={capPct} disabled={!capKey} onChange={(event) => setCapPct(event.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="whatif-shock">
              Shock
            </label>
            <select id="whatif-shock" className="select" value={shockKind} onChange={(event) => setShockKind(event.target.value as typeof shockKind)}>
              <option value="none">None</option>
              <option value="market">Whole market</option>
              <option value="sector">One sector</option>
            </select>
          </div>
          {shockKind === "sector" ? (
            <div className="field">
              <label className="field-label" htmlFor="whatif-sector">
                Sector
              </label>
              <select id="whatif-sector" className="select" value={shockSector} onChange={(event) => setShockSector(event.target.value)}>
                {report.sectorMix.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {shockKind !== "none" ? (
            <div className="field">
              <label className="field-label" htmlFor="whatif-shock-pct">
                Move (%)
              </label>
              <input id="whatif-shock-pct" className="input" inputMode="decimal" value={shockPct} onChange={(event) => setShockPct(event.target.value)} />
            </div>
          ) : null}
        </div>
        {error ? <ErrorState message={error} /> : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || (!capKey && shockKind === "none")}>
            {busy ? "Calculating…" : "Show the effect"}
          </button>
        </div>
        {result ? (
          <div className="stack">
            {result.shock ? (
              <Notice icon="activity">
                A {formatSignedFraction(result.shock.pct, 0)} move in {result.shock.kind === "market" ? `${options.benchmark}` : `${result.shock.sector}`} would change the portfolio by about{" "}
                <strong>
                  <Signed value={result.shock.before.changeInr} kind="money" /> ({formatSignedFraction(result.shock.before.change, 1)})
                </strong>
                {capKey ? (
                  <>
                    {" "}
                    as held, or <Signed value={result.shock.after.changeInr} kind="money" /> with the cap.
                  </>
                ) : (
                  "."
                )}
                {result.shock.kind === "market" ? " Estimated from each holding's beta to the index." : ""}
                {result.shock.assumedBetaOne.length ? ` ${result.shock.assumedBetaOne.length} holding(s) without enough history are assumed to move one-for-one.` : ""}
              </Notice>
            ) : null}
            {capKey ? (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Figure</th>
                      <th scope="col" className="right">
                        As held
                      </th>
                      <th scope="col" className="right">
                        With the cap
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {WHATIF_ROWS.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td className="right num">{format(row.get(result.before), row.fraction, row.digits)}</td>
                        <td className="right num">{format(row.get(result.after), row.fraction, row.digits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

export function PortfolioReport({ holdings }: { holdings: PortfolioHolding[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1y");
  const [benchmark, setBenchmark] = useState("^NSEI");
  const [confidence, setConfidence] = useState(0.95);
  const holdingsKey = holdings.map((holding) => holding.id).join(",");
  const report = useAuthedQuery((token) => fetchPortfolioReport(token, { range, benchmark, confidence }), [range, benchmark, confidence, holdingsKey], {
    action: "build your portfolio report",
  });
  const data = report.data;
  const benchmarkLabel = BENCHMARKS.find((item) => item.symbol === benchmark)?.label ?? benchmark;
  const lines = useMemo(
    () =>
      data
        ? [
            { id: "portfolio", label: "Portfolio as held", colorVar: "--series-1", points: data.equity },
            ...(data.benchmarkCurve.length ? [{ id: "index", label: benchmarkLabel, colorVar: "--series-2", points: data.benchmarkCurve }] : []),
          ]
        : [],
    [data, benchmarkLabel],
  );
  const drawdownLines = useMemo(() => (data ? [{ id: "drawdown", label: "Drawdown", colorVar: "--series-1", points: data.drawdown, kind: "area" as const }] : []), [data]);
  const positionMix = useMemo(() => (data ? data.positions.map((p) => ({ label: p.symbol ?? p.label, weight: p.weight })) : []), [data]);
  const reason = (key: string) => data?.riskReasons[key];

  return (
    <div className="stack-lg">
      <section className="panel panel-body stack" aria-label="Report settings">
        <div className="cluster" style={{ gap: "var(--space-4)", alignItems: "flex-end" }}>
          <div className="stack" style={{ gap: "var(--space-1)" }}>
            <span className="field-label">History window</span>
            <div className="segmented" role="group" aria-label="History window">
              {RANGES.map((item) => (
                <button key={item} type="button" aria-pressed={item === range} onClick={() => setRange(item)}>
                  {RANGE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="report-benchmark">
              Compare with
            </label>
            <select id="report-benchmark" className="select" value={benchmark} onChange={(event) => setBenchmark(event.target.value)}>
              {BENCHMARKS.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="report-confidence">
              VaR confidence
            </label>
            <select id="report-confidence" className="select" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}>
              <option value={0.95}>95%</option>
              <option value={0.99}>99%</option>
            </select>
          </div>
          {data ? <span className="text-meta">Valued {formatDate(data.asOf)} · {data.window.days} trading days from {formatDate(data.window.start)}</span> : null}
        </div>
      </section>

      {report.error ? (
        <ErrorState message={report.error} onRetry={() => void report.reload()} />
      ) : !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className={`stack-lg ${report.refreshing ? "is-refreshing" : ""}`}>
          <section className="kpi-strip" aria-label="Portfolio figures">
            <MetricCard label="Value" value={formatSimulationMoney(data.totals.value)} sub={`${data.totals.positions} holdings`} />
            <MetricCard
              label="Unrealized P&L"
              term="unrealizedPnl"
              value={<Signed value={data.totals.unrealizedPnl} kind="money" />}
              sub={data.totals.costCoverage != null && data.totals.costCoverage < 1 ? `Holdings with a cost: ${formatFraction(data.totals.costCoverage, 0)}` : data.totals.cost ? `on ${formatSimulationMoney(data.totals.cost)} cost` : "Add average costs to see this"}
            />
            <MetricCard
              label="Volatility"
              term="volatility"
              value={formatFraction(data.risk.volatility, 1)}
              sub={reason("volatility") ?? (data.risk.maxDrawdown != null ? `annualized · max drawdown ${formatFraction(data.risk.maxDrawdown, 1)}` : "annualized")}
              muted={data.risk.volatility == null}
            />
            <MetricCard
              label={`1-day VaR (${Math.round(data.confidence * 100)}%)`}
              term="valueAtRisk"
              value={formatFraction(data.risk.var, 2)}
              sub={data.risk.cvar != null ? `CVaR ${formatFraction(data.risk.cvar, 2)}` : reason("var")}
              muted={data.risk.var == null}
            />
            <MetricCard
              label={`Beta to ${benchmarkLabel}`}
              term="beta"
              value={data.risk.beta == null ? "—" : data.risk.beta.toFixed(2)}
              sub={data.risk.trackingError != null ? `Tracking error ${formatFraction(data.risk.trackingError, 1)}` : reason("beta")}
              muted={data.risk.beta == null}
            />
          </section>

          {data.observations.length ? (
            <section className="panel" aria-labelledby="facts-heading">
              <div className="panel-header">
                <h2 id="facts-heading" className="label-with-hint" style={{ fontSize: "var(--text-h4)" }}>
                  What the numbers show <InfoHint label="Portfolio as held" term="asHeld" />
                </h2>
              </div>
              <ul className="panel-body stack" style={{ gap: "var(--space-2)", paddingLeft: "var(--space-7, 40px)", margin: 0 }}>
                {data.observations.map((sentence) => (
                  <li key={sentence}>{sentence}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.unpriced.length || data.coverage.excluded.length ? (
            <Notice tone="warn" icon="alert">
              {data.unpriced.length ? `${data.unpriced.map((item) => item.label).join(", ")}: no current price, so left out of the value. ` : ""}
              {data.coverage.excluded.length ? `${data.coverage.excluded.map((item) => item.label).join(", ")}: too little price history, so left out of the risk figures.` : ""}
            </Notice>
          ) : null}

          <div className="grid-2">
            <section className="panel" aria-labelledby="weights-heading">
              <div className="panel-header">
                <h2 id="weights-heading" className="label-with-hint" style={{ fontSize: "var(--text-h4)" }}>
                  Holdings by value <InfoHint label="Concentration" term="hhi" />
                </h2>
                <span className="text-meta">
                  {data.concentration.effectiveHoldings ? `≈ ${data.concentration.effectiveHoldings.toFixed(1)} effective holdings` : ""}
                </span>
              </div>
              <div className="panel-body">
                <BarList items={positionMix} label="Weight of each holding" />
              </div>
            </section>
            <section className="panel" aria-labelledby="sectors-heading">
              <div className="panel-header">
                <h2 id="sectors-heading" style={{ fontSize: "var(--text-h4)" }}>
                  Sector and asset mix
                </h2>
              </div>
              <div className="panel-body stack">
                <BarList items={data.sectorMix} label="Weight by sector" limit={8} />
                <BarList items={data.assetMix} label="Weight by asset type" />
              </div>
            </section>
          </div>

          <section className="panel" aria-labelledby="growth-heading">
            <div className="panel-header">
              <h2 id="growth-heading" className="label-with-hint" style={{ fontSize: "var(--text-h4)" }}>
                Portfolio as held vs {benchmarkLabel} (start = 100) <InfoHint label="Portfolio as held" term="asHeld" />
              </h2>
              <span className="text-meta">
                {data.risk.totalReturn != null ? `Portfolio ${formatSignedFraction(data.risk.totalReturn, 1)}` : ""}
                {data.risk.benchmarkReturn != null ? ` · index ${formatSignedFraction(data.risk.benchmarkReturn, 1)}` : ""}
              </span>
            </div>
            <div className="panel-body">
              {data.equity.length > 1 ? (
                <TimeSeriesChart lines={lines} ariaLabel={`Growth of 100 in the portfolio as held compared with ${benchmarkLabel} over the selected window.`} />
              ) : (
                <p className="text-secondary">{reason("totalReturn") ?? "Not enough overlapping price history to draw this."}</p>
              )}
            </div>
          </section>
          {data.drawdown.length > 1 ? (
            <section className="panel" aria-labelledby="pf-drawdown-heading">
              <div className="panel-header">
                <h2 id="pf-drawdown-heading" style={{ fontSize: "var(--text-h4)" }}>
                  Drawdown from peak
                </h2>
              </div>
              <div className="panel-body">
                <TimeSeriesChart lines={drawdownLines} valueFormat="percent" size="small" ariaLabel={`Fall of the portfolio as held from its running peak; the deepest was ${formatFraction(data.risk.maxDrawdown)}.`} />
              </div>
            </section>
          ) : null}

          <section className="panel" aria-labelledby="corr-heading">
            <div className="panel-header">
              <h2 id="corr-heading" style={{ fontSize: "var(--text-h4)" }}>
                Which holdings move together
              </h2>
            </div>
            <div className="panel-body">
              <CorrelationTable report={data} />
            </div>
          </section>

          <WhatIfPanel report={data} options={{ range, benchmark, confidence }} />

          <section className="table-frame" aria-labelledby="positions-heading">
            <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
              <h2 id="positions-heading" style={{ fontSize: "var(--text-h4)" }}>
                Positions
              </h2>
              <span className="text-meta label-with-hint">
                XIRR {data.xirr.value != null ? formatSignedFraction(data.xirr.value, 1) : "—"}
                <InfoHint label="XIRR" term="xirr" />
                {data.xirr.value == null && data.xirr.reason ? ` · ${data.xirr.reason}` : ""}
              </span>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Holding</th>
                    <th scope="col" className="right">
                      Weight
                    </th>
                    <th scope="col" className="right">
                      Value (INR)
                    </th>
                    <th scope="col" className="right">
                      Price
                    </th>
                    <th scope="col" className="right">
                      Unrealized P&amp;L
                    </th>
                    <th scope="col" className="right">
                      Beta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((position) => (
                    <tr key={position.key}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{position.label}</div>
                        <div className="text-meta">
                          {position.symbol ?? position.isin} · {position.quantity.toLocaleString()} units
                        </div>
                      </td>
                      <td className="right num">{formatFraction(position.weight, 1)}</td>
                      <td className="right num">{formatSimulationMoney(position.value)}</td>
                      <td className="right num">
                        <div>{formatPrice(position.price, position.currency)}</div>
                        <div className="text-meta">
                          {SOURCE_NOTES[position.priceSource] ?? position.priceSource}
                          {position.fxRate ? ` · ×${position.fxRate.toFixed(2)} INR` : ""}
                        </div>
                      </td>
                      <td className="right num">
                        {position.pnl == null ? (
                          <span className="text-secondary">No cost</span>
                        ) : (
                          <>
                            <Signed value={position.pnl} kind="money" />
                            <div className="text-meta">{formatSignedFraction(position.pnlReturn, 1)}</div>
                          </>
                        )}
                      </td>
                      <td className="right num">{position.beta == null ? "—" : position.beta.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-meta">
            {data.disclaimer} Fund history comes from a public AMFI NAV mirror; prices without a live quote are labelled in the Price column.
          </p>
        </div>
      )}
      {report.loading && data ? <Skeleton height={4} /> : null}
    </div>
  );
}
