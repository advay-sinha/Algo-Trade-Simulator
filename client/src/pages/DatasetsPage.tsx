// Pattern 9 — Analytics (report runner): parameters → build → results on the same page.
import { useState, type FormEvent } from "react";
import { previewDataset } from "../api";
import { FeatureGroupPicker } from "../components/ml/FeatureGroupPicker";
import { SplitTimeline } from "../components/ml/SplitTimeline";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { DataSourceBadge, ErrorState, MetricCard, SectionHeader, Skeleton } from "../components/ui/primitives";
import type { GlossaryKey } from "../content/glossary";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDate, formatFraction, formatInteger } from "../lib/format";
import { useAuthed } from "../lib/session";
import type { DatasetPreview, DatasetPreviewRow, LabelKind, LabelShare } from "../types";

const section = SECTIONS.datasets;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;
const RANGES = [
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
] as const;
const LABELS: Array<{ id: LabelKind; name: string; term: GlossaryKey }> = [
  { id: "direction", name: "Direction", term: "labelDirection" },
  { id: "return_bucket", name: "Return bucket", term: "labelBucket" },
  { id: "volatility_regime", name: "Volatility regime", term: "labelVolRegime" },
];

function fmt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  return abs !== 0 && (abs < 0.001 || abs >= 10_000) ? value.toExponential(2) : value.toFixed(4);
}

