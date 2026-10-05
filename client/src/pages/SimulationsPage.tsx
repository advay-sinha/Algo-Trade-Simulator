// Pattern 1 — List / Index: header + Create, search + one Filters control, framed table, pagination.
// Each row shows how the paper simulation is doing; the detail page has the full picture.
import * as Popover from "@radix-ui/react-popover";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createSimulation, deleteSimulation, fetchRunnableStrategies, fetchSimulationSummaries, fetchSimulations } from "../api";
import { Sparkline } from "../components/charts/Sparkline";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { ConfirmDialog, SlideOver } from "../components/ui/overlays";
import { EmptyState, ErrorState, IconButton, Pagination, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { direction, directionArrow, formatDate, formatSignedFraction, formatSignedSimulationMoney, formatSimulationMoney } from "../lib/format";
import { useAuthedQuery, useSlashFocus, useVisiblePolling } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import { defaultsFor, toNumbers, validateParam, type ParamValues } from "../lib/strategyParams";
import type { Simulation, SimulationStatus, SimulationSummary, StrategySpec } from "../types";
import { SYMBOL_RE } from "../lib/symbols";
import { SymbolCombobox } from "../components/ui/SymbolCombobox";

const STATUSES: SimulationStatus[] = ["active", "paused", "completed", "archived"];
const PAGE_SIZE = 10;
const section = SECTIONS.simulations;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";
export const statusText = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

function CreateSimulationForm({ onCreated, onCancel }: { onCreated: (simulation: Simulation) => void; onCancel: () => void }) {
  const { token, handleAuthError } = useAuthed();
  const strategies = useAuthedQuery(() => fetchRunnableStrategies(), [], { action: "load strategies" });
  const [symbol, setSymbol] = useState("");
  const [strategyId, setStrategyId] = useState("sma-crossover");
  const [params, setParams] = useState<ParamValues | null>(null);
  const [capital, setCapital] = useState("100000");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strategy: StrategySpec | undefined = strategies.data?.find((item) => item.id === strategyId);
  const values = params ?? defaultsFor(strategy);

  const check = (field: string, value: string) => {
    if (field === "symbol") return SYMBOL_RE.test(value.trim()) ? undefined : "Pick a match from the list, or type a ticker like AAPL or RELIANCE.NS.";
    if (field === "capital") {
      const amount = Number(value);
      return Number.isFinite(amount) && amount > 0 ? undefined : "Enter an amount above zero.";
    }
    const spec = strategy?.parameters.find((param) => `param-${param.name}` === field);
    return spec ? validateParam(spec, value) : undefined;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string | undefined> = { symbol: check("symbol", symbol), capital: check("capital", capital) };
    for (const param of strategy?.parameters ?? []) found[`param-${param.name}`] = validateParam(param, values[param.name] ?? "");
    setErrors(found);
    const firstInvalid = Object.entries(found).find(([, message]) => message)?.[0];
    if (firstInvalid) {
      document.getElementById(`sim-${firstInvalid}`)?.focus();
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await createSimulation(token, {
        symbol: symbol.trim().toUpperCase(),
        strategy: strategyId,
        params: toNumbers(values),
        startingCapital: Number(capital),
        currency: "INR",
        notes: notes.trim() || undefined,
      });
      onCreated(created);
    } catch (error) {
      if (handleAuthError(error)) return;
      setSubmitError(describeError(error, "create the simulation"));
    } finally {
      setBusy(false);
    }
  };

  const invalid = (field: string) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `sim-${field}-error` : undefined,
  });
  const fieldError = (field: string) =>
    errors[field] ? (
      <span className="field-error" id={`sim-${field}-error`}>
        {errors[field]}
      </span>
    ) : null;
  const update = (field: string, value: string, set: (value: string) => void) => {
    set(value);
    if (errors[field] && !check(field, value)) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  return (
    <form id="create-simulation" className="form-grid" onSubmit={submit} noValidate>
      {submitError ? <ErrorState message={submitError} /> : null}
      <SymbolCombobox
        id="sim-symbol"
        label="Symbol"
        value={symbol}
        onChange={(value) => update("symbol", value, setSymbol)}
        onSelect={(value) => update("symbol", value, setSymbol)}
        onBlur={() => setErrors((previous) => ({ ...previous, symbol: check("symbol", symbol) }))}
        error={errors.symbol}
        hint="Type a company name or ticker; Indian listings end in .NS"
      />
      <div className="field">
        <label className="field-label" htmlFor="sim-strategy">
          Strategy
        </label>
        <select
          id="sim-strategy"
          className="select"
          value={strategyId}
          disabled={!strategies.data}
          onChange={(event) => {
            setStrategyId(event.target.value);
            setParams(null);
            setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith("param-"))));
          }}
        >
          {(strategies.data ?? [{ id: strategyId, name: "Loading…" } as StrategySpec]).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {strategy ? <span className="field-hint">{strategy.description}</span> : null}
      </div>
      {strategies.loading ? (
        <Skeleton height={44} />
      ) : (
        (strategy?.parameters ?? []).map((param) => (
          <div className="field" key={param.name}>
            <label className="field-label" htmlFor={`sim-param-${param.name}`}>
              {param.description ? (
                <LabelWithHint label={param.label} text={param.description}>
                  {param.label}
                </LabelWithHint>
              ) : (
                param.label
              )}
            </label>
            <input
              id={`sim-param-${param.name}`}
              className="input"
              inputMode={param.type === "integer" ? "numeric" : "decimal"}
              value={values[param.name] ?? ""}
              {...invalid(`param-${param.name}`)}
              onChange={(event) => update(`param-${param.name}`, event.target.value, (value) => setParams({ ...values, [param.name]: value }))}
              onBlur={() => setErrors((previous) => ({ ...previous, [`param-${param.name}`]: validateParam(param, values[param.name] ?? "") }))}
            />
            {fieldError(`param-${param.name}`)}
          </div>
        ))
      )}
      <div className="field">
        <label className="field-label" htmlFor="sim-capital">
          <LabelWithHint label="Rupee budget" text={featureText("inr")}>
            Starting capital (INR ₹, simulated)
          </LabelWithHint>
        </label>
        <input
          id="sim-capital"
          className="input"
          inputMode="decimal"
          value={capital}
          {...invalid("capital")}
          onChange={(event) => update("capital", event.target.value, setCapital)}
          onBlur={() => setErrors((previous) => ({ ...previous, capital: check("capital", capital) }))}
        />
        {fieldError("capital")}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sim-notes">
          Notes <span className="field-optional">(optional)</span>
        </label>
        <textarea id="sim-notes" className="textarea" maxLength={400} value={notes} onChange={(event) => setNotes(event.target.value)} />
        <span className="field-hint">{400 - notes.length} characters left</span>
      </div>
      <p className="text-meta">Trades start at the next market open. Costs 5 bps and slippage 5 bps per fill, as in backtests.</p>
      <div className="form-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create simulation"}
        </button>
      </div>
    </form>
  );
}

