import { useMemo } from "react";
import { formatDateTime, formatFraction, formatSignedFraction } from "../../lib/format";
import type { ModelRecord, ModelSignal } from "../../types";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { Icon } from "../ui/Icon";
import { LabelWithHint } from "../ui/InfoHint";
import { DataSourceBadge, MetricCard, Notice } from "../ui/primitives";
import { SplitTimeline } from "./SplitTimeline";

const ratio = (value: number | null | undefined, digits = 3) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—");

/** One-paragraph honest verdict: did the model beat the naive baselines on unseen data? */
export function ModelVerdict({ record }: { record: ModelRecord }) {
  const c = record.classification;
  const s = record.strategy.summary;
  const beatsBaseline = c.beatsBaseline;
  const beatsBuyHold = s.totalReturn > s.buyHoldReturn;
  const tone = beatsBaseline && beatsBuyHold ? "info" : "warn";
  return (
    <Notice tone={tone} icon={tone === "info" ? "check" : "alert"}>
      On the unseen test window ({record.split.testRows} days) the model was right {formatFraction(c.accuracy, 1)} of the time versus{" "}
      {formatFraction(c.baselineAccuracy, 1)} for always guessing the most common label — it{" "}
      <strong style={{ fontWeight: 600 }}>{beatsBaseline ? "beat" : "did not beat"}</strong> that baseline. Trading its signals after costs returned{" "}
      {formatSignedFraction(s.totalReturn)} versus {formatSignedFraction(s.buyHoldReturn)} for buy-and-hold, so it{" "}
      <strong style={{ fontWeight: 600 }}>{beatsBuyHold ? "outperformed" : "underperformed"}</strong> simply holding.{" "}
      {!beatsBaseline ? "Next-day direction is close to a coin flip for liquid stocks; this is the expected, honest outcome." : ""}
    </Notice>
  );
}

export function ModelKpis({ record }: { record: ModelRecord }) {
  const c = record.classification;
  const s = record.strategy;
  return (
    <section aria-label="Model results" className="kpi-strip">
      <MetricCard
        label="Test accuracy"
        term="testAccuracy"
        value={formatFraction(c.accuracy, 1)}
        sub={`Baseline ${formatFraction(c.baselineAccuracy, 1)} · ${c.beatsBaseline ? "beats it" : "doesn't beat it"}`}
      />
      <MetricCard label="ROC-AUC" term="rocAuc" value={ratio(c.rocAuc)} muted={c.rocAuc == null} sub={c.rocAuc == null ? c.rocAucReason ?? undefined : "0.5 = coin flip"} />
      <MetricCard label={c.averaging === "macro" ? "F1 (macro)" : "F1"} term="f1" value={ratio(c.f1)} />
      <MetricCard
        label="Strategy return"
        term="totalReturn"
        value={<span className={s.summary.totalReturn >= 0 ? "up" : "down"}>{formatSignedFraction(s.summary.totalReturn)}</span>}
        sub={`Buy-and-hold ${formatSignedFraction(s.summary.buyHoldReturn)} · after costs`}
      />
      <MetricCard label="Strategy Sharpe" term="sharpe" value={ratio(s.metrics.sharpe, 2)} muted={s.metrics.sharpe == null} sub={s.metrics.sharpe == null ? s.unavailable.sharpe : `Buy-and-hold ${ratio(s.buyHoldMetrics.sharpe, 2)}`} />
    </section>
  );
}