/** Grouped horizontal bars: share of each label in train (series 1) and test (series 2). */
function LabelBalance({ train, test }: { train: LabelShare[]; test: LabelShare[] }) {
  return (
    <div className="stack" style={{ gap: "var(--space-3)" }}>
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-key" style={{ background: "var(--series-1)", height: 8, width: 12 }} aria-hidden="true" />
          Train
        </span>
        <span className="legend-item">
          <span className="legend-key" style={{ background: "var(--series-2)", height: 8, width: 12 }} aria-hidden="true" />
          Test
        </span>
      </div>
      <table className="table" style={{ fontSize: "var(--text-secondary)" }}>
        <caption className="visually-hidden">Label distribution in train and test</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Share</th>
            <th scope="col" className="right">
              Train
            </th>
            <th scope="col" className="right">
              Test
            </th>
          </tr>
        </thead>
        <tbody>
          {train.map((row, index) => {
            const testRow = test[index];
            return (
              <tr key={row.label}>
                <th scope="row" style={{ position: "static", fontWeight: 500, textAlign: "left" }}>
                  {row.name}
                </th>
                <td style={{ width: "50%" }}>
                  <div className="stack" style={{ gap: 2 }} aria-hidden="true">
                    <span style={{ display: "block", height: 10, width: `${row.share * 100}%`, background: "var(--series-1)", borderRadius: "0 4px 4px 0" }} />
                    <span style={{ display: "block", height: 10, width: `${(testRow?.share ?? 0) * 100}%`, background: "var(--series-2)", borderRadius: "0 4px 4px 0" }} />
                  </div>
                </td>
                <td className="right num">
                  {formatFraction(row.share, 1)} <span className="text-meta">({row.count})</span>
                </td>
                <td className="right num">
                  {formatFraction(testRow?.share, 1)} <span className="text-meta">({testRow?.count ?? 0})</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ rows, names, caption }: { rows: DatasetPreviewRow[]; names: string[]; caption: string }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" className="right">
              Label
            </th>
            {names.map((name) => (
              <th key={name} scope="col" className="right mono">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.timestamp}>
              <td className="num">{formatDate(row.timestamp)}</td>
              <td className="right num">{row.label}</td>
              {names.map((name) => (
                <td key={name} className="right num">
                  {fmt(row.values[name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DatasetsPage() {
  const { token, handleAuthError } = useAuthed();
  const [symbol, setSymbol] = useState("AAPL");
  const [range, setRange] = useState<"1y" | "2y" | "5y">("2y");
  const [label, setLabel] = useState<LabelKind>("direction");
  const [horizon, setHorizon] = useState("1");
  const [testPct, setTestPct] = useState("25");
  const [embargo, setEmbargo] = useState("1");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);

  const validate = () => {
    const found: Record<string, string | undefined> = {};
    if (!SYMBOL_RE.test(symbol.trim())) found.symbol = "Use a ticker like AAPL, BRK-B or RELIANCE.NS.";
    const h = Number(horizon);
    if (!Number.isInteger(h) || h < 1 || h > 20) found.horizon = "Use a whole number from 1 to 20.";
    const t = Number(testPct);
    if (!Number.isFinite(t) || t < 5 || t > 50) found.testPct = "Use 5 to 50 percent.";
    const e = Number(embargo);
    if (!Number.isInteger(e) || e < 1 || e > 20) found.embargo = "Use a whole number from 1 to 20.";
    if (selected.size === 0) found.features = "Select at least one feature group.";
    return found;
  };

  const build = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found).find((key) => found[key]);
    if (first) {
      document.getElementById(`ds-${first}`)?.focus();
      return;
    }
    setBuilding(true);
    setBuildError(null);
    try {
      setPreview(
        await previewDataset(token, {
          symbol: symbol.trim().toUpperCase(),
          range,
          features: [...selected],
          label,
          horizon: Number(horizon),
          testFraction: Number(testPct) / 100,
          embargo: Number(embargo),
        }),
      );
    } catch (error) {
      if (handleAuthError(error)) return;
      const status = (error as { status?: number }).status;
      setBuildError(status === 422 ? (error as Error).message : describeError(error, "build the dataset"));
    } finally {
      setBuilding(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`ds-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const invalid = (key: string) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `ds-${key}-error` : undefined });
  const majority = preview ? Math.max(...preview.labelDistribution.train.map((row) => row.share)) : null;

  return (
    <div className="page">
      <SectionHeader section={section} />

      <form className="panel panel-body stack" onSubmit={build} noValidate aria-labelledby="ds-params-heading">
        <h2 id="ds-params-heading" style={{ fontSize: "var(--text-h4)" }}>
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
            <label className="field-label" htmlFor="ds-symbol">
              Symbol
            </label>
            <input id="ds-symbol" className="input" value={symbol} maxLength={20} autoCapitalize="characters" onChange={(event) => setSymbol(event.target.value)} {...invalid("symbol")} />
            {fieldError("symbol")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ds-label">
              <LabelWithHint label="Label" term={LABELS.find((item) => item.id === label)?.term ?? "labelDirection"}>
                Label
              </LabelWithHint>
            </label>
            <select id="ds-label" className="select" value={label} onChange={(event) => setLabel(event.target.value as LabelKind)}>
              {LABELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ds-horizon">
              <LabelWithHint label="Label horizon" term="horizon">
                Horizon (bars)
              </LabelWithHint>
            </label>
            <input id="ds-horizon" className="input" inputMode="numeric" value={horizon} onChange={(event) => setHorizon(event.target.value)} {...invalid("horizon")} />
            {fieldError("horizon")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ds-testPct">
              <LabelWithHint label="Train / test split" text={featureText("split")}>
                Test share (%)
              </LabelWithHint>
            </label>
            <input id="ds-testPct" className="input" inputMode="decimal" value={testPct} onChange={(event) => setTestPct(event.target.value)} {...invalid("testPct")} />
            {fieldError("testPct")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ds-embargo">
              <LabelWithHint label="Embargo gap" term="embargo">
                Embargo (bars)
              </LabelWithHint>
            </label>
            <input id="ds-embargo" className="input" inputMode="numeric" value={embargo} onChange={(event) => setEmbargo(event.target.value)} {...invalid("embargo")} />
            {fieldError("embargo")}
          </div>
        </div>

        <FeatureGroupPicker id="ds-features" selected={selected} onChange={setSelected} error={errors.features} />

        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <span className="text-meta">Nothing is stored — the preview is computed on demand.</span>
          <button type="submit" className="btn btn-primary" disabled={building}>
            <Icon name="table" />
            {building ? "Building dataset…" : "Build dataset"}
          </button>
        </div>
      </form>

      {buildError ? <ErrorState message={buildError} /> : null}

      {building && !preview ? <Skeleton height={120} /> : null}

      {preview ? (
        <div className={`stack-lg ${building ? "is-refreshing" : ""}`}>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "var(--text-h3)" }}>
              {preview.symbol} · {preview.shape.rows} rows × {preview.shape.columns} features
            </h2>
            <DataSourceBadge source={preview.dataSource} />
          </div>

          <section aria-label="Dataset summary" className="kpi-strip">
            <MetricCard label="Complete rows" value={formatInteger(preview.shape.rows)} sub={`from ${preview.inputBars} daily bars`} />
            <MetricCard label="Rows dropped" term="warmup" value={formatInteger(preview.droppedRows)} sub="Warm-up + unknown future" />
            <MetricCard label="Train / test" value={`${preview.split.trainRows} / ${preview.split.testRows}`} sub={`${preview.split.embargoBars}-bar embargo`} />
            <MetricCard
              label="Majority-class share"
              term="baselineAccuracy"
              value={formatFraction(majority, 1)}
              sub="Accuracy a model must beat"
            />
          </section>

          <section className="panel panel-body stack" aria-labelledby="ds-split-heading">
            <h2 id="ds-split-heading" style={{ fontSize: "var(--text-h4)" }}>
              <LabelWithHint label="Train / test split" text={featureText("split")}>
                Time-ordered split
              </LabelWithHint>
            </h2>
            <SplitTimeline split={preview.split} />
          </section>

          <section className="panel panel-body stack" aria-labelledby="ds-balance-heading">
            <h2 id="ds-balance-heading" style={{ fontSize: "var(--text-h4)" }}>
              <LabelWithHint label="Label balance" text={featureText("balance")}>
                Label balance · horizon {preview.label.horizon}
              </LabelWithHint>
            </h2>
            <LabelBalance train={preview.labelDistribution.train} test={preview.labelDistribution.test} />
          </section>

          <section className="table-frame" aria-labelledby="ds-stats-heading">
            <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
              <h2 id="ds-stats-heading" style={{ fontSize: "var(--text-h4)" }}>
                Features (training-set statistics)
              </h2>
              <span className="text-meta">Statistics use train rows only — scaling never peeks at test data</span>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col" className="right">Mean</th>
                    <th scope="col" className="right">Std</th>
                    <th scope="col" className="right">Min</th>
                    <th scope="col" className="right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.featureNames.map((name) => {
                    const stat = preview.trainStats[name];
                    return (
                      <tr key={name}>
                        <td className="mono">{name}</td>
                        <td className="right num">{fmt(stat?.mean)}</td>
                        <td className="right num">{fmt(stat?.std)}</td>
                        <td className="right num">{fmt(stat?.min)}</td>
                        <td className="right num">{fmt(stat?.max)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="table-frame" aria-labelledby="ds-preview-heading">
            <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
              <h2 id="ds-preview-heading" style={{ fontSize: "var(--text-h4)" }}>
                First and last rows
              </h2>
              <span className="text-meta">Scroll sideways for every feature</span>
            </div>
            <PreviewTable rows={preview.head} names={preview.featureNames} caption="First five rows" />
            <div className="panel-footer text-meta">…</div>
            <PreviewTable rows={preview.tail} names={preview.featureNames} caption="Last five rows" />
          </section>
        </div>
      ) : null}
    </div>
  );
}
