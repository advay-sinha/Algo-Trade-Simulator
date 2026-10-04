// Pattern 2 — Detail / Record: one engine, status + metadata, tabbed sections that load on their own.
import * as Tabs from "@radix-ui/react-tabs";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchBacktests, fetchStrategies, searchSymbols } from "../api";
import { useShell } from "../components/layout/shellContext";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { DataSourceBadge, ErrorState, Notice, PlannedState, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { glossary } from "../content/glossary";
import { findEngine, SECTIONS, type EngineInfo } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDateTime, formatRelative, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { SearchResult } from "../types";

function Breadcrumb({ engine }: { engine: EngineInfo }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={SECTIONS.engines.route}>Engines</Link>
        </li>
        <li aria-current="page">{engine.navLabel}</li>
      </ol>
    </nav>
  );
}

function OverviewTab({ engine }: { engine: EngineInfo }) {
  return (
    <div className="stack-lg">
      <dl className="kpi-strip" style={{ margin: 0 }}>
        <div className="metric-card">
          <dt className="metric-label">Purpose</dt>
          <dd style={{ margin: 0 }}>{engine.purpose}</dd>
        </div>
        <div className="metric-card">
          <dt className="metric-label">Produces</dt>
          <dd style={{ margin: 0 }}>{engine.output}</dd>
        </div>
      </dl>
      <div className="stack">
        <h2 style={{ fontSize: "var(--text-h4)" }}>Key features</h2>
        <div className="feature-grid">
          {engine.features.map((feature) => (
            <div className="feature-card" key={feature.id}>
              <h3 style={{ fontSize: "var(--text-body)" }}>
                <LabelWithHint label={feature.label} text={feature.hoverText}>
                  {feature.label}
                </LabelWithHint>
              </h3>
              <p className="text-secondary">{feature.hoverText}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GlossaryTab({ engine }: { engine: EngineInfo }) {
  return (
    <div className="table-frame">
      <dl className="list-plain" style={{ margin: 0 }}>
        {engine.terms.map((key) => {
          const entry = glossary(key);
          return (
            <div className="list-row" key={key} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main" style={{ gap: "var(--space-1)" }}>
                <dt className="list-row-title">{entry.term}</dt>
                <dd style={{ margin: 0 }} className="text-secondary">
                  {entry.definition}
                </dd>
                {entry.formula ? (
                  <dd style={{ margin: 0 }}>
                    <code className="info-hint-formula" style={{ display: "inline-block" }}>
                      {entry.formula}
                    </code>
                  </dd>
                ) : null}
                {entry.caveat ? (
                  <dd style={{ margin: 0 }} className="text-meta">
                    {entry.caveat}
                  </dd>
                ) : null}
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function MarketDataWorkbench() {
  const { token, handleAuthError } = useAuthed();
  const { status } = useShell();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchSymbols(token, query.trim()));
    } catch (caught) {
      if (handleAuthError(caught)) return;
      setError(describeError(caught, "search symbols"));
    } finally {
      setBusy(false);
    }
  };

  const market = status?.marketData;
  return (
    <div className="stack-lg">
      <div className="kpi-strip">
        <div className="metric-card">
          <span className="metric-label">Last result on this server</span>
          <span className="metric-value">{market?.lastSource ? (market.lastSource === "live" ? "Live" : "Fallback") : "—"}</span>
          <span className="metric-sub">Per server instance; updates as requests are made</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Last live response</span>
          <span className="metric-value">{formatRelative(market?.lastLiveAt)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Last fallback</span>
          <span className="metric-value">{formatRelative(market?.lastFallbackAt)}</span>
          <span className="metric-sub">{status?.offlineMarketDataAllowed === false ? "Fallbacks disabled on this server" : "Fallbacks are always labeled"}</span>
        </div>
      </div>
      <form className="panel panel-body stack" onSubmit={onSubmit} role="search">
        <h2 style={{ fontSize: "var(--text-h4)" }}>Try a symbol search</h2>
        <div className="cluster" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 220px", maxWidth: 360 }}>
            <span className="field-label">Company or ticker</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Microsoft" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Searching…" : "Search symbols"}
          </button>
        </div>
        {error ? <ErrorState message={error} /> : null}
        {results ? (
          <div className="table-frame">
            {results.length ? (
              <ul className="list-plain">
                {results.map((result) => (
                  <li className="list-row" key={result.symbol}>
                    <div className="list-row-main">
                      <span className="list-row-title">{result.symbol}</span>
                      <span className="text-meta">
                        {result.shortName ?? result.longName ?? "Unnamed"} {result.exchange ? `· ${result.exchange}` : ""} {result.type ? `· ${result.type}` : ""}
                      </span>
                    </div>
                    {result.source && result.source !== "live" ? <DataSourceBadge source={result.source} /> : <span className="text-meta">Live</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-body text-secondary">No matches. Try the ticker or a shorter company name.</p>
            )}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function StrategyWorkbench() {
  const strategies = useAuthedQuery(() => fetchStrategies(), [], { action: "load the strategy catalog" });
  if (strategies.error) return <ErrorState message={strategies.error} onRetry={() => void strategies.reload()} />;
  if (strategies.loading) return <SkeletonRows rows={3} />;
  return (
    <div className="stack">
      <Notice>
        Runnable strategies can be backtested with realistic costs in <Link to={SECTIONS.backtests.route}>Backtests</Link>. The SMA crossover can also be
        explored in the <Link to={SECTIONS.lab.route}>Lab</Link>.
      </Notice>
      <div className="table-frame">
        <ul className="list-plain">
          {(strategies.data ?? []).map((strategy) => (
            <li className="list-row" key={strategy.id} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main" style={{ gap: "var(--space-1)" }}>
                <span className="list-row-title">{strategy.name}</span>
                <span className="text-secondary">{strategy.description}</span>
                <span className="text-meta">
                  Parameters: {strategy.parameters.map((param) => `${param.name} = ${param.value}`).join(", ")} · Suits:{" "}
                  {strategy.recommendedFor.join(", ")}
                </span>
              </div>
              {strategy.runnable ? (
                <Link to={`${SECTIONS.backtests.route}?strategy=${encodeURIComponent(strategy.id)}`} className="btn">
                  Backtest it
                </Link>
              ) : (
                <span className="status-pill">Describe only</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BacktestingWorkbench() {
  const recent = useAuthedQuery(fetchBacktests, [], { action: "load recent backtests" });
  return (
    <div className="stack">
      <div>
        <Link to={SECTIONS.backtests.route} className="btn btn-primary">
          <Icon name="activity" />
          Run a backtest
        </Link>
      </div>
      <div className="table-frame">
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
                    <span className="text-meta">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <span className={`num ${item.summary.totalReturn >= 0 ? "up" : "down"}`}>{formatSignedFraction(item.summary.totalReturn)}</span>
                  <Icon name="chevronRight" className="icon chevron" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-body text-secondary">No backtests yet. Your runs will be listed here.</p>
        )}
      </div>
    </div>
  );
}

function FeaturesWorkbench() {
  return (
    <div className="stack">
      <Notice>
        Build a leakage-free dataset for any symbol: choose feature groups, a label, and the split. The preview shows the feature matrix, label balance,
        and the exact train / embargo / test boundaries. Nothing is stored.
      </Notice>
      <div>
        <Link to={SECTIONS.datasets.route} className="btn btn-primary">
          <Icon name="table" />
          Open the dataset builder
        </Link>
      </div>
    </div>
  );
}

function MlWorkbench() {
  return (
    <div className="stack">
      <Notice>
        Train logistic regression, random forest, or gradient boosting on a leakage-free dataset. Each run is judged on unseen data against a
        majority-class baseline and buy-and-hold, and saved to your model registry with its features, window, and parameters.
      </Notice>
      <div>
        <Link to={SECTIONS.models.route} className="btn btn-primary">
          <Icon name="layers" />
          Open the model lab
        </Link>
      </div>
    </div>
  );
}

function CopilotWorkbench() {
  const { openCopilot, status } = useShell();
  return (
    <div className="stack">
      {status?.copilotConfigured === false ? (
        <Notice tone="warn" icon="alert">
          This server has no working OpenAI key configured, so the copilot can't answer yet.
        </Notice>
      ) : null}
      <div>
        <button type="button" className="btn btn-primary" onClick={openCopilot}>
          <Icon name="chat" />
          Open copilot
        </button>
      </div>
      <div className="table-frame">
        <ul className="list-plain">
          {[
            ["Market data", "get_quote, get_price_history"],
            ["Strategies & backtests", "list_strategies, run_backtest, get_backtest_report, list_backtests"],
            ["Models", "train_model, get_model_signal"],
            ["Simulations", "portfolio_overview, create_simulation"],
          ].map(([group, tools]) => (
            <li className="list-row" key={group}>
              <div className="list-row-main">
                <span className="list-row-title">{group}</span>
                <span className="text-meta mono">{tools}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RiskWorkbench() {
  return (
    <div className="stack">
      <Notice>
        Every backtest stores a risk report computed when it runs: Sharpe, Sortino, CAGR, volatility, drawdown depth and duration, win rate, profit
        factor, and beta / alpha / correlation against a benchmark index. Metrics that can't be computed honestly show — with the reason.
      </Notice>
      <div>
        <Link to={SECTIONS.backtests.route} className="btn btn-primary">
          <Icon name="activity" />
          Run a backtest to see its risk report
        </Link>
      </div>
    </div>
  );
}

const WORKBENCHES: Record<string, (engine: EngineInfo) => ReactNode> = {
  "market-data": () => <MarketDataWorkbench />,
  backtesting: () => <BacktestingWorkbench />,
  features: () => <FeaturesWorkbench />,
  ml: () => <MlWorkbench />,
  strategy: () => <StrategyWorkbench />,
  copilot: () => <CopilotWorkbench />,
  risk: () => <RiskWorkbench />,
};

export function EngineDetailPage() {
  const { engineId } = useParams();
  const engine = findEngine(engineId);
  if (!engine) return <Navigate to={SECTIONS.engines.route} replace />;
  const workbench = WORKBENCHES[engine.id]?.(engine) ?? <PlannedState phase={engine.phase} what={engine.title} items={engine.planned} />;

  return (
    <div className="page">
      <SectionHeader section={engine} breadcrumb={<Breadcrumb engine={engine} />} />
      <Tabs.Root defaultValue="overview">
        <Tabs.List className="tabs-list" aria-label={`${engine.title} sections`}>
          <Tabs.Trigger className="tabs-trigger" value="overview">
            Overview
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="workbench">
            {engine.status === "planned" ? "What's coming" : "Workbench"}
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="glossary">
            Glossary
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="tabs-content" value="overview">
          <OverviewTab engine={engine} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="workbench">
          {workbench}
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="glossary">
          <GlossaryTab engine={engine} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
