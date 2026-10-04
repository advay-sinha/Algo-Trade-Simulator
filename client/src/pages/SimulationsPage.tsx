// Pattern 1 — List / Index: header + Create, search + one Filters control, framed table, pagination.
// Create opens a slide-over; delete uses a named confirmation.
import * as Popover from "@radix-ui/react-popover";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { createSimulation, deleteSimulation, fetchSimulations, fetchStrategies, updateSimulation } from "../api";
import { Icon } from "../components/ui/Icon";
import { ConfirmDialog, SlideOver } from "../components/ui/overlays";
import { EmptyState, ErrorState, IconButton, Pagination, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDate, formatMoney } from "../lib/format";
import { useAuthedQuery, useSlashFocus } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { Simulation, SimulationStatus } from "../types";

const STATUSES: SimulationStatus[] = ["active", "paused", "completed", "archived"];
const PAGE_SIZE = 10;
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;
const statusText = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

function CreateSimulationForm({ onCreated, onCancel }: { onCreated: (simulation: Simulation) => void; onCancel: () => void }) {
  const { token, handleAuthError } = useAuthed();
  const strategies = useAuthedQuery(() => fetchStrategies(), [], { action: "load strategies" });
  const [symbol, setSymbol] = useState("");
  const [strategy, setStrategy] = useState("sma-crossover");
  const [capital, setCapital] = useState("10000");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ symbol?: string; capital?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = (field: "symbol" | "capital", value: string) => {
    if (field === "symbol") return SYMBOL_RE.test(value.trim()) ? undefined : "Use a ticker like AAPL, BRK-B or RELIANCE.NS.";
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? undefined : "Enter an amount above zero.";
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = { symbol: check("symbol", symbol), capital: check("capital", capital) };
    setErrors(found);
    if (found.symbol || found.capital) {
      document.getElementById(found.symbol ? "sim-symbol" : "sim-capital")?.focus();
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await createSimulation(token, {
        symbol: symbol.trim().toUpperCase(),
        strategy,
        startingCapital: Number(capital),
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

  return (
    <form id="create-simulation" className="form-grid" onSubmit={submit} noValidate>
      {submitError ? <ErrorState message={submitError} /> : null}
      <div className="field">
        <label className="field-label" htmlFor="sim-symbol">
          Symbol
        </label>
        <input
          id="sim-symbol"
          className="input"
          value={symbol}
          maxLength={20}
          autoCapitalize="characters"
          aria-invalid={errors.symbol ? true : undefined}
          aria-describedby={errors.symbol ? "sim-symbol-error" : "sim-symbol-hint"}
          onChange={(event) => {
            setSymbol(event.target.value);
            if (errors.symbol && !check("symbol", event.target.value)) setErrors((previous) => ({ ...previous, symbol: undefined }));
          }}
          onBlur={() => setErrors((previous) => ({ ...previous, symbol: check("symbol", symbol) }))}
        />
        {errors.symbol ? (
          <span className="field-error" id="sim-symbol-error">
            {errors.symbol}
          </span>
        ) : (
          <span className="field-hint" id="sim-symbol-hint">
            Add the exchange suffix for non-US listings, e.g. RELIANCE.NS
          </span>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sim-strategy">
          Strategy
        </label>
        <select id="sim-strategy" className="select" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
          {(strategies.data ?? [{ id: "sma-crossover", name: "Simple moving average crossover" }]).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sim-capital">
          Starting capital (USD, simulated)
        </label>
        <input
          id="sim-capital"
          className="input"
          inputMode="decimal"
          value={capital}
          aria-invalid={errors.capital ? true : undefined}
          aria-describedby={errors.capital ? "sim-capital-error" : undefined}
          onChange={(event) => {
            setCapital(event.target.value);
            if (errors.capital && !check("capital", event.target.value)) setErrors((previous) => ({ ...previous, capital: undefined }));
          }}
          onBlur={() => setErrors((previous) => ({ ...previous, capital: check("capital", capital) }))}
        />
        {errors.capital ? (
          <span className="field-error" id="sim-capital-error">
            {errors.capital}
          </span>
        ) : null}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sim-notes">
          Notes <span className="field-optional">(optional)</span>
        </label>
        <textarea id="sim-notes" className="textarea" maxLength={400} value={notes} onChange={(event) => setNotes(event.target.value)} />
        <span className="field-hint">{400 - notes.length} characters left</span>
      </div>
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

export function SimulationsPage() {
  const { token, handleAuthError } = useAuthed();
  const simulations = useAuthedQuery(fetchSimulations, [], { action: "load simulations" });
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
      .filter((simulation) => !term || simulation.symbol.toLowerCase().includes(term) || simulation.strategy.toLowerCase().includes(term))
      .filter((simulation) => !statusFilter.length || statusFilter.includes(simulation.status as SimulationStatus))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [simulations.data, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const hasFilters = Boolean(search.trim() || statusFilter.length);

  const changeStatus = async (simulation: Simulation, status: SimulationStatus) => {
    setActionError(null);
    try {
      const updated = await updateSimulation(token, simulation.id, { status });
      simulations.setData((previous) => previous?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
    } catch (error) {
      if (handleAuthError(error)) return;
      setActionError(describeError(error, `update the ${simulation.symbol} simulation`));
    }
  };

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
        section={SECTIONS.simulations}
        showSteps={false}
        actions={
          <button ref={createButtonRef} type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            Create simulation
          </button>
        }
      />

      {actionError ? <ErrorState message={actionError} /> : null}

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
            body="A simulation tracks one paper-trading idea — a symbol, a strategy, and simulated capital — through its lifecycle."
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
                    Starting capital
                  </th>
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
                      {simulation.symbol}
                      {simulation.notes ? <div className="text-meta" style={{ fontWeight: 400 }}>{simulation.notes}</div> : null}
                    </td>
                    <td className="text-secondary">{simulation.strategy}</td>
                    <td className="right num">{formatMoney(simulation.startingCapital)}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`status-${simulation.id}`}>
                        Status for {simulation.symbol}
                      </label>
                      <select
                        id={`status-${simulation.id}`}
                        className="select"
                        style={{ minWidth: 130 }}
                        value={STATUSES.includes(simulation.status as SimulationStatus) ? simulation.status : ""}
                        onChange={(event) => void changeStatus(simulation, event.target.value as SimulationStatus)}
                      >
                        {!STATUSES.includes(simulation.status as SimulationStatus) ? <option value="">{simulation.status}</option> : null}
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {statusText(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-secondary num">{formatDate(simulation.createdAt)}</td>
                    <td className="right">
                      <IconButton icon="trash" label={`Delete ${simulation.symbol} simulation`} onClick={() => setPendingDelete(simulation)} />
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
            simulations.setData((previous) => [simulation, ...(previous ?? [])]);
            setCreating(false);
            setPage(0);
          }}
        />
      </SlideOver>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete the ${pendingDelete?.symbol ?? ""} simulation?`}
        body="This removes the simulation and its notes permanently. It can't be undone."
        confirmLabel={`Delete ${pendingDelete?.symbol ?? ""} simulation`}
        onConfirm={() => void confirmDelete()}
        busy={deleting}
      />
    </div>
  );
}
