// Pattern 4 — Dashboard / Overview: heading, sentence, KPI strip (≤5), primary chart, supporting lists.
import { Link } from "react-router-dom";
import { fetchOverview, fetchSparkline } from "../api";
import { Sparkline } from "../components/charts/Sparkline";
import { Icon } from "../components/ui/Icon";
import { DataSourceBadge, EmptyState, ErrorState, MetricCard, SectionHeader, Skeleton, StatusPill } from "../components/ui/primitives";
import { ENGINES, SECTIONS } from "../content/sections";
import { formatDate, formatMoney, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";

const DIRECTORY = [
  SECTIONS.monitor,
  SECTIONS.engines,
  SECTIONS.lab,
  SECTIONS.backtests,
  SECTIONS.datasets,
  SECTIONS.models,
  SECTIONS.simulations,
  SECTIONS.history,
  SECTIONS.prices,
  SECTIONS.safety,
];

export function OverviewPage() {
  const { user } = useAuthed();
  const overview = useAuthedQuery(fetchOverview, [], { action: "load your overview" });
  const sparklines = useAuthedQuery((token) => fetchSparkline(token), [], { action: "load watchlist trends" });
  const totals = overview.data?.totals;
  const firstName = user.name?.split(" ")[0] || "there";
  const liveEngines = ENGINES.filter((engine) => engine.status !== "planned").length;

  return (
    <div className="page">
      <SectionHeader section={SECTIONS.overview} title={`Welcome back, ${firstName}`} showStatus={false} showSteps={false} />

      {overview.error ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} /> : null}

      <section aria-label="Key figures" className="kpi-strip">
        {overview.loading ? (
          Array.from({ length: 4 }, (_, index) => (
            <div className="metric-card" key={index}>
              <Skeleton width="60%" />
              <Skeleton height={28} width="40%" />
            </div>
          ))
        ) : (
          <>
            <MetricCard label="Simulations" value={totals?.totalSimulations ?? 0} sub={`${totals?.activeSimulations ?? 0} active · ${totals?.completedSimulations ?? 0} completed`} />
            <MetricCard
              label="Simulated capital"
              value={formatMoney(totals?.totalStartingCapital ?? 0)}
              sub="Starting capital across all simulations"
              hint="Paper money only — the sum of starting capital you assigned to simulations. Nothing is invested."
            />
            <MetricCard label="Strategies trained" value={totals?.trainedModels ?? 0} sub="One record per symbol" />
            <MetricCard label="Engines available" value={`${liveEngines} of ${ENGINES.length}`} sub="Others are on the roadmap" />
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="trend-heading">
        <div className="panel-header">
          <h2 id="trend-heading" style={{ fontSize: "var(--text-h4)" }}>
            Watchlist · last month
          </h2>
          <Link to={SECTIONS.monitor.route} className="text-secondary">
            Open live monitoring
          </Link>
        </div>
        <div className="panel-body">
          {sparklines.error ? (
            <ErrorState message={sparklines.error} onRetry={() => void sparklines.reload()} />
          ) : sparklines.loading ? (
            <div className="spark-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="spark-card" key={index}>
                  <Skeleton width="30%" />
                  <Skeleton height={48} />
                </div>
              ))}
            </div>
          ) : (
            <div className="spark-grid">
              {(sparklines.data ?? []).map((series) => {
                const first = series.points[0]?.close;
                const last = series.points.at(-1)?.close;
                const change = first && last ? last / first - 1 : null;
                return (
                  <div className="spark-card" key={series.symbol}>
                    <div className="cluster" style={{ justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 500 }}>{series.symbol}</span>
                      <span className={`text-secondary num ${change !== null && change > 0 ? "up" : change !== null && change < 0 ? "down" : ""}`}>
                        {formatSignedFraction(change)}
                      </span>
                    </div>
                    <Sparkline points={series.points} label={`${series.symbol} closing prices over the last month`} />
                    <DataSourceBadge source={series.source} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="grid-2">
        <section className="table-frame" aria-labelledby="recent-heading">
          <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
            <h2 id="recent-heading" style={{ fontSize: "var(--text-h4)" }}>
              Recent simulations
            </h2>
            <Link to={SECTIONS.simulations.route} className="text-secondary">
              View all
            </Link>
          </div>
          {overview.loading ? (
            <div style={{ padding: "var(--space-4)" }}>
              <Skeleton height={20} />
            </div>
          ) : overview.data?.recentSimulations.length ? (
            <ul className="list-plain">
              {overview.data.recentSimulations.map((simulation) => (
                <li className="list-row" key={simulation.id}>
                  <div className="list-row-main">
                    <span className="list-row-title">{simulation.symbol}</span>
                    <span className="text-meta">
                      {simulation.strategy} · {formatDate(simulation.createdAt)}
                    </span>
                  </div>
                  <span className="text-secondary num">{formatMoney(simulation.startingCapital)}</span>
                  <span className="status-pill">{simulation.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No simulations yet"
              body="Create a simulation to track a paper-trading idea with its own capital and lifecycle."
              action={
                <Link to={SECTIONS.simulations.route} className="btn btn-primary">
                  Create simulation
                </Link>
              }
            />
          )}
        </section>

        <section className="table-frame" aria-labelledby="directory-heading">
          <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
            <h2 id="directory-heading" style={{ fontSize: "var(--text-h4)" }}>
              Where to go
            </h2>
          </div>
          <ul className="list-plain">
            {DIRECTORY.map((section) => (
              <li key={section.id}>
                <Link to={section.route} className="list-row">
                  <div className="list-row-main">
                    <span className="list-row-title">{section.title}</span>
                    <span className="text-meta">{section.summary.split(". ")[0]}.</span>
                  </div>
                  <StatusPill status={section.status} />
                  <Icon name="chevronRight" className="icon chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
