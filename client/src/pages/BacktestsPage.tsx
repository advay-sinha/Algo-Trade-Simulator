// Pattern 9 — Analytics (report runner): parameters → run → results on the same page.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchBacktests, fetchRunnableStrategies, runBacktest } from "../api";
import { AssumptionsList, BacktestCharts, BacktestKpis, TradesTable } from "../components/backtest/BacktestResultView";
import { RiskPanel } from "../components/backtest/RiskPanel";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { ErrorState, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDateTime, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { BacktestRange, BacktestRecord, StrategySpec } from "../types";

const section = SECTIONS.backtests;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";
const RANGES: Array<{ id: BacktestRange; label: string }> = [
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
];
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;

type Values = Record<string, string>;

function defaultsFor(strategy: StrategySpec | undefined): Values {
  const values: Values = {};
  for (const param of strategy?.parameters ?? []) values[param.name] = param.default != null ? String(param.default) : "";
  return values;
}

function validateParam(spec: StrategySpec["parameters"][number], raw: string): string | undefined {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) return "Enter a number.";
  if (spec.type === "integer" && !Number.isInteger(value)) return "Use a whole number.";
  if (spec.minimum != null && value < spec.minimum) return `Use ${spec.minimum} or more.`;
  if (spec.maximum != null && value > spec.maximum) return `Use ${spec.maximum} or less.`;
  return undefined;
}