export function ConfusionMatrix({ record }: { record: ModelRecord }) {
  const { labels, matrix } = record.classification.confusionMatrix;
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="table-scroll">
      <table className="table" style={{ width: "auto", minWidth: 320 }}>
        <caption className="visually-hidden">Confusion matrix: rows are actual labels, columns are predicted labels</caption>
        <thead>
          <tr>
            <th scope="col">Actual ↓ / Predicted →</th>
            {labels.map((label) => (
              <th key={label} scope="col" className="right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" style={{ position: "static", textAlign: "left", fontWeight: 500 }}>
                {labels[i]}
              </th>
              {row.map((count, j) => (
                <td
                  key={j}
                  className="right num"
                  style={{
                    background: `color-mix(in srgb, var(--series-1) ${Math.round((count / max) * 28)}%, transparent)`,
                    fontWeight: i === j ? 600 : 400,
                  }}
                >
                  {count}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModelEvaluation({ record }: { record: ModelRecord }) {
  const lines = useMemo(
    () => [
      { id: "model", label: `${record.modelName} signals`, colorVar: "--series-1", points: record.strategy.equity },
      { id: "buyhold", label: `Buy-and-hold ${record.symbol}`, colorVar: "--series-2", points: record.strategy.buyHold },
    ],
    [record],
  );
  return (
    <div className="stack-lg">
      <section className="panel panel-body stack" aria-labelledby="model-split-heading">
        <h2 id="model-split-heading" style={{ fontSize: "var(--text-h4)" }}>
          <LabelWithHint label="Train / test split" term="trainTestSplit">
            Trained on the earlier window, tested on the later one
          </LabelWithHint>
        </h2>
        <SplitTimeline split={record.split} />
      </section>

      <section className="panel" aria-labelledby="model-equity-heading">
        <div className="panel-header">
          <h2 id="model-equity-heading" style={{ fontSize: "var(--text-h4)" }}>
            Test-window backtest of the model's signals
          </h2>
          <DataSourceBadge source={record.dataSource} />
        </div>
        <div className="panel-body stack">
          <p className="text-secondary">
            {record.strategy.rule} Costs {record.strategy.costs.costBps} bps + slippage {record.strategy.costs.slippageBps} bps per fill, next-day-open fills.
          </p>
          <TimeSeriesChart lines={lines} valueFormat="money" ariaLabel={`Equity of the model's signals versus buy-and-hold over the test window.`} />
        </div>
      </section>

      <div className="grid-2">
        <section className="panel panel-body stack" aria-labelledby="cm-heading">
          <h2 id="cm-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Confusion matrix" term="confusionMatrix">
              Confusion matrix (test)
            </LabelWithHint>
          </h2>
          <ConfusionMatrix record={record} />
        </section>
        <section className="table-frame" aria-labelledby="perclass-heading">
          <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
            <h2 id="perclass-heading" style={{ fontSize: "var(--text-h4)" }}>
              Per-class results
            </h2>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col" className="right">
                    <LabelWithHint label="Precision" term="precision">
                      Precision
                    </LabelWithHint>
                  </th>
                  <th scope="col" className="right">
                    <LabelWithHint label="Recall" term="recall">
                      Recall
                    </LabelWithHint>
                  </th>
                  <th scope="col" className="right">F1</th>
                  <th scope="col" className="right">Support</th>
                </tr>
              </thead>
              <tbody>
                {record.classification.perClass.map((row) => (
                  <tr key={row.label}>
                    <td>{row.name}</td>
                    <td className="right num">{ratio(row.precision)}</td>
                    <td className="right num">{ratio(row.recall)}</td>
                    <td className="right num">{ratio(row.f1)}</td>
                    <td className="right num">{row.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ModelConfiguration({ record }: { record: ModelRecord }) {
  const rows: Array<[string, string]> = [
    ["Model", `${record.modelName} (${record.modelType})`],
    ["Hyperparameters", Object.entries(record.hyperparams).map(([k, v]) => `${k} = ${v}`).join(", ")],
    ["Label", `${record.label.kind}, horizon ${record.label.horizon} bar(s)`],
    ["Features", `${record.featureNames.length} columns from ${Object.keys(record.featureConfig).join(", ")}`],
    ["History", `${record.range} of daily bars · train ${record.split.trainRows} / embargo ${record.split.embargoBars} / test ${record.split.testRows}`],
    ["Artifact", `${(record.artifactBytes / 1024).toFixed(1)} KB, stored server-side with the registry entry`],
    ["Trained", formatDateTime(record.trainedAt)],
    ["Model id", record.id],
  ];
  return (
    <div className="stack">
      <div className="table-frame">
        <dl style={{ margin: 0 }}>
          {rows.map(([term, value]) => (
            <div className="list-row" key={term} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main">
                <dt className="list-row-title">{term}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere" }} className="text-secondary">
                  {value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
      <ExperimentTrackingNote record={record} />
    </div>
  );
}

export function ExperimentTrackingNote({ record }: { record: Pick<ModelRecord, "tracking"> }) {
  const tracking = record.tracking;
  if (!tracking || !tracking.enabled) {
    return <p className="text-meta">Experiment tracking is off on this server. When an MLflow tracking server is configured, every training run is also logged there.</p>;
  }
  if (!tracking.logged) {
    return <p className="text-meta">Experiment tracking is configured but this run couldn't be logged; the model was still saved.</p>;
  }
  return (
    <p className="text-secondary">
      <Icon name="check" className="icon" /> Logged to MLflow as run <span className="mono">{tracking.runId}</span>
      {tracking.url && /^https?:\/\//i.test(tracking.url) ? (
        <>
          {" "}
          ·{" "}
          <a href={tracking.url} target="_blank" rel="noreferrer noopener">
            Open run
          </a>
        </>
      ) : null}
    </p>
  );
}

export function SignalCard({ signal }: { signal: ModelSignal }) {
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <div className="cluster">
        <span className="metric-value" style={{ textTransform: "capitalize" }}>
          {signal.signal === "buy" ? "Buy" : "Stay flat"}
        </span>
        <DataSourceBadge source={signal.dataSource} />
      </div>
      <span className="text-secondary">
        Predicts “{signal.predictionName}” as of {formatDateTime(signal.asOf)}.{" "}
        {Object.entries(signal.probabilities)
          .map(([name, probability]) => `${name} ${formatFraction(probability, 0)}`)
          .join(" · ")}
      </span>
      {signal.rule ? <span className="text-meta">{signal.rule} Model {signal.modelId.slice(0, 8)} trained {formatDateTime(signal.trainedAt)}. Not investment advice.</span> : null}
    </div>
  );
}
