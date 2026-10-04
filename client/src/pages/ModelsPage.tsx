// Pattern 9 — Analytics (report runner): train → evaluate → results; registry list below.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fetchModels, predictWithModel, trainModel } from "../api";
import { FeatureGroupPicker } from "../components/ml/FeatureGroupPicker";
import { ExperimentTrackingNote, ModelEvaluation, ModelKpis, ModelVerdict } from "../components/ml/ModelReport";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { ErrorState, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import type { GlossaryKey } from "../content/glossary";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDateTime, formatFraction, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { LabelKind, ModelRecord, ModelSignal, ModelType } from "../types";

const section = SECTIONS.models;
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;
const MODELS: Array<{ id: ModelType; name: string; hint: string }> = [
  { id: "logistic", name: "Logistic regression", hint: "Linear model on standardized features. Fast, interpretable, a strong baseline." },
  { id: "random_forest", name: "Random forest", hint: "200 shallow decision trees voting together. Captures non-linear patterns; resists overfitting." },
  { id: "gradient_boosting", name: "Gradient boosting", hint: "Trees added one at a time to fix earlier mistakes (histogram-based, LightGBM-style)." },
];
const LABELS: Array<{ id: LabelKind; name: string; term: GlossaryKey }> = [
  { id: "direction", name: "Direction", term: "labelDirection" },
  { id: "return_bucket", name: "Return bucket", term: "labelBucket" },
  { id: "volatility_regime", name: "Volatility regime", term: "labelVolRegime" },
];
const RANGES = [
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
] as const;

export function ModelsPage() {
  const { token, handleAuthError } = useAuthed();
  const registry = useAuthedQuery(fetchModels, [], { action: "load your models" });
  const [symbol, setSymbol] = useState("AAPL");
  const [range, setRange] = useState<"1y" | "2y" | "5y">("5y");
  const [model, setModel] = useState<ModelType>("logistic");
  const [label, setLabel] = useState<LabelKind>("direction");
  const [horizon, setHorizon] = useState("1");
  const [testPct, setTestPct] = useState("25");
  const [embargo, setEmbargo] = useState("1");
  const [costBps, setCostBps] = useState("5");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [result, setResult] = useState<ModelRecord | null>(null);
  const [signals, setSignals] = useState<Record<string, ModelSignal | string>>({});

  const validate = () => {
    const found: Record<string, string | undefined> = {};
    if (!SYMBOL_RE.test(symbol.trim())) found.symbol = "Use a ticker like AAPL, BRK-B or RELIANCE.NS.";
    const h = Number(horizon);
    if (!Number.isInteger(h) || h < 1 || h > 20) found.horizon = "Use a whole number from 1 to 20.";
    const t = Number(testPct);
    if (!Number.isFinite(t) || t < 5 || t > 50) found.testPct = "Use 5 to 50 percent.";
    const e = Number(embargo);
    if (!Number.isInteger(e) || e < 1 || e > 20) found.embargo = "Use a whole number from 1 to 20.";
    const c = Number(costBps);
    if (!Number.isFinite(c) || c < 0 || c > 500) found.costBps = "Use 0 to 500 basis points.";
    if (selected.size === 0) found.features = "Select at least one feature group.";
    return found;
  };

  const train = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found).find((key) => found[key]);
    if (first) {
      document.getElementById(`ml-${first}`)?.focus();
      return;
    }
    setTraining(true);
    setTrainError(null);
    try {
      const record = await trainModel(token, {
        symbol: symbol.trim().toUpperCase(),
        range,
        model,
        label,
        horizon: Number(horizon),
        testFraction: Number(testPct) / 100,
        embargo: Number(embargo),
        features: [...selected],
        costBps: Number(costBps),
        slippageBps: Number(costBps),
      });
      setResult(record);
      void registry.reload();
    } catch (error) {
      if (handleAuthError(error)) return;
      const status = (error as { status?: number }).status;
      setTrainError(status === 422 ? (error as Error).message : describeError(error, "train the model"));
    } finally {
      setTraining(false);
    }
  };

  const getSignal = async (modelId: string) => {
    try {
      const signal = await predictWithModel(token, { modelId });
      setSignals((previous) => ({ ...previous, [modelId]: signal }));
    } catch (error) {
      if (handleAuthError(error)) return;
      setSignals((previous) => ({ ...previous, [modelId]: describeError(error, "generate a signal") }));
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`ml-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const invalid = (key: string) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `ml-${key}-error` : undefined });
  const modelHint = MODELS.find((item) => item.id === model)?.hint ?? "";

  return (
    <div className="page">
      <SectionHeader section={section} />

      <form className="panel panel-body stack" onSubmit={train} noValidate aria-labelledby="ml-params-heading">
        <h2 id="ml-params-heading" style={{ fontSize: "var(--text-h4)" }}>
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
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="ml-symbol">
              Symbol
            </label>
            <input id="ml-symbol" className="input" value={symbol} maxLength={20} autoCapitalize="characters" onChange={(event) => setSymbol(event.target.value)} {...invalid("symbol")} />
            {fieldError("symbol")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ml-model">
              <LabelWithHint label="Model" text={modelHint}>
                Model
              </LabelWithHint>
            </label>
            <select id="ml-model" className="select" value={model} onChange={(event) => setModel(event.target.value as ModelType)}>
              {MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ml-label">
              <LabelWithHint label="Label" term={LABELS.find((item) => item.id === label)?.term ?? "labelDirection"}>
                Label
              </LabelWithHint>
            </label>
            <select id="ml-label" className="select" value={label} onChange={(event) => setLabel(event.target.value as LabelKind)}>
              {LABELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ml-horizon">
              <LabelWithHint label="Label horizon" term="horizon">
                Horizon (bars)
              </LabelWithHint>
            </label>
            <input id="ml-horizon" className="input" inputMode="numeric" value={horizon} onChange={(event) => setHorizon(event.target.value)} {...invalid("horizon")} />
            {fieldError("horizon")}
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="ml-testPct">
              Test share (%)
            </label>
            <input id="ml-testPct" className="input" inputMode="decimal" value={testPct} onChange={(event) => setTestPct(event.target.value)} {...invalid("testPct")} />
            {fieldError("testPct")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ml-embargo">
              <LabelWithHint label="Embargo gap" term="embargo">
                Embargo (bars)
              </LabelWithHint>
            </label>
            <input id="ml-embargo" className="input" inputMode="numeric" value={embargo} onChange={(event) => setEmbargo(event.target.value)} {...invalid("embargo")} />
            {fieldError("embargo")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ml-costBps">
              <LabelWithHint label="Transaction cost" term="transactionCost">
                Costs + slippage (bps each)
              </LabelWithHint>
            </label>
            <input id="ml-costBps" className="input" inputMode="decimal" value={costBps} onChange={(event) => setCostBps(event.target.value)} {...invalid("costBps")} />
            {fieldError("costBps")}
          </div>
        </div>
        <FeatureGroupPicker id="ml-features" selected={selected} onChange={setSelected} error={errors.features} />
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <span className="text-meta">Trains on the earlier window only; every result below is measured on the later, unseen window.</span>
          <button type="submit" className="btn btn-primary" disabled={training}>
            <Icon name="flask" />
            {training ? "Training…" : "Train model"}
          </button>
        </div>
      </form>

      {trainError ? <ErrorState message={trainError} /> : null}
      {training && !result ? <Skeleton height={140} /> : null}

      {result ? (
        <div className={`stack-lg ${training ? "is-refreshing" : ""}`}>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "var(--text-h3)" }}>
              {result.symbol} · {result.modelName}
            </h2>
            <Link to={`/lab/models/${result.id}`} className="btn">
              Open in registry
              <Icon name="chevronRight" />
            </Link>
          </div>
          <ModelVerdict record={result} />
          <ModelKpis record={result} />
          <ModelEvaluation record={result} />
          <ExperimentTrackingNote record={result} />
        </div>
      ) : null}

      <section className="table-frame" aria-labelledby="registry-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="registry-heading" style={{ fontSize: "var(--text-h4)" }}>
            Model registry
          </h2>
          <span className="text-meta">Every training run is kept; retraining adds a new entry</span>
        </div>
        {registry.loading ? (
          <SkeletonRows rows={3} />
        ) : registry.error ? (
          <div className="panel-body">
            <ErrorState message={registry.error} onRetry={() => void registry.reload()} />
          </div>
        ) : registry.data?.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Label</th>
                  <th scope="col" className="right">Test accuracy</th>
                  <th scope="col" className="right">Baseline</th>
                  <th scope="col" className="right">Strategy vs B&amp;H</th>
                  <th scope="col">Trained</th>
                  <th scope="col">Signal</th>
                </tr>
              </thead>
              <tbody>
                {registry.data.map((item) => {
                  const signal = signals[item.id];
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/lab/models/${item.id}`} className="row-select">
                          {item.symbol} · {item.modelName}
                          <Icon name="chevronRight" className="icon chevron" />
                        </Link>
                      </td>
                      <td className="text-secondary">
                        {item.label.kind} · h{item.label.horizon}
                      </td>
                      <td className="right num">{formatFraction(item.accuracy, 1)}</td>
                      <td className="right num text-secondary">{formatFraction(item.baselineAccuracy, 1)}</td>
                      <td className="right num">
                        {formatSignedFraction(item.strategyReturn)} <span className="text-meta">vs {formatSignedFraction(item.buyHoldReturn)}</span>
                      </td>
                      <td className="text-secondary num">{formatDateTime(item.trainedAt)}</td>
                      <td>
                        {signal && typeof signal !== "string" ? (
                          <span>{signal.signal === "buy" ? "Buy" : "Stay flat"} · {signal.predictionName}</span>
                        ) : (
                          <button type="button" className="btn" onClick={() => void getSignal(item.id)}>
                            Get signal
                          </button>
                        )}
                        {typeof signal === "string" ? <div className="field-error">{signal}</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="state-block">
            <h3 style={{ fontSize: "var(--text-body)" }}>No models yet</h3>
            <p>Train your first model above — it's registered here with its features, window, parameters, and test results.</p>
          </div>
        )}
      </section>
    </div>
  );
}

