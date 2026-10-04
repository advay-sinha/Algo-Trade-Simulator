import type { ReactNode } from "react";
import type { GlossaryKey } from "../../content/glossary";
import { formatDate, formatFraction, formatSignedFraction } from "../../lib/format";
import type { CurveMetrics, RiskReport } from "../../types";
import { LabelWithHint } from "../ui/InfoHint";
import { DataSourceBadge, MetricCard, Notice } from "../ui/primitives";

const ratio = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

/** A metric that may be null: shows "—" with the server's reason underneath. */
function NullableMetric({
  label,
  term,
  value,
  reason,
  sub,
}: {
  label: string;
  term: GlossaryKey;
  value: string;
  reason?: string;
  sub?: ReactNode;
}) {
  return <MetricCard label={label} term={term} value={value} muted={value === "—"} sub={value === "—" && reason ? reason : sub} />;
}

const ROWS: Array<{ key: keyof CurveMetrics; label: string; term: GlossaryKey; format: (value: number | null | undefined) => string }> = [
  { key: "totalReturn", label: "Total return", term: "totalReturn", format: (v) => formatSignedFraction(v) },
  { key: "cagr", label: "CAGR", term: "cagr", format: (v) => formatSignedFraction(v) },
  { key: "volatility", label: "Volatility", term: "volatility", format: (v) => formatFraction(v) },
  { key: "sharpe", label: "Sharpe", term: "sharpe", format: (v) => ratio(v) },
  { key: "sortino", label: "Sortino", term: "sortino", format: (v) => ratio(v) },
  { key: "maxDrawdown", label: "Max drawdown", term: "maxDrawdown", format: (v) => formatFraction(v) },
];

export function RiskPanel({ risk, strategyName, symbol }: { risk: RiskReport; strategyName: string; symbol: string }) {
  const m = risk.metrics;
  const why = risk.unavailable;
  const dd = risk.drawdown;
  const bench = risk.benchmark;
  const comp = risk.comparison;
  const compWhy = risk.comparisonUnavailable;

  return (
    <div className="stack-lg">
      <section aria-labelledby="risk-metrics-heading" className="stack">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <h2 id="risk-metrics-heading" style={{ fontSize: "var(--text-h4)" }}>
            Risk-adjusted performance
          </h2>
          <span className="text-meta">
            <LabelWithHint label="Risk-free rate" term="riskFreeRate">
              Risk-free rate {formatFraction(risk.riskFreeRate, 1)} · {risk.periodsPerYear} periods/yr
            </LabelWithHint>
          </span>
        </div>
        <div className="metric-grid-3">
          <NullableMetric label="Sharpe ratio" term="sharpe" value={ratio(m.sharpe)} reason={why.sharpe} />
          <NullableMetric label="Sortino ratio" term="sortino" value={ratio(m.sortino)} reason={why.sortino} />
          <NullableMetric label="CAGR" term="cagr" value={formatSignedFraction(m.cagr)} reason={why.cagr} />
          <NullableMetric label="Volatility" term="volatility" value={formatFraction(m.volatility)} reason={why.volatility} sub="Annualized" />
          <NullableMetric label="Win rate" term="winRate" value={formatFraction(m.winRate, 0)} reason={why.winRate} />
          <NullableMetric label="Profit factor" term="profitFactor" value={ratio(m.profitFactor)} reason={why.profitFactor} />
        </div>
        {dd.maxDrawdown ? (
          <p className="text-secondary">
            <LabelWithHint label="Drawdown duration" term="drawdownDuration">
              Worst drawdown {formatFraction(dd.maxDrawdown)}: peak {formatDate(dd.peak)}, trough {formatDate(dd.trough)},{" "}
              {dd.recovered ? `recovered ${formatDate(dd.recovery)}` : "not yet recovered"} — {dd.durationBars} trading days.
            </LabelWithHint>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="benchmark-heading" className="stack">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <h2 id="benchmark-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Benchmark" term="benchmark">
              Strategy vs buy-and-hold vs {bench.symbol}
            </LabelWithHint>
          </h2>
          <DataSourceBadge source={bench.source} />
        </div>
        {!bench.available ? (
          <Notice tone="warn" icon="alert">
            Benchmark comparison unavailable: {bench.reason ?? "no benchmark data"}. Strategy and buy-and-hold figures are still valid.
          </Notice>
        ) : bench.reason ? (
          <Notice tone="warn" icon="alert">
            {bench.reason} — treat the benchmark columns as illustrative only.
          </Notice>
        ) : null}
        <div className="table-frame">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col" className="right">
                    {strategyName}
                  </th>
                  <th scope="col" className="right">
                    Buy-and-hold {symbol}
                  </th>
                  <th scope="col" className="right">
                    {bench.symbol}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" style={{ fontWeight: 500, textAlign: "left", position: "static" }}>
                      <LabelWithHint label={row.label} term={row.term}>
                        {row.label}
                      </LabelWithHint>
                    </th>
                    <td className="right num">{row.format(m[row.key])}</td>
                    <td className="right num">{row.format(risk.buyHold.metrics[row.key])}</td>
                    <td className="right num">{bench.available && bench.metrics ? row.format(bench.metrics[row.key]) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer text-meta">
            Strategy and buy-and-hold are after costs. The benchmark is the index's own price series over the {bench.overlapBars ?? "same"} overlapping trading days.
          </div>
        </div>
        {bench.available ? (
          <div className="kpi-strip">
            <NullableMetric label={`Beta vs ${bench.symbol}`} term="beta" value={ratio(comp.beta)} reason={compWhy.beta} />
            <NullableMetric label="Alpha (annual)" term="alpha" value={formatSignedFraction(comp.alpha)} reason={compWhy.alpha} />
            <NullableMetric label="Correlation" term="correlation" value={ratio(comp.correlation)} reason={compWhy.correlation} />
            <NullableMetric label={`Excess vs ${bench.symbol}`} term="excessReturn" value={formatSignedFraction(comp.excessReturn)} sub="Total return difference" />
          </div>
        ) : null}
      </section>
    </div>
  );
}