export function BacktestsPage() {
  const { token, handleAuthError } = useAuthed();
  const [searchParams] = useSearchParams();
  const strategies = useAuthedQuery(() => fetchRunnableStrategies(), [], { action: "load strategies" });
  const recent = useAuthedQuery(fetchBacktests, [], { action: "load recent backtests" });

  const [symbol, setSymbol] = useState(() => (searchParams.get("symbol") ?? "AAPL").toUpperCase());
  const [strategyId, setStrategyId] = useState(() => searchParams.get("strategy") ?? "sma-crossover");
  const [params, setParams] = useState<Values>({});
  const [range, setRange] = useState<BacktestRange>("1y");
  const [capital, setCapital] = useState("100000");
  const [costBps, setCostBps] = useState("5");
  const [slippageBps, setSlippageBps] = useState("5");
  const [benchmark, setBenchmark] = useState("");
  const [riskFree, setRiskFree] = useState("0");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestRecord | null>(null);

  const strategy = useMemo(() => strategies.data?.find((item) => item.id === strategyId), [strategies.data, strategyId]);
  useEffect(() => {
    setParams(defaultsFor(strategy));
    setErrors({});
  }, [strategy]);

  const validateAll = () => {
    const found: Record<string, string | undefined> = {};
    if (!SYMBOL_RE.test(symbol.trim())) found.symbol = "Use a ticker like AAPL, BRK-B or RELIANCE.NS.";
    const amount = Number(capital);
    if (!Number.isFinite(amount) || amount <= 0) found.capital = "Enter an amount above zero.";
    for (const [field, raw] of [["costBps", costBps], ["slippageBps", slippageBps]] as const) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 500) found[field] = "Use 0 to 500 basis points.";
    }
    if (benchmark.trim() && !SYMBOL_RE.test(benchmark.trim())) found.benchmark = "Use a ticker like SPY or ^GSPC, or leave it empty.";
    const rf = Number(riskFree);
    if (!Number.isFinite(rf) || rf < 0 || rf > 20) found.riskFree = "Use 0 to 20 (percent per year).";
    for (const param of strategy?.parameters ?? []) {
      const message = validateParam(param, params[param.name] ?? "");
      if (message) found[`param-${param.name}`] = message;
    }
    return found;
  };

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAll();
    setErrors(found);
    const first = Object.keys(found).find((key) => found[key]);
    if (first) {
      document.getElementById(`bt-${first}`)?.focus();
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const record = await runBacktest(token, {
        symbol: symbol.trim().toUpperCase(),
        strategy: strategyId,
        params: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Number(value)])),
        range,
        startingCapital: Number(capital),
        costBps: Number(costBps),
        slippageBps: Number(slippageBps),
        benchmark: benchmark.trim() ? benchmark.trim().toUpperCase() : undefined,
        riskFreeRate: Number(riskFree) / 100,
      });
      setResult(record);
      void recent.reload();
    } catch (error) {
      if (handleAuthError(error)) return;
      const detail = (error as { status?: number; message?: string }).status === 422 ? (error as Error).message : null;
      setRunError(detail && /history|parameter/i.test(detail) ? `${detail}` : describeError(error, "run the backtest"));
    } finally {
      setRunning(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`bt-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const invalid = (key: string) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `bt-${key}-error` : undefined });

  return (
    <div className="page">
      <SectionHeader section={section} />

      <form className="panel panel-body stack" onSubmit={run} noValidate aria-labelledby="bt-params-heading">
        <h2 id="bt-params-heading" style={{ fontSize: "var(--text-h4)" }}>
          Parameters
        </h2>
        <div className="field" style={{ alignSelf: "flex-start" }}>
          <span className="field-label">History</span>
          <div className="segmented" role="group" aria-label="History range">
            {RANGES.map((item) => (
              <button key={item.id} type="button" aria-pressed={item.id === range} onClick={() => setRange(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {strategies.error ? <ErrorState message={strategies.error} onRetry={() => void strategies.reload()} /> : null}
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="bt-symbol">
              Symbol
            </label>
            <input id="bt-symbol" className="input" value={symbol} maxLength={20} autoCapitalize="characters" onChange={(event) => setSymbol(event.target.value)} {...invalid("symbol")} />
            {fieldError("symbol")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bt-strategy">
              Strategy
            </label>
            <select id="bt-strategy" className="select" value={strategyId} onChange={(event) => setStrategyId(event.target.value)} disabled={!strategies.data}>
              {(strategies.data ?? [{ id: strategyId, name: "Loading…" } as StrategySpec]).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {strategies.loading ? (
            <Skeleton height={44} />
          ) : (
            (strategy?.parameters ?? []).map((param) => (
              <div className="field" key={param.name}>
                <label className="field-label" htmlFor={`bt-param-${param.name}`}>
                  {param.description ? (
                    <LabelWithHint label={param.label} text={param.description}>
                      {param.label}
                    </LabelWithHint>
                  ) : (
                    param.label
                  )}
                </label>
                <input
                  id={`bt-param-${param.name}`}
                  className="input"
                  inputMode={param.type === "integer" ? "numeric" : "decimal"}
                  value={params[param.name] ?? ""}
                  onChange={(event) => setParams((previous) => ({ ...previous, [param.name]: event.target.value }))}
                  onBlur={() => setErrors((previous) => ({ ...previous, [`param-${param.name}`]: validateParam(param, params[param.name] ?? "") }))}
                  {...invalid(`param-${param.name}`)}
                />
                {fieldError(`param-${param.name}`)}
              </div>
            ))
          )}
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="bt-capital">
              <LabelWithHint label="Sizing" text={featureText("sizing")}>
                Starting capital
              </LabelWithHint>
            </label>
            <input id="bt-capital" className="input" inputMode="decimal" value={capital} onChange={(event) => setCapital(event.target.value)} {...invalid("capital")} />
            {fieldError("capital")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bt-costBps">
              <LabelWithHint label="Costs and slippage" text={featureText("costs")}>
                Costs (bps)
              </LabelWithHint>
            </label>
            <input id="bt-costBps" className="input" inputMode="decimal" value={costBps} onChange={(event) => setCostBps(event.target.value)} {...invalid("costBps")} />
            {fieldError("costBps")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bt-slippageBps">
              Slippage (bps)
            </label>
            <input id="bt-slippageBps" className="input" inputMode="decimal" value={slippageBps} onChange={(event) => setSlippageBps(event.target.value)} {...invalid("slippageBps")} />
            {fieldError("slippageBps")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bt-benchmark">
              <LabelWithHint label="Benchmark" term="benchmark">
                Benchmark <span className="field-optional">(optional)</span>
              </LabelWithHint>
            </label>
            <input id="bt-benchmark" className="input" value={benchmark} maxLength={20} placeholder="Auto: SPY / ^NSEI" onChange={(event) => setBenchmark(event.target.value)} {...invalid("benchmark")} />
            {fieldError("benchmark")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bt-riskFree">
              <LabelWithHint label="Risk-free rate" term="riskFreeRate">
                Risk-free rate (% / yr)
              </LabelWithHint>
            </label>
            <input id="bt-riskFree" className="input" inputMode="decimal" value={riskFree} onChange={(event) => setRiskFree(event.target.value)} {...invalid("riskFree")} />
            {fieldError("riskFree")}
          </div>
        </div>
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <span className="text-meta">{strategy?.description}</span>
          <button type="submit" className="btn btn-primary" disabled={running || !strategy}>
            <Icon name="activity" />
            {running ? "Running backtest…" : "Run backtest"}
          </button>
        </div>
      </form>

      {runError ? <ErrorState message={runError} /> : null}

      {running && !result ? (
        <div className="kpi-strip">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="metric-card" key={index}>
              <Skeleton width="60%" />
              <Skeleton height={28} width="45%" />
            </div>
          ))}
        </div>
      ) : null}

      {result ? (
        <div className={`stack-lg ${running ? "is-refreshing" : ""}`}>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "var(--text-h3)" }}>
              {result.symbol} · {result.strategy.name}
            </h2>
            <Link to={`/backtests/${result.id}`} className="btn">
              Open saved run
              <Icon name="chevronRight" />
            </Link>
          </div>
          <BacktestKpis record={result} />
          <BacktestCharts record={result} />
          {result.risk ? <RiskPanel risk={result.risk} strategyName={result.strategy.name} symbol={result.symbol} /> : null}
          <TradesTable trades={result.trades ?? []} currency={result.currency} />
          <AssumptionsList record={result} />
        </div>
      ) : null}

      <section className="table-frame" aria-labelledby="recent-bt-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="recent-bt-heading" style={{ fontSize: "var(--text-h4)" }}>
            Recent runs
          </h2>
          <Link to={SECTIONS.history.route} className="text-secondary">
            See all in Research history
          </Link>
        </div>
        {recent.loading ? (
          <SkeletonRows rows={3} />
        ) : recent.error ? (
          <div className="panel-body">
            <ErrorState message={recent.error} onRetry={() => void recent.reload()} />
          </div>
        ) : recent.data?.length ? (
          <ul className="list-plain">
            {recent.data.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link to={`/backtests/${item.id}`} className="list-row">
                  <div className="list-row-main">
                    <span className="list-row-title">
                      {item.symbol} · {item.strategy.name}
                    </span>
                    <span className="text-meta">
                      {item.range} · {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <span className={`num ${item.summary.totalReturn >= 0 ? "up" : "down"}`}>{formatSignedFraction(item.summary.totalReturn)}</span>
                  <Icon name="chevronRight" className="icon chevron" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="state-block">
            <h3 style={{ fontSize: "var(--text-body)" }}>No backtests yet</h3>
            <p>Run your first backtest above — results are saved here automatically.</p>
          </div>
        )}
      </section>
    </div>
  );
}