/** Value / P&L / vs-market cells for one row, from its summary. */
function PerformanceCells({ summary, loading }: { summary?: SimulationSummary; loading: boolean }) {
  if (!summary) {
    return (
      <>
        <td className="right">{loading ? <Skeleton height={18} width={90} /> : "—"}</td>
        <td className="right">{loading ? <Skeleton height={18} width={60} /> : "—"}</td>
        <td>{loading ? <Skeleton height={28} width={110} /> : null}</td>
        <td />
      </>
    );
  }
  if (summary.state === "needs_setup" || summary.state === "unavailable" || summary.state === "waiting") {
    const label = summary.state === "needs_setup" ? "Choose a strategy" : summary.state === "waiting" ? "Starts at next open" : "Prices unavailable";
    return (
      <>
        <td className="right text-secondary" colSpan={3}>
          {label}
        </td>
        <td className="text-secondary">{summary.signal ?? "—"}</td>
      </>
    );
  }
  const pnlDir = direction(summary.pnl);
  const excessDir = direction(summary.excessVsBuyHold);
  return (
    <>
      <td className="right num">
        <div>{formatSimulationMoney(summary.equity)}</div>
        <div className={`text-meta ${pnlDir}`}>
          {directionArrow(summary.pnl)} {formatSignedSimulationMoney(summary.pnl)} ({formatSignedFraction(summary.totalReturn)})
        </div>
      </td>
      <td className={`right num ${excessDir}`}>{formatSignedFraction(summary.excessVsBuyHold)}</td>
      <td style={{ minWidth: 110, maxWidth: 140 }}>
        <Sparkline points={summary.spark.map((value, index) => ({ timestamp: String(index), close: value }))} label={`Equity trend over ${summary.tradingDays ?? 0} trading days`} />
      </td>
      <td>
        {summary.signal ?? "—"}
        {summary.pendingSide ? <div className="text-meta">{summary.pendingSide === "buy" ? "Buys" : "Sells"} next open</div> : null}
      </td>
    </>
  );
}

