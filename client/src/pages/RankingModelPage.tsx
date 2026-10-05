// Pattern 2 — Detail / Record: one ML ranking experiment (model card).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { compareResearch, fetchRankingExperiment } from "../api";
import { MaturityPill, ResearchCaveats } from "../components/strategy/ResearchViews";
import { Icon } from "../components/ui/Icon";
import { InfoHint } from "../components/ui/InfoHint";
import { EmptyState, ErrorState, MetricCard, Notice, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDate, formatDateTime, formatFraction, formatInteger, formatSignedFraction, formatSimulationMoney } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { IcSummary, RankingExperiment, RankingTradingRow } from "../types";

const ROW_LABELS: Record<string, string> = {
  ridge: "Ridge (linear benchmark)",
  "ridge@stress": "Ridge, charges ×2",
  hgb: "Boosted trees",
  "hgb@stress": "Boosted trees, charges ×2",
  "equal-weight-universe": "Equal-weight universe (baseline)",
  "xs-momentum": "Cross-sectional momentum",
};

function ic(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(3);
}

function IcTable({ title, rows }: { title: string; rows: Array<[string, IcSummary | undefined]> }) {
  return (
    <section className="table-frame" aria-label={title}>
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 style={{ fontSize: "var(--text-h4)" }} className="label-with-hint">
          {title}
          <InfoHint label="Rank IC" term="rankIc" />
        </h2>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" className="right">
                Mean rank IC
              </th>
              <th scope="col" className="right">
                90% interval
              </th>
              <th scope="col" className="right">
                t-stat
              </th>
              <th scope="col" className="right">
                Positive months
              </th>
              <th scope="col" className="right">
                Top-decile spread
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, summary]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="right num">{ic(summary?.meanIc)}</td>
                <td className="right num text-secondary">{summary?.icCi?.low != null ? `${ic(summary.icCi.low)} to ${ic(summary.icCi.high)}` : "—"}</td>
                <td className="right num">{summary?.icTstat == null ? "—" : summary.icTstat.toFixed(2)}</td>
                <td className="right num">{formatFraction(summary?.positiveShare, 0)}</td>
                <td className="right num">{formatSignedFraction(summary?.topDecileSpread)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TradingTable({ title, window }: { title: string; window: { start: string; end: string; runs: Record<string, RankingTradingRow> } }) {
  return (
    <section className="table-frame" aria-label={title}>
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 style={{ fontSize: "var(--text-h4)" }}>{title}</h2>
        <span className="text-meta">
          {formatDate(window.start)} – {formatDate(window.end)} · same engine, charges and eligibility
        </span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Portfolio</th>
              <th scope="col" className="right">
                Total return
              </th>
              <th scope="col" className="right">
                vs equal weight
              </th>
              <th scope="col" className="right">
                Max drawdown
              </th>
              <th scope="col" className="right">
                Sharpe
              </th>
              <th scope="col" className="right">
                Turnover / yr
              </th>
              <th scope="col" className="right">
                Charges
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(window.runs).map(([key, row]) => (
              <tr key={key}>
                <td>{ROW_LABELS[key] ?? row.label}</td>
                <td className={`right num ${(row.metrics.totalReturn ?? 0) >= 0 ? "up" : "down"}`}>{formatSignedFraction(row.metrics.totalReturn)}</td>
                <td className="right num">{key === "equal-weight-universe" ? "—" : formatSignedFraction(row.excessVsEqualWeight)}</td>
                <td className="right num">{formatFraction(row.metrics.maxDrawdown)}</td>
                <td className="right num">{row.metrics.sharpe == null ? "—" : row.metrics.sharpe.toFixed(2)}</td>
                <td className="right num">{row.turnover.toFixed(2)}</td>
                <td className="right num text-secondary">{formatSimulationMoney(row.costs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunPortfolio({ data }: { data: RankingExperiment }) {
  const { token, handleAuthError } = useAuthed();
  const navigate = useNavigate();
  const [family, setFamily] = useState(Object.keys(data.families).includes("hgb") ? "hgb" : Object.keys(data.families)[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const comparison = await compareResearch(token, {
        ...data.settings,
        datasetVersion: data.dataset.version,
        start: undefined,
        end: undefined,
        costStress: 2,
        strategies: [{ strategy: "ml-ranking", params: { model: data.id, family } }, { strategy: "xs-momentum", params: {} }],
      });
      navigate(`/lab/runs/${comparison.id}`);
    } catch (caught) {
      if (!handleAuthError(caught)) setError(describeError(caught, "run the ranking portfolio"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="table-frame panel-body stack" aria-labelledby="run-ranking-heading">
      <h2 id="run-ranking-heading" style={{ fontSize: "var(--text-h4)" }}>
        Run as a portfolio
      </h2>
      <p className="text-secondary" style={{ margin: 0 }}>
        Trades the stored walk-forward scores (each month scored by the model trainable then) next to cross-sectional momentum, the equal-weight baseline and a double-charges rerun, from the first scored month.
      </p>
      <div className="cluster" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label className="field-label" htmlFor="rank-family">
            Model
          </label>
          <select id="rank-family" className="select" value={family} onChange={(event) => setFamily(event.target.value)}>
            {Object.entries(data.families).map(([key, item]) => (
              <option key={key} value={key}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          <Icon name="trend" />
          {busy ? "Running…" : "Run comparison"}
        </button>
      </div>
      {error ? <ErrorState message={error} /> : null}
    </section>
  );
}

export function RankingModelPage() {
  const { experimentId = "" } = useParams();
  const record = useAuthedQuery((token) => fetchRankingExperiment(token, experimentId), [experimentId], { action: "load this ranking experiment" });
  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={SECTIONS.strategyLab.route}>Strategy research</Link>
        </li>
        <li aria-current="page">Ranking model</li>
      </ol>
    </nav>
  );
  if (record.error) {
    return (
      <div className="page">
        {breadcrumb}
        {/404|not found/i.test(record.error) ? <EmptyState icon="search" title="This ranking experiment isn't available" body="It may have been removed, or the server's in-memory storage was reset." /> : <ErrorState message={record.error} onRetry={() => void record.reload()} />}
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
  const families = Object.entries(data.families);
  return (
    <div className="page">
      <header className="section-header">
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          {breadcrumb}
          <h1>ML stock ranking · experiment {data.id.slice(0, 8)}</h1>
          <p className="text-secondary">
            {data.dataset.universe === "nifty100-current" ? "Nifty 100 (current members)" : data.dataset.universe === "nifty50-current" ? "Nifty 50 (current members)" : data.dataset.universe} · trained{" "}
            {formatDateTime(data.createdAt)} · code {data.code.commit.slice(0, 10)}
            {data.code.dirty ? " (uncommitted changes)" : ""} · seed {data.seed} · feature schema {data.schemaHash.slice(0, 10)}
          </p>
        </div>
      </header>
      <Notice icon="info">
        Walk-forward: every month was scored by a model refitted only on labels that had fully matured before that month. The final model is for forward use and was never applied to earlier dates. Rank IC measures forecast quality; it doesn't establish net trading profit.
      </Notice>
      <ResearchCaveats survivorshipBiased={data.dataset.survivorshipBiased} caveats={data.caveats} />
      <section aria-label="Experiment summary" className="kpi-strip">
        {families.map(([key, family]) => (
          <MetricCard
            key={key}
            label={family.name}
            hint="Maturity follows criteria fixed before the holdout was looked at."
            value={<MaturityPill maturity={family.promotion.maturity} />}
            sub={`Validation IC ${ic(family.validation.meanIc)} · final model trained to ${formatDate(family.final.trainingCutoff)}`}
          />
        ))}
        <MetricCard label="Holdout uses" term="holdout" value={formatInteger(data.holdoutUses)} sub={data.holdoutUses ? "Looked at once" : "Untouched so far"} />
      </section>

      <section className="table-frame" aria-labelledby="split-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="split-heading" style={{ fontSize: "var(--text-h4)" }}>
            Data, target and windows
          </h2>
        </div>
        <dl style={{ margin: 0 }}>
          <div className="list-row" style={{ alignItems: "flex-start" }}>
            <div className="list-row-main">
              <dt className="list-row-title">Target</dt>
              <dd style={{ margin: 0 }} className="text-secondary">
                {data.target}
              </dd>
            </div>
          </div>
          {(["development", "validation", "holdout"] as const).map((name) => (
            <div className="list-row" key={name} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main">
                <dt className="list-row-title" style={{ textTransform: "capitalize" }}>
                  {name}
                </dt>
                <dd style={{ margin: 0 }} className="text-secondary">
                  {formatDate(data.split[name].start)} – {formatDate(data.split[name].end)} · {data.split[name].dates} monthly decisions
                  {name === "development" ? " · training only" : name === "validation" ? " · model and settings chosen here" : " · evaluated only on request, counted"}
                </dd>
              </div>
            </div>
          ))}
          {data.featureFamilies.map((group) => (
            <div className="list-row" key={group.family} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main">
                <dt className="list-row-title" style={{ textTransform: "capitalize" }}>
                  Features · {group.family.replace("_", " ")}
                </dt>
                <dd style={{ margin: 0 }} className="text-secondary">
                  {group.description} ({group.features.length} columns)
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <IcTable title="Forecast quality · validation" rows={families.map(([, family]) => [family.name, family.validation])} />
      {families.some(([, family]) => family.holdout) ? <IcTable title="Forecast quality · holdout" rows={families.map(([, family]) => [family.name, family.holdout])} /> : null}
      {data.validationTrading ? <TradingTable title="Trading the scores · validation window" window={data.validationTrading} /> : null}
      {data.holdoutTrading ? <TradingTable title="Trading the scores · holdout window" window={data.holdoutTrading} /> : null}

      <section className="table-frame" aria-labelledby="trials-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="trials-heading" style={{ fontSize: "var(--text-h4)" }}>
            Every trial (validation window)
          </h2>
          <span className="text-meta">{data.trials.length} candidates tried; the best of each model type was kept</span>
        </div>
        <ul className="list-plain">
          {data.trials.map((trial) => (
            <li key={trial.index} className="list-row">
              <div className="list-row-main">
                <span className="list-row-title">
                  {trial.index}/{trial.count} · {trial.kind === "hgb" ? "Boosted trees" : "Ridge"}
                </span>
                <span className="text-meta">
                  {Object.entries(trial.params)
                    .map(([name, value]) => `${name} ${value}`)
                    .join(" · ")}
                </span>
              </div>
              <span className="num">IC {ic(trial.meanIc)}</span>
            </li>
          ))}
        </ul>
      </section>

      {families.map(([key, family]) => (
        <section className="table-frame" key={key} aria-label={`${family.name} promotion and checks`}>
          <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
            <h2 style={{ fontSize: "var(--text-h4)" }}>{family.name}: criteria and checks</h2>
            <MaturityPill maturity={family.promotion.maturity} />
          </div>
          <ul className="list-plain">
            {family.promotion.criteria.map((item) => (
              <li key={item.criterion} className="list-row">
                <div className="list-row-main">
                  <span className="list-row-title">
                    {item.passed ? "✓" : "✗"} {item.criterion}
                  </span>
                  {item.reason ? <span className="text-meta">{item.reason}</span> : null}
                </div>
                <span className="num">{item.value == null ? "—" : item.value.toFixed(3)}</span>
              </li>
            ))}
            {family.final.gate.checks.map((check) => (
              <li key={check.check} className="list-row">
                <div className="list-row-main">
                  <span className="list-row-title">
                    {check.passed ? "✓" : "✗"} Model file: {check.check}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <RunPortfolio data={data} />
    </div>
  );
}
