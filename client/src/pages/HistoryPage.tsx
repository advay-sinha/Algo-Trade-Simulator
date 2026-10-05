// Pattern 1 — List / Index: every saved research record, searchable and filterable.
import * as Popover from "@radix-ui/react-popover";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBacktests, fetchModels, fetchNotes, fetchSimulations, fetchTrainingRuns } from "../api";
import { Icon } from "../components/ui/Icon";
import { EmptyState, ErrorState, Pagination, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { formatDateTime, formatFraction, formatSimulationMoney, formatSignedFraction } from "../lib/format";
import { useAuthedQuery, useSlashFocus } from "../lib/hooks";

type RecordType = "backtest" | "model" | "simulation" | "training" | "note";

interface ResearchRecord {
  key: string;
  type: RecordType;
  symbol: string;
  detail: string;
  value: string;
  status: string;
  date: string;
  href?: string;
}

const PAGE_SIZE = 10;
const TYPE_LABEL: Record<RecordType, string> = { backtest: "Backtest", model: "ML model", simulation: "Simulation", training: "Training run", note: "Research note" };

export function HistoryPage() {
  const records = useAuthedQuery(
    async (token) => {
      const [backtests, models, simulations, runs, notes] = await Promise.all([
        fetchBacktests(token),
        fetchModels(token),
        fetchSimulations(token),
        fetchTrainingRuns(token),
        fetchNotes(token),
      ]);
      const rows: ResearchRecord[] = [
        ...models.map((item) => ({
          key: `m-${item.id}`,
          type: "model" as const,
          symbol: item.symbol,
          detail: item.modelName,
          value: `${formatFraction(item.accuracy, 1)} acc vs ${formatFraction(item.baselineAccuracy, 1)} baseline`,
          status: `${item.label.kind} · h${item.label.horizon}`,
          date: item.trainedAt,
          href: `/lab/models/${item.id}`,
        })),
        ...backtests.map((backtest) => ({
          key: `b-${backtest.id}`,
          type: "backtest" as const,
          symbol: backtest.symbol,
          detail: backtest.strategy.name,
          value: `${formatSignedFraction(backtest.summary.totalReturn)} · vs B&H ${formatSignedFraction(backtest.summary.excessReturn)}`,
          status: backtest.dataSource === "live" ? `${backtest.range} · ${backtest.summary.tradeCount} trades` : `${backtest.range} · fallback data`,
          date: backtest.createdAt,
          href: `/backtests/${backtest.id}`,
        })),
        ...simulations.map((simulation) => ({
          key: `s-${simulation.id}`,
          type: "simulation" as const,
          symbol: simulation.symbol,
          detail: simulation.strategy,
          value: `${formatSimulationMoney(simulation.startingCapital)} capital`,
          status: simulation.status,
          date: simulation.createdAt,
        })),
        ...runs.map((run) => ({
          key: `t-${run.symbol}-${run.trainedAt}`,
          type: "training" as const,
          symbol: run.symbol,
          detail: run.shortWindow && run.longWindow ? `SMA ${run.shortWindow}/${run.longWindow}` : run.strategyId,
          value: `${formatSignedFraction(run.metrics.totalReturn)} in-sample`,
          status: "indicative",
          date: run.trainedAt,
        })),
        ...notes.map((note) => ({
          key: `n-${note.id}`,
          type: "note" as const,
          symbol: note.symbol ?? "—",
          detail: note.title,
          value: note.sentiment ? `${note.sentiment.label} tone` : "—",
          status: note.indexed ? (note.kind === "note" ? "note" : `${note.kind} summary`) : "not indexed yet",
          date: note.createdAt,
          href: SECTIONS.research.route,
        })),
      ];
      return rows;
    },
    [],
    { action: "load your research history" },
  );
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<RecordType[]>([]);
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (records.data ?? [])
      .filter((row) => !term || row.symbol.toLowerCase().includes(term) || row.detail.toLowerCase().includes(term))
      .filter((row) => !types.length || types.includes(row.type))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [records.data, search, types]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const clearFilters = () => {
    setSearch("");
    setTypes([]);
    setPage(0);
  };

  return (
    <div className="page">
      <SectionHeader
        section={SECTIONS.history}
        showSteps={false}
        actions={
          <Link to={SECTIONS.prices.route} className="btn">
            <Icon name="table" />
            Explore price history
          </Link>
        }
      />

      <section className="table-frame" aria-label="Research records">
        <div className="toolbar">
          <label className="cluster" style={{ flex: "1 1 260px", maxWidth: 420, flexWrap: "nowrap" }}>
            <span className="field-label">Search</span>
            <span className="search-field" style={{ maxWidth: "none" }}>
              <Icon name="search" />
              <input
                ref={searchRef}
                className="input"
                type="search"
                placeholder="Symbol or strategy"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </span>
          </label>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="btn">
                Filters{types.length ? ` (${types.length})` : ""}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="info-hint" sideOffset={8} align="start">
                <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
                  <legend className="info-hint-title">Record type</legend>
                  {(Object.keys(TYPE_LABEL) as RecordType[]).map((type) => (
                    <label key={type} className="cluster" style={{ minHeight: 32 }}>
                      <input
                        type="checkbox"
                        checked={types.includes(type)}
                        onChange={(event) => {
                          setTypes((previous) => (event.target.checked ? [...previous, type] : previous.filter((item) => item !== type)));
                          setPage(0);
                        }}
                      />
                      {TYPE_LABEL[type]}
                    </label>
                  ))}
                </fieldset>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {types.length ? (
          <div className="chips" aria-label="Active filters">
            {types.map((type) => (
              <span className="chip" key={type}>
                Type: {TYPE_LABEL[type]}
                <button type="button" aria-label={`Remove ${TYPE_LABEL[type]} filter`} onClick={() => setTypes((previous) => previous.filter((item) => item !== type))}>
                  <Icon name="close" />
                </button>
              </span>
            ))}
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        ) : null}

        {records.error ? (
          <div className="panel-body">
            <ErrorState message={records.error} onRetry={() => void records.reload()} />
          </div>
        ) : records.loading ? (
          <SkeletonRows rows={5} />
        ) : !records.data?.length ? (
          <EmptyState
            title="No research records yet"
            body="Backtests you run, simulations you create, and strategies you train in the Lab are kept here so you can find them later."
            action={
              <Link to={SECTIONS.backtests.route} className="btn btn-primary">
                Run a backtest
              </Link>
            }
          />
        ) : !filtered.length ? (
          <EmptyState
            icon="search"
            title="No records match your filters"
            body="Try a broader search or remove the type filter."
            action={
              <button type="button" className="btn" onClick={clearFilters}>
                Clear all filters
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Symbol</th>
                  <th scope="col">Strategy</th>
                  <th scope="col">Key figure</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-sort="descending">
                    Date ↓
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.key}>
                    <td className="text-secondary">{TYPE_LABEL[row.type]}</td>
                    <td style={{ fontWeight: 500 }}>
                      {row.href ? (
                        <Link to={row.href} className="row-select" aria-label={`Open ${row.symbol} ${TYPE_LABEL[row.type].toLowerCase()}`}>
                          {row.symbol}
                          <Icon name="chevronRight" className="icon chevron" />
                        </Link>
                      ) : (
                        row.symbol
                      )}
                    </td>
                    <td className="text-secondary">{row.detail}</td>
                    <td className="num">{row.value}</td>
                    <td className="text-secondary">{row.status}</td>
                    <td className="text-secondary num">{formatDateTime(row.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} noun="records" />
      </section>
      <p className="text-meta">The Lab trainer keeps its latest run per symbol; ML models keep every training run.</p>
    </div>
  );
}