export function SimulationsPage() {
  const { token, handleAuthError } = useAuthed();
  const navigate = useNavigate();
  const simulations = useAuthedQuery(fetchSimulations, [], { action: "load simulations" });
  const summaries = useAuthedQuery(fetchSimulationSummaries, [], { action: "value your simulations" });
  useVisiblePolling(() => void summaries.reload(), 60_000);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SimulationStatus[]>([]);
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Simulation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  useSlashFocus(searchRef);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (simulations.data ?? [])
      .filter((simulation) => !term || simulation.symbol.toLowerCase().includes(term) || (simulation.strategyName ?? simulation.strategy).toLowerCase().includes(term))
      .filter((simulation) => !statusFilter.length || statusFilter.includes(simulation.status as SimulationStatus))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [simulations.data, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const hasFilters = Boolean(search.trim() || statusFilter.length);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteSimulation(token, pendingDelete.id);
      simulations.setData((previous) => previous?.filter((item) => item.id !== pendingDelete.id) ?? null);
      setPendingDelete(null);
    } catch (error) {
      if (handleAuthError(error)) return;
      setActionError(describeError(error, `delete the ${pendingDelete.symbol} simulation`));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter([]);
    setPage(0);
  };

  return (
    <div className="page">
      <SectionHeader
        section={section}
        actions={
          <button ref={createButtonRef} type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            Create simulation
          </button>
        }
      />

      {actionError ? <ErrorState message={actionError} /> : null}
      {summaries.error ? <ErrorState message={summaries.error} onRetry={() => void summaries.reload()} /> : null}

      <section className="table-frame" aria-label="Simulations">
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
                aria-keyshortcuts="/"
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
                Filters{statusFilter.length ? ` (${statusFilter.length})` : ""}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="info-hint" sideOffset={8} align="start">
                <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
                  <legend className="info-hint-title">Status</legend>
                  {STATUSES.map((status) => (
                    <label key={status} className="cluster" style={{ minHeight: 32 }}>
                      <input
                        type="checkbox"
                        checked={statusFilter.includes(status)}
                        onChange={(event) => {
                          setStatusFilter((previous) => (event.target.checked ? [...previous, status] : previous.filter((item) => item !== status)));
                          setPage(0);
                        }}
                      />
                      {statusText(status)}
                    </label>
                  ))}
                </fieldset>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {statusFilter.length ? (
          <div className="chips" aria-label="Active filters">
            {statusFilter.map((status) => (
              <span className="chip" key={status}>
                Status: {statusText(status)}
                <button type="button" aria-label={`Remove status ${status} filter`} onClick={() => setStatusFilter((previous) => previous.filter((item) => item !== status))}>
                  <Icon name="close" />
                </button>
              </span>
            ))}
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        ) : null}

        {simulations.error ? (
          <div className="panel-body">
            <ErrorState message={simulations.error} onRetry={() => void simulations.reload()} />
          </div>
        ) : simulations.loading ? (
          <SkeletonRows rows={5} />
        ) : !simulations.data?.length ? (
          <EmptyState
            title="No simulations yet"
            body="A simulation paper-trades one strategy on one symbol from today, and shows how it does against holding the stock and the market."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <Icon name="plus" />
                Create simulation
              </button>
            }
          />
        ) : !filtered.length ? (
          <EmptyState
            icon="search"
            title="No simulations match your filters"
            body="Try a broader search or remove a status filter."
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
                  <th scope="col">Symbol</th>
                  <th scope="col">Strategy</th>
                  <th scope="col" className="right">
                    Value (INR)
                  </th>
                  <th scope="col" className="right">
                    <LabelWithHint label="vs buy-and-hold" text={featureText("compare")}>
                      vs hold
                    </LabelWithHint>
                  </th>
                  <th scope="col">Trend</th>
                  <th scope="col">Signal</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-sort="descending">
                    Created ↓
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((simulation) => (
                  <tr key={simulation.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link to={`${section.route}/${simulation.id}`}>{simulation.symbol}</Link>
                      {simulation.notes ? <div className="text-meta" style={{ fontWeight: 400 }}>{simulation.notes}</div> : null}
                    </td>
                    <td className="text-secondary">{simulation.strategyName ?? simulation.strategy}</td>
                    <PerformanceCells summary={summaries.data?.[simulation.id]} loading={summaries.loading} />
                    <td>
                      <span className="status-pill">{statusText(simulation.status)}</span>
                    </td>
                    <td className="text-secondary num">{formatDate(simulation.createdAt)}</td>
                    <td className="right">
                      <div className="cluster" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <IconButton icon="chevronRight" label={`Open the ${simulation.symbol} simulation`} onClick={() => navigate(`${section.route}/${simulation.id}`)} />
                        <IconButton icon="trash" label={`Delete ${simulation.symbol} simulation`} onClick={() => setPendingDelete(simulation)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} noun={hasFilters ? "matching simulations" : "simulations"} />
      </section>

      <SlideOver open={creating} onOpenChange={setCreating} title="Create simulation" description="Paper trading only — no real money is used." returnFocusRef={createButtonRef}>
        <CreateSimulationForm
          onCancel={() => setCreating(false)}
          onCreated={(simulation) => {
            setCreating(false);
            navigate(`${section.route}/${simulation.id}`);
          }}
        />
      </SlideOver>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete the ${pendingDelete?.symbol ?? ""} simulation?`}
        body="This removes the simulation and its trade history permanently. It can't be undone."
        confirmLabel={`Delete ${pendingDelete?.symbol ?? ""} simulation`}
        onConfirm={() => void confirmDelete()}
        busy={deleting}
      />
    </div>
  );
}
