// Pattern 9 — Analytics (report runner): dataset + settings + strategies → comparison.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { compareResearch, fetchRankingExperiments, fetchResearchDatasets, fetchResearchRuns, fetchResearchStrategies } from "../api";
import { MaturityPill } from "../components/strategy/ResearchViews";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { EmptyState, ErrorState, FeatureGrid, Notice, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDate, formatDateTime, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { ResearchParamSpec, ResearchStrategy } from "../types";

const section = SECTIONS.strategyLab;
const BASELINE = "equal-weight-universe";
type ParamDraft = Record<string, string>;

function defaults(strategy: ResearchStrategy): ParamDraft {
  return Object.fromEntries(strategy.parameters.map((param) => [param.name, param.default != null ? String(param.default) : ""]));
}

function checkParam(spec: ResearchParamSpec, raw: string): string | undefined {
  if (spec.options?.length) return spec.options.includes(raw) ? undefined : "Choose one of the options.";
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) return "Enter a number.";
  if (spec.type === "integer" && !Number.isInteger(value)) return "Use a whole number.";
  if (spec.minimum != null && value < spec.minimum) return `Use ${spec.minimum} or more.`;
  if (spec.maximum != null && value > spec.maximum) return `Use ${spec.maximum} or less.`;
  return undefined;
}

function universeName(id: string) {
  return id === "nifty100-current" ? "Nifty 100 (current members)" : id === "nifty50-current" ? "Nifty 50 (current members)" : id;
}

