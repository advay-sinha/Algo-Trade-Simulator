// Pattern 4 — Dashboard over a list: import real holdings (privacy-first), see them, delete them.
// The risk report section renders below the holdings once they exist.
import { useMemo, useRef, useState } from "react";
import { deletePortfolio, deletePortfolioImport, fetchPortfolio } from "../api";
import { ImportFlow } from "../components/portfolio/ImportFlow";
import { PortfolioReport } from "../components/portfolio/PortfolioReport";
import { Icon } from "../components/ui/Icon";
import { ConfirmDialog } from "../components/ui/overlays";
import { EmptyState, ErrorState, Notice, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDate, formatDateTime, formatPrice } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { PortfolioImport } from "../types";

const section = SECTIONS.portfolio;
const SOURCE_LABELS: Record<string, string> = {
  manual: "Entered by hand",
  csv: "CSV",
  zerodha: "Zerodha CSV",
  groww: "Groww CSV",
  upstox: "Upstox CSV",
  cas_nsdl: "NSDL CAS",
  cas_cdsl: "CDSL CAS",
  cams: "CAMS CAS",
  kfintech: "KFintech CAS",
};
const ASSET_LABELS: Record<string, string> = { equity: "Equity", etf: "ETF", mutual_fund: "Mutual fund", gold: "Gold", other: "Other" };

export function DisclaimerNotice() {
  return (
    <Notice icon="shield">
      <strong>Research analytics, not financial advice.</strong> These figures describe your holdings; they don't recommend buying, selling or holding anything.
    </Notice>
  );
}

export function PortfolioPage() {
  const { token, handleAuthError } = useAuthed();
  const portfolio = useAuthedQuery(fetchPortfolio, [], { action: "load your holdings" });
  const [importing, setImporting] = useState(false);
  const [justImported, setJustImported] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PortfolioImport | "all" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  const holdings = portfolio.data?.holdings ?? [];
  const imports = portfolio.data?.imports ?? [];
  const byImport = useMemo(() => {
    const groups = new Map<string, typeof holdings>();
    for (const holding of holdings) groups.set(holding.importId, [...(groups.get(holding.importId) ?? []), holding]);
    return groups;
  }, [holdings]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      if (pendingDelete === "all") await deletePortfolio(token);
      else await deletePortfolioImport(token, pendingDelete.id);
      await portfolio.reload();
      setPendingDelete(null);
    } catch (error) {
      if (handleAuthError(error)) return;
      setActionError(describeError(error, "delete those holdings"));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <SectionHeader
        section={section}
        actions={
          !importing ? (
            <button ref={importButtonRef} type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
              <Icon name="plus" />
              Import holdings
            </button>
          ) : null
        }
      />
      <DisclaimerNotice />
      {actionError ? <ErrorState message={actionError} /> : null}
      {justImported != null ? (
        <Notice icon="check">
          Saved {justImported} holding{justImported === 1 ? "" : "s"}. Only the instrument, quantity, cost and date were stored.
        </Notice>
      ) : null}

      {importing ? (
        <ImportFlow
          onCancel={() => {
            setImporting(false);
            importButtonRef.current?.focus();
          }}
          onImported={(saved) => {
            setImporting(false);
            setJustImported(saved.length);
            void portfolio.reload();
          }}
        />
      ) : null}

      {portfolio.error ? (
        <ErrorState message={portfolio.error} onRetry={() => void portfolio.reload()} />
      ) : portfolio.loading ? (
        <SkeletonRows rows={5} />
      ) : !holdings.length ? (
        importing ? null : (
          <EmptyState
            icon="wallet"
            title="No holdings yet"
            body="Import your holdings from a broker CSV or enter them by hand to get a risk and diversification report. Personal details are never stored."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
                <Icon name="plus" />
                Import holdings
              </button>
            }
          />
        )
      ) : (
        <>
          <PortfolioReport holdings={holdings} />

          <section className="table-frame" aria-labelledby="holdings-heading">
            <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
              <h2 id="holdings-heading" style={{ fontSize: "var(--text-h4)" }}>
                Holdings ({holdings.length})
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete("all")}>
                <Icon name="trash" />
                Delete all portfolio data
              </button>
            </div>
            {imports.map((item) => (
              <div key={item.id}>
                <div className="toolbar" style={{ justifyContent: "space-between" }}>
                  <span className="text-secondary">
                    {SOURCE_LABELS[item.source] ?? item.source} · {item.rowCount} holding{item.rowCount === 1 ? "" : "s"} · imported {formatDateTime(item.createdAt)}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(item)}>
                    Delete this import
                  </button>
                </div>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Instrument</th>
                        <th scope="col">Type</th>
                        <th scope="col" className="right">
                          Quantity
                        </th>
                        <th scope="col" className="right">
                          Average cost
                        </th>
                        <th scope="col">Purchased</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(byImport.get(item.id) ?? []).map((holding) => (
                        <tr key={holding.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{holding.name}</div>
                            <div className="text-meta mono">
                              {holding.symbol ?? holding.isin}
                              {holding.exchange ? ` · ${holding.exchange}` : ""}
                              {holding.sector ? ` · ${holding.sector}` : ""}
                            </div>
                          </td>
                          <td className="text-secondary">{ASSET_LABELS[holding.assetType] ?? holding.assetType}</td>
                          <td className="right num">{holding.quantity.toLocaleString()}</td>
                          <td className="right num">{holding.avgCost == null ? "—" : formatPrice(holding.avgCost, holding.currency)}</td>
                          <td className="text-secondary num">{holding.buyDate ? formatDate(holding.buyDate) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete === "all" ? "Delete all portfolio data?" : "Delete this import?"}
        body={
          pendingDelete === "all"
            ? "Every holding and import record on your account is permanently deleted. It can't be undone."
            : "The holdings from this import are permanently deleted. It can't be undone."
        }
        confirmLabel={pendingDelete === "all" ? "Delete all portfolio data" : "Delete this import"}
        onConfirm={() => void confirmDelete()}
        busy={deleting}
      />
    </div>
  );
}
