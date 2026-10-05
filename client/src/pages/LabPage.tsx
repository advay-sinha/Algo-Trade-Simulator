// Pattern 9 — Analytics (report runner): parameters → run → results on the same page.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { predictStrategy, trainStrategy } from "../api";
import { TimeSeriesChart } from "../components/charts/TimeSeriesChart";
import { Icon } from "../components/ui/Icon";
import { InfoHint, LabelWithHint } from "../components/ui/InfoHint";
import { ErrorState, MetricCard, Notice, SectionHeader, Skeleton } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDateTime, formatFraction, formatInteger, formatSignedFraction } from "../lib/format";
import { useAuthed } from "../lib/session";
import type { PredictionResult, TrainingResult } from "../types";
import { SYMBOL_RE } from "../lib/symbols";
import { SymbolCombobox } from "../components/ui/SymbolCombobox";

const section = SECTIONS.lab;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";

interface FormState {
  symbol: string;
  shortWindow: string;
  longWindow: string;
}

function validateForm(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const short = Number(form.shortWindow);
  const long = Number(form.longWindow);
  if (!SYMBOL_RE.test(form.symbol.trim())) errors.symbol = "Pick a match from the list, or type a ticker like AAPL or RELIANCE.NS.";
  if (!Number.isInteger(short) || short < 2 || short > 200) errors.shortWindow = "Use a whole number from 2 to 200.";
  if (!Number.isInteger(long) || long < 3 || long > 400) errors.longWindow = "Use a whole number from 3 to 400.";
  else if (!errors.shortWindow && short >= long) errors.longWindow = "Make the long window larger than the short one.";
  return errors;
}

