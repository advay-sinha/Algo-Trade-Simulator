// Shared pieces for strategy-research runs and comparisons (Phase 13).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";
import { InfoHint } from "../ui/InfoHint";
import { Notice } from "../ui/primitives";
import { formatDate, formatFraction, formatSignedFraction, formatSimulationMoney } from "../../lib/format";
import type { Maturity, ResearchComparison, ResearchComparisonRow } from "../../types";

const MATURITY_TEXT: Record<Maturity, string> = {
  baseline: "Baseline",
  research: "Research",
  validated: "Validated",
};

export function MaturityPill({ maturity }: { maturity: Maturity }) {
  const dot = maturity === "validated" ? "dot-good" : maturity === "research" ? "dot-info" : "dot-hollow";
  return (
    <span className="status-pill">
      <span className={`dot ${dot}`} aria-hidden="true" />
      {MATURITY_TEXT[maturity] ?? maturity}
      <InfoHint label="Maturity label" term="maturity" />
    </span>
  );
}

/** Caveats that must stay visible next to any research result. */
export function ResearchCaveats({ survivorshipBiased, caveats }: { survivorshipBiased: boolean; caveats: string[] }) {
  const others = caveats.filter((caveat) => !/survivorship/i.test(caveat));
  return (
    <div className="stack">
      {survivorshipBiased ? (
        <Notice tone="warn" icon="alert">
          Survivorship-biased universe: it uses today's index members, so companies that dropped out or delisted are missing. Every result here, baselines included, looks better than an investor at the time could have achieved.
        </Notice>
      ) : null}
      {others.length ? (
        <ul className="text-secondary" style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
          {others.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function signedClass(value: number | null | undefined) {
  if (value == null) return "";
  return value >= 0 ? "up" : "down";
}

export function ComparisonTable({ rows, benchmark }: { rows: ResearchComparisonRow[]; benchmark?: ResearchComparison["benchmark"] }) {
  return (
    <section className="table-frame" aria-labelledby="comparison-table-heading">
      <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
        <h2 id="comparison-table-heading" style={{ fontSize: "var(--text-h4)" }}>
          Results on identical settings
        </h2>
        <span className="text-meta">Net of charges and slippage · INR</span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Maturity</th>
              <th scope="col" className="right">
                Total return
              </th>
              <th scope="col" className="right">
                CAGR
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
            {rows.map((row) => (
              <tr key={row.runId}>
                <td>
                  <Link to={`/lab/runs/${row.runId}`}>{row.label}</Link>
                  {row.costMultiplier !== 1 ? <span className="text-meta"> · stress</span> : null}
                </td>
                <td>{MATURITY_TEXT[row.maturity] ?? row.maturity}</td>
                <td className={`right num ${signedClass(row.headline.totalReturn)}`}>{formatSignedFraction(row.headline.totalReturn)}</td>
                <td className={`right num ${signedClass(row.headline.cagr)}`}>{formatSignedFraction(row.headline.cagr)}</td>
                <td className="right num">{formatFraction(row.headline.maxDrawdown)}</td>
                <td className="right num">{row.headline.sharpe == null ? "—" : row.headline.sharpe.toFixed(2)}</td>
                <td className="right num">{row.headline.annualTurnover == null ? "—" : row.headline.annualTurnover.toFixed(2)}</td>
                <td className="right num text-secondary">{formatSimulationMoney(row.headline.totalCosts)}</td>
              </tr>
            ))}
            {benchmark?.available && benchmark.metrics ? (
              <tr>
                <td>
                  {benchmark.label} <span className="text-meta">· not tradable, no costs</span>
                </td>
                <td>Index</td>
                <td className={`right num ${signedClass(benchmark.metrics.totalReturn)}`}>{formatSignedFraction(benchmark.metrics.totalReturn)}</td>
                <td className={`right num ${signedClass(benchmark.metrics.cagr)}`}>{formatSignedFraction(benchmark.metrics.cagr)}</td>
                <td className="right num">{formatFraction(benchmark.metrics.maxDrawdown)}</td>
                <td className="right num">{benchmark.metrics.sharpe == null ? "—" : benchmark.metrics.sharpe.toFixed(2)}</td>
                <td className="right num">—</td>
                <td className="right num">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One focus run against the baseline and the index (three validated series colours). */
export function ComparisonChart({ comparison }: { comparison: ResearchComparison }) {
  const runs = comparison.series.runs;
  const baseline = runs.find((run) => comparison.rows.find((row) => row.runId === run.runId)?.strategyId === "equal-weight-universe");
  const candidates = runs.filter((run) => run !== baseline);
  const [focusId, setFocusId] = useState(candidates[0]?.runId ?? baseline?.runId ?? "");
  const focus = runs.find((run) => run.runId === focusId);
  const lines = useMemo(
    () => [
      ...(focus ? [{ id: "focus", label: focus.label, colorVar: "--series-1", points: focus.equity }] : []),
      ...(baseline && baseline !== focus ? [{ id: "baseline", label: baseline.label, colorVar: "--series-2", points: baseline.equity }] : []),
      ...(comparison.series.benchmark.length ? [{ id: "index", label: `${comparison.benchmark.symbol} index level`, colorVar: "--series-3", points: comparison.series.benchmark }] : []),
    ],
    [focus, baseline, comparison],
  );
  return (
    <section className="panel" aria-labelledby="comparison-chart-heading">
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
        <h2 id="comparison-chart-heading" style={{ fontSize: "var(--text-h4)" }}>
          Growth of 100
        </h2>
        {candidates.length > 1 ? (
          <div className="field" style={{ minWidth: 0 }}>
            <label className="field-label" htmlFor="comparison-focus">
              Compare
            </label>
            <select id="comparison-focus" className="select" value={focusId} onChange={(event) => setFocusId(event.target.value)}>
              {candidates.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="panel-body">
        <TimeSeriesChart
          lines={lines}
          valueFormat="price"
          ariaLabel={`Growth of 100 for ${focus?.label ?? "the selected run"} against the equal-weight baseline and the index, ${formatDate(comparison.period.start)} to ${formatDate(comparison.period.end)}. Exact figures are in the table.`}
        />
      </div>
    </section>
  );
}