export function StrategyLabPage() {
  const { token, handleAuthError } = useAuthed();
  const navigate = useNavigate();
  const datasets = useAuthedQuery(fetchResearchDatasets, [], { action: "load research datasets" });
  const strategies = useAuthedQuery(fetchResearchStrategies, [], { action: "load strategies" });
  const recent = useAuthedQuery(fetchResearchRuns, [], { action: "load recent research" });
  const rankings = useAuthedQuery(fetchRankingExperiments, [], { action: "load ranking experiments" });

  const [datasetVersion, setDatasetVersion] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capital, setCapital] = useState("1000000");
  const [brokerage, setBrokerage] = useState<"zero" | "flat">("zero");
  const [slippage, setSlippage] = useState("5");
  const [participation, setParticipation] = useState("5");
  const [minTradedCr, setMinTradedCr] = useState("5");
  const [riskFree, setRiskFree] = useState("0");
  const [selected, setSelected] = useState<Record<string, boolean>>({ "xs-momentum": true, "vol-trend": true });
  const [params, setParams] = useState<Record<string, ParamDraft>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetVersion && datasets.data?.length) setDatasetVersion(datasets.data[0].version);
  }, [datasets.data, datasetVersion]);
  useEffect(() => {
    if (strategies.data) setParams((previous) => Object.fromEntries(strategies.data!.map((s) => [s.id, previous[s.id] ?? defaults(s)])));
  }, [strategies.data]);

  const dataset = useMemo(() => datasets.data?.find((item) => item.version === datasetVersion), [datasets.data, datasetVersion]);
  // ML ranking needs a stored experiment; it runs from its model card (ML ranking experiments below).
  const choices = (strategies.data ?? []).filter((s) => s.id !== BASELINE && s.id !== "ml-ranking");

  const validate = () => {
    const found: Record<string, string | undefined> = {};
    const numberIn = (key: string, raw: string, min: number, max: number, message: string) => {
      const value = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(value) || value < min || value > max) found[key] = message;
    };
    numberIn("capital", capital, 10_000, 10_000_000_000, "Use ₹10,000 to ₹1,000 crore.");
    numberIn("slippage", slippage, 0, 500, "Use 0 to 500 basis points.");
    numberIn("participation", participation, 0, 100, "Use 0 to 100 percent (0 turns the cap off).");
    numberIn("minTraded", minTradedCr, 0, 100_000, "Use 0 or more (₹ crore).");
    numberIn("riskFree", riskFree, 0, 20, "Use 0 to 20 (percent per year).");
    if (start && end && start >= end) found.end = "End must be after start.";
    if (!choices.some((s) => selected[s.id])) found.strategies = "Pick at least one strategy to compare with the baseline.";
    for (const strategy of choices) {
      if (!selected[strategy.id]) continue;
      for (const param of strategy.parameters) {
        const message = checkParam(param, params[strategy.id]?.[param.name] ?? "");
        if (message) found[`${strategy.id}-${param.name}`] = message;
      }
    }
    return found;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found).find((key) => found[key]);
    if (first) {
      document.getElementById(`sr-${first}`)?.focus();
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const comparison = await compareResearch(token, {
        datasetVersion,
        start: start || undefined,
        end: end || undefined,
        capital: Number(capital),
        feeSchedule: "nse-delivery",
        brokerage,
        slippageBps: Number(slippage),
        participationCap: Number(participation) / 100,
        minMedianTradedValueInr: Number(minTradedCr) * 10_000_000,
        priceFloor: 10,
        riskFreeRate: Number(riskFree) / 100,
        costStress: 2,
        strategies: choices
          .filter((s) => selected[s.id])
          .map((s) => ({
            strategy: s.id,
            params: Object.fromEntries(s.parameters.map((p) => [p.name, p.options?.length ? params[s.id][p.name] : Number(params[s.id][p.name])])),
          })),
      });
      navigate(`/lab/runs/${comparison.id}`);
    } catch (error) {
      if (handleAuthError(error)) return;
      const status = (error as { status?: number }).status;
      setRunError(status === 422 ? (error as Error).message : describeError(error, "run the comparison"));
    } finally {
      setRunning(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`sr-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const invalid = (key: string) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `sr-${key}-error` : undefined });

  const noDatasets = datasets.data && datasets.data.length === 0;

  return (
    <div className="page">
      <SectionHeader section={section} />
      <FeatureGrid features={section.features} />

      {datasets.error ? <ErrorState message={datasets.error} onRetry={() => void datasets.reload()} /> : null}
      {datasets.loading ? <SkeletonRows rows={4} /> : null}
      {noDatasets ? (
        <EmptyState
          icon="database"
          title="No research dataset yet"
          body="Comparisons run on a frozen price snapshot of a universe. None has been published to this workspace yet; once one is, it appears here with its period and coverage."
        />
      ) : null}

      {dataset ? (
        <form className="panel panel-body stack" onSubmit={submit} noValidate aria-labelledby="sr-settings-heading">
          <h2 id="sr-settings-heading" style={{ fontSize: "var(--text-h4)" }}>
            Settings shared by every run
          </h2>
          <div className="form-row">
            <div className="field">
              <label className="field-label" htmlFor="sr-dataset">
                <LabelWithHint label="Research snapshot" term="researchSnapshot">
                  Dataset
                </LabelWithHint>
              </label>
              <select id="sr-dataset" className="select" value={datasetVersion} onChange={(event) => setDatasetVersion(event.target.value)}>
                {(datasets.data ?? []).map((item) => (
                  <option key={item.version} value={item.version}>
                    {universeName(item.universe)} · {formatDate(item.period.start)} – {formatDate(item.period.end)} · {item.version.slice(0, 8)}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {dataset.symbolCount} stocks · {dataset.period.sessions} sessions · downloaded {formatDate(dataset.downloadedAt)}
              </span>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-start">
                Start <span className="field-optional">(optional)</span>
              </label>
              <input id="sr-start" className="input" type="date" value={start} min={dataset.period.start} max={dataset.period.end} onChange={(event) => setStart(event.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-end">
                End <span className="field-optional">(optional)</span>
              </label>
              <input id="sr-end" className="input" type="date" value={end} min={dataset.period.start} max={dataset.period.end} onChange={(event) => setEnd(event.target.value)} {...invalid("end")} />
              {fieldError("end")}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-capital">
                Capital (₹)
              </label>
              <input id="sr-capital" className="input" inputMode="numeric" value={capital} onChange={(event) => setCapital(event.target.value)} {...invalid("capital")} />
              {fieldError("capital")}
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <span className="field-label" id="sr-brokerage-label">
                <LabelWithHint label="Charges" term="statutoryCharges">
                  Brokerage
                </LabelWithHint>
              </span>
              <div className="segmented" role="group" aria-labelledby="sr-brokerage-label">
                <button type="button" aria-pressed={brokerage === "zero"} onClick={() => setBrokerage("zero")}>
                  Zero
                </button>
                <button type="button" aria-pressed={brokerage === "flat"} onClick={() => setBrokerage("flat")}>
                  ₹20 / order
                </button>
              </div>
              <span className="field-hint">Statutory charges always apply</span>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-slippage">
                Slippage (bps)
              </label>
              <input id="sr-slippage" className="input" inputMode="decimal" value={slippage} onChange={(event) => setSlippage(event.target.value)} {...invalid("slippage")} />
              {fieldError("slippage")}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-participation">
                <LabelWithHint label="Participation cap" term="participationCap">
                  Max % of daily volume
                </LabelWithHint>
              </label>
              <input id="sr-participation" className="input" inputMode="decimal" value={participation} onChange={(event) => setParticipation(event.target.value)} {...invalid("participation")} />
              {fieldError("participation")}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-minTraded">
                Min daily traded value (₹ cr)
              </label>
              <input id="sr-minTraded" className="input" inputMode="decimal" value={minTradedCr} onChange={(event) => setMinTradedCr(event.target.value)} {...invalid("minTraded")} />
              {fieldError("minTraded")}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sr-riskFree">
                <LabelWithHint label="Risk-free rate" term="riskFreeRate">
                  Risk-free rate (% / yr)
                </LabelWithHint>
              </label>
              <input id="sr-riskFree" className="input" inputMode="decimal" value={riskFree} onChange={(event) => setRiskFree(event.target.value)} {...invalid("riskFree")} />
              {fieldError("riskFree")}
            </div>
          </div>

          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={errors.strategies ? "sr-strategies-error" : undefined}>
            <legend style={{ fontSize: "var(--text-h4)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Strategies</legend>
            {strategies.error ? <ErrorState message={strategies.error} onRetry={() => void strategies.reload()} /> : null}
            {strategies.loading ? <SkeletonRows rows={2} /> : null}
            {choices.map((strategy) => (
              <div key={strategy.id} className="table-frame panel-body stack" style={{ gap: "var(--space-3)" }}>
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <label className="cluster" htmlFor={`sr-include-${strategy.id}`} style={{ gap: "var(--space-2)", fontWeight: 600 }}>
                    <input
                      id={`sr-include-${strategy.id}`}
                      type="checkbox"
                      checked={Boolean(selected[strategy.id])}
                      onChange={(event) => setSelected((previous) => ({ ...previous, [strategy.id]: event.target.checked }))}
                    />
                    {strategy.name}
                  </label>
                  <MaturityPill maturity={strategy.metadata.maturity} />
                </div>
                <p className="text-secondary" style={{ margin: 0 }}>
                  {strategy.description} Rebalances {strategy.metadata.rebalance}; needs {strategy.metadata.warmupSessions} sessions of history.
                </p>
                <details>
                  <summary className="text-secondary">Method details</summary>
                  <dl className="stack" style={{ margin: "var(--space-2) 0 0", gap: "var(--space-2)" }}>
                    <div>
                      <dt className="list-row-title">Data needed</dt>
                      <dd style={{ margin: 0 }} className="text-secondary">{strategy.metadata.dataRequirements}</dd>
                    </div>
                    <div>
                      <dt className="list-row-title">Holding horizon</dt>
                      <dd style={{ margin: 0 }} className="text-secondary">{strategy.metadata.holdingHorizon}</dd>
                    </div>
                    <div>
                      <dt className="list-row-title">Risk controls</dt>
                      <dd style={{ margin: 0 }} className="text-secondary">{strategy.metadata.riskControls.join(" ")}</dd>
                    </div>
                    {strategy.metadata.caveats?.length ? (
                      <div>
                        <dt className="list-row-title">Caveats</dt>
                        <dd style={{ margin: 0 }} className="text-secondary">{strategy.metadata.caveats.join(" ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
                {selected[strategy.id] ? (
                  <div className="form-row">
                    {strategy.parameters.map((param) => {
                      const key = `${strategy.id}-${param.name}`;
                      const value = params[strategy.id]?.[param.name] ?? "";
                      const set = (next: string) => setParams((previous) => ({ ...previous, [strategy.id]: { ...previous[strategy.id], [param.name]: next } }));
                      return (
                        <div className="field" key={key}>
                          <label className="field-label" htmlFor={`sr-${key}`}>
                            {param.description ? (
                              <LabelWithHint label={param.label} text={param.description}>
                                {param.label}
                              </LabelWithHint>
                            ) : (
                              param.label
                            )}
                          </label>
                          {param.options?.length ? (
                            <select id={`sr-${key}`} className="select" value={value} onChange={(event) => set(event.target.value)}>
                              {param.options.map((option) => (
                                <option key={option} value={option}>
                                  {option.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={`sr-${key}`}
                              className="input"
                              inputMode={param.type === "integer" ? "numeric" : "decimal"}
                              value={value}
                              onChange={(event) => set(event.target.value)}
                              onBlur={() => setErrors((previous) => ({ ...previous, [key]: checkParam(param, value) }))}
                              {...invalid(key)}
                            />
                          )}
                          {fieldError(key)}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
            {errors.strategies ? (
              <span className="field-error" id="sr-strategies-error">
                {errors.strategies}
              </span>
            ) : null}
            <p className="text-meta" style={{ margin: 0 }}>
              The equal-weight universe baseline and a rerun of each strategy at double charges are always added.
            </p>
          </fieldset>

          {dataset.survivorshipBiased ? (
            <Notice tone="warn" icon="alert">
              This universe uses today's index members, so results are survivorship-biased — baselines included.
            </Notice>
          ) : null}
          {runError ? <ErrorState message={runError} /> : null}
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={running || !strategies.data}>
              <Icon name="trend" />
              {running ? "Running comparison…" : "Run comparison"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="table-frame" aria-labelledby="sr-ranking-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="sr-ranking-heading" style={{ fontSize: "var(--text-h4)" }}>
            ML ranking experiments
          </h2>
          <span className="text-meta">Trained offline; open one for its model card</span>
        </div>
        {rankings.loading ? (
          <SkeletonRows rows={2} />
        ) : rankings.error ? (
          <div className="panel-body">
            <ErrorState message={rankings.error} onRetry={() => void rankings.reload()} />
          </div>
        ) : rankings.data?.length ? (
          <ul className="list-plain">
            {rankings.data.map((item) => (
              <li key={item.id}>
                <Link to={`/lab/ranking/${item.id}`} className="list-row">
                  <div className="list-row-main">
                    <span className="list-row-title">
                      {universeName(item.dataset.universe)} · experiment {item.id.slice(0, 8)}
                    </span>
                    <span className="text-meta">
                      {Object.values(item.families)
                        .map((family) => `${family.name}: ${family.maturity}, validation IC ${family.validationMeanIc == null ? "—" : family.validationMeanIc.toFixed(3)}`)
                        .join(" · ")}
                      {` · holdout ${item.holdoutUses ? "used" : "untouched"}`}
                    </span>
                  </div>
                  <Icon name="chevronRight" className="icon chevron" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="state-block">
            <h3 style={{ fontSize: "var(--text-body)" }}>No ranking experiment yet</h3>
            <p>Ranking models are trained offline on a research dataset and appear here with their evidence once stored.</p>
          </div>
        )}
      </section>

      <section className="table-frame" aria-labelledby="sr-recent-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="sr-recent-heading" style={{ fontSize: "var(--text-h4)" }}>
            Recent research
          </h2>
        </div>
        {recent.loading ? (
          <SkeletonRows rows={3} />
        ) : recent.error ? (
          <div className="panel-body">
            <ErrorState message={recent.error} onRetry={() => void recent.reload()} />
          </div>
        ) : recent.data?.length ? (
          <ul className="list-plain">
            {recent.data
              .filter((item) => item.kind === "comparison" || !item.comparisonId)
              .slice(0, 8)
              .map((item) => (
                <li key={item.id}>
                  <Link to={`/lab/runs/${item.id}`} className="list-row">
                    <div className="list-row-main">
                      <span className="list-row-title">{item.kind === "comparison" ? `Comparison: ${item.label}` : item.label}</span>
                      <span className="text-meta">
                        {item.period ? `${formatDate(item.period.start)} – ${formatDate(item.period.end)} · ` : ""}
                        {formatDateTime(item.createdAt)}
                        {item.strategy ? ` · ${item.strategy.maturity}` : ""}
                        {item.status?.replayIdentical === true ? " · replayed identically" : item.status?.replayIdentical === false ? " · replay differed" : ""}
                        {item.status?.tracked ? " · tracked" : ""}
                      </span>
                    </div>
                    {item.headline?.totalReturn != null ? (
                      <span className={`num ${item.headline.totalReturn >= 0 ? "up" : "down"}`}>{formatSignedFraction(item.headline.totalReturn)}</span>
                    ) : null}
                    <Icon name="chevronRight" className="icon chevron" />
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <div className="state-block">
            <h3 style={{ fontSize: "var(--text-body)" }}>No research runs yet</h3>
            <p>Run a comparison above — every run and comparison is saved here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