export function LabPage() {
  const { token, handleAuthError } = useAuthed();
  const [form, setForm] = useState<FormState>({ symbol: "AAPL", shortWindow: "20", longWindow: "60" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [signal, setSignal] = useState<PredictionResult | null>(null);
  const [signalBusy, setSignalBusy] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);

  const setField = (field: keyof FormState, value: string) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (errors[field] && !validateForm(next)[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };
  const blurField = (field: keyof FormState) => setErrors((previous) => ({ ...previous, [field]: validateForm(form)[field] }));

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateForm(form);
    setErrors(found);
    const first = (Object.keys(found) as Array<keyof FormState>).find((key) => found[key]);
    if (first) {
      document.getElementById(`lab-${first}`)?.focus();
      return;
    }
    setRunning(true);
    setRunError(null);
    setSignal(null);
    setSignalError(null);
    try {
      const response = await trainStrategy(token, {
        symbol: form.symbol.trim().toUpperCase(),
        shortWindow: Number(form.shortWindow),
        longWindow: Number(form.longWindow),
        strategyId: "sma-crossover",
      });
      setResult(response);
    } catch (error) {
      if (handleAuthError(error)) return;
      setRunError(describeError(error, "run the trainer"));
    } finally {
      setRunning(false);
    }
  };

  const generateSignal = async () => {
    if (!result) return;
    setSignalBusy(true);
    setSignalError(null);
    try {
      setSignal(await predictStrategy(token, result.symbol));
    } catch (error) {
      if (handleAuthError(error)) return;
      setSignalError(describeError(error, "generate a signal"));
    } finally {
      setSignalBusy(false);
    }
  };

  const fieldProps = (field: keyof FormState) => ({
    id: `lab-${field}`,
    className: "input",
    value: form[field],
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `lab-${field}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setField(field, event.target.value),
    onBlur: () => blurField(field),
  });

  const metrics = result?.metrics;
  const chartLines = useMemo(
    () =>
      result
        ? [
            { id: "close", label: "Close", colorVar: "--series-1", points: result.sample.map((row) => ({ timestamp: row.timestamp, value: row.close })) },
            { id: "short", label: `SMA ${result.shortWindow}`, colorVar: "--series-2", points: result.sample.map((row) => ({ timestamp: row.timestamp, value: row.shortSma })) },
            { id: "long", label: `SMA ${result.longWindow}`, colorVar: "--series-3", points: result.sample.map((row) => ({ timestamp: row.timestamp, value: row.longSma })) },
          ]
        : [],
    [result],
  );

  return (
    <div className="page">
      <SectionHeader section={section} />

      <form className="panel panel-body stack" onSubmit={run} noValidate aria-labelledby="params-heading">
        <h2 id="params-heading" style={{ fontSize: "var(--text-h4)" }}>
          Parameters · SMA crossover
        </h2>
        <div className="form-row">
          <SymbolCombobox
            id="lab-symbol"
            label="Symbol"
            value={form.symbol}
            onChange={(value) => setField("symbol", value)}
            onSelect={(value) => setField("symbol", value)}
            onBlur={() => blurField("symbol")}
            error={errors.symbol}
          />
          <div className="field">
            <label className="field-label" htmlFor="lab-shortWindow">
              <LabelWithHint label="Windows" text={featureText("windows")}>
                Short window (days)
              </LabelWithHint>
            </label>
            <input {...fieldProps("shortWindow")} inputMode="numeric" />
            {errors.shortWindow ? <span className="field-error" id="lab-shortWindow-error">{errors.shortWindow}</span> : null}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lab-longWindow">
              Long window (days)
            </label>
            <input {...fieldProps("longWindow")} inputMode="numeric" />
            {errors.longWindow ? <span className="field-error" id="lab-longWindow-error">{errors.longWindow}</span> : null}
          </div>
          <button type="submit" className="btn btn-primary" disabled={running}>
            <Icon name="flask" />
            {running ? "Running…" : "Run trainer"}
          </button>
        </div>
        <span className="text-meta">Uses six months of daily closes. Runs typically take a few seconds.</span>
      </form>

      {runError ? <ErrorState message={runError} onRetry={() => void run({ preventDefault() {} } as FormEvent)} retryLabel="Run again" /> : null}

      {running && !result ? (
        <div className="kpi-strip">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="metric-card" key={index}>
              <Skeleton width="60%" />
              <Skeleton height={28} width="45%" />
            </div>
          ))}
        </div>
      ) : null}

      {result && metrics ? (
        <div className={`stack-lg ${running ? "is-refreshing" : ""}`}>
          <Notice tone="warn" icon="alert">
            These figures come from a <strong style={{ fontWeight: 600 }}>zero-cost, in-sample</strong> backtest of the crossover over the whole window.
            For costs, slippage, longer history, and a benchmark comparison, use <Link to="/backtests">Backtests</Link>.
          </Notice>

          <section aria-label="Results" className="kpi-strip">
            <MetricCard
              label="Strategy return"
              term="totalReturn"
              value={<span className={(metrics.totalReturn ?? 0) >= 0 ? "up" : "down"}>{formatSignedFraction(metrics.totalReturn)}</span>}
              sub={`CAGR ${formatSignedFraction(metrics.annualizedReturn)}`}
            />
            <MetricCard label="Max drawdown" term="maxDrawdown" value={formatFraction(metrics.maxDrawdown)} sub="Of the strategy's equity" />
            <MetricCard label="Sharpe ratio" term="sharpe" value={metrics.sharpe == null ? "—" : metrics.sharpe.toFixed(2)} muted={metrics.sharpe == null} sub={metrics.sharpe == null ? "Not enough movement to measure" : "Annualized, rf = 0"} />
            <MetricCard label="Win rate" term="winRate" value={formatFraction(metrics.winRate, 0)} muted={metrics.winRate == null} sub={metrics.winRate == null ? "No closed trades" : "Of closed trades"} />
            <MetricCard label="Closed trades" term="closedTrades" value={formatInteger(metrics.trades)} sub="Round trips in the window" />
          </section>

          <section className="panel" aria-labelledby="lab-chart-heading">
            <div className="panel-header">
              <h2 id="lab-chart-heading" style={{ fontSize: "var(--text-h4)" }}>
                {result.symbol} with {result.shortWindow}- and {result.longWindow}-day averages
              </h2>
              <span className="text-meta">Trained {formatDateTime(result.trainedAt)}</span>
            </div>
            <div className="panel-body">
              <TimeSeriesChart
                ariaLabel={`${result.symbol} closing price with short and long simple moving averages over the trained window.`}
                lines={chartLines}
              />
            </div>
          </section>

          <div className="grid-2">
            <section className="panel panel-body stack" aria-labelledby="validation-heading">
              <h2 id="validation-heading" style={{ fontSize: "var(--text-h4)" }}>
                <LabelWithHint label="Validation" text={featureText("validation")}>
                  Validation status
                </LabelWithHint>
              </h2>
              <div className="timeline" role="img" aria-label="The whole window is used in-sample; no embargo gap or out-of-sample test window yet.">
                <span className="timeline-seg train" style={{ flex: 1 }}>
                  In-sample · whole window
                </span>
                <span className="timeline-seg disabled" style={{ flex: "0 0 22%" }}>
                  Test · not yet
                </span>
              </div>
              <p className="text-secondary">
                A trustworthy result needs a later, unseen test window separated by an embargo gap
                <InfoHint label="embargo gap" term="embargo" />. See a real one in the{" "}
                <Link to="/lab/datasets">Dataset builder</Link>; until ML models train on such splits (Phase 5), treat these figures as a description of the past,
                not evidence the strategy works.
              </p>
            </section>

            <section className="panel panel-body stack" aria-labelledby="signal-heading">
              <h2 id="signal-heading" style={{ fontSize: "var(--text-h4)" }}>
                <LabelWithHint label="Signal" term="signal">
                  Current signal
                </LabelWithHint>
              </h2>
              {signal ? (
                <div className="stack" style={{ gap: "var(--space-2)" }}>
                  <span className="metric-value" style={{ textTransform: "capitalize" }}>
                    {signal.signal}
                  </span>
                  <span className="text-secondary">
                    <LabelWithHint label="Confidence" term="confidence">
                      Momentum strength {formatFraction(signal.confidence, 1)}
                    </LabelWithHint>
                  </span>
                  <span className="text-secondary">{signal.summary}</span>
                  <span className="text-meta">
                    Generated {formatDateTime(signal.generatedAt)} ·{" "}
                    {(signal.metadata as { basis?: string }).basis === "ml-model" ? (
                      <>
                        from your latest <Link to="/lab/models">ML model</Link> for this symbol
                      </>
                    ) : (
                      <>
                        naive 5-day momentum — train an <Link to="/lab/models">ML model</Link> for a model-based signal
                      </>
                    )}
                    . Not investment advice.
                  </span>
                </div>
              ) : (
                <p className="text-secondary">See whether recent momentum points to buy, sell, or hold for {result.symbol}. Indicative only — not advice.</p>
              )}
              {signalError ? <ErrorState message={signalError} /> : null}
              <div>
                <button type="button" className="btn" onClick={() => void generateSignal()} disabled={signalBusy}>
                  {signalBusy ? "Generating…" : signal ? "Refresh signal" : "Generate signal"}
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!result && !running && !runError ? (
        <div className="panel">
          <div className="state-block">
            <Icon name="flask" />
            <h3 style={{ fontSize: "var(--text-body)" }}>No run yet</h3>
            <p>Set a symbol and two windows above, then run the trainer to see how the averages tracked the price and where they crossed.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
