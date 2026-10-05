// Pattern 9 — Analytics: institutional flows, derivatives positioning, sector-wise FPI flows and capex.
// Every block carries its as-of date and granularity; unavailable sources say so instead of guessing.
import { useMemo, useState } from "react";
import { fetchCompanyCapex, fetchInstitutionalFlows, fetchSectorCapex, fetchSectorFlows } from "../api";
import { TimeSeriesChart } from "../components/charts/TimeSeriesChart";
import { LabelWithHint } from "../components/ui/InfoHint";
import { EmptyState, ErrorState, MetricCard, Notice, SectionHeader, Skeleton, SkeletonRows } from "../components/ui/primitives";
import { SymbolCombobox } from "../components/ui/SymbolCombobox";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { direction, directionArrow, formatDate, formatFraction, formatSignedFraction } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { CompanyCapex, SectorCapex } from "../types";

const section = SECTIONS.flows;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";

/** Amounts already in ₹ crore (NSE / NSDL). */
function crore(value: number | null | undefined, signed = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
}

/** Reported statement amounts in currency units → ₹ crore for INR, millions otherwise. */
function statementAmount(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (!currency || currency === "INR") return `₹${(value / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
  return `${(value / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}M ${currency}`;
}

function Signed({ text, value }: { text: string; value: number | null | undefined }) {
  return (
    <span className={direction(value)} style={{ whiteSpace: "nowrap" }}>
      {value == null ? "—" : `${directionArrow(value)} ${text}`}
    </span>
  );
}

function InstitutionalPanel() {
  const flows = useAuthedQuery((token) => fetchInstitutionalFlows(token, 60), [], { action: "load institutional flows" });
  const data = flows.data;
  const cumulativeLines = useMemo(() => {
    if (!data?.cash.length) return [];
    const base = (key: "fiiCumulative" | "diiCumulative") => data.cash.map((row) => ({ timestamp: `${row.date}T00:00:00Z`, value: row[key] }));
    return [
      { id: "fii", label: "FII/FPI cumulative net", colorVar: "--series-1", points: base("fiiCumulative") },
      { id: "dii", label: "DII cumulative net", colorVar: "--series-2", points: base("diiCumulative") },
    ];
  }, [data]);
  const shareLine = useMemo(
    () =>
      data?.positioning.length
        ? [{ id: "share", label: "FII long share of index futures", colorVar: "--series-1", points: data.positioning.filter((row) => row.fiiIndexFuturesLongShare != null).map((row) => ({ timestamp: `${row.date}T00:00:00Z`, value: row.fiiIndexFuturesLongShare as number })) }]
        : [],
    [data],
  );

  if (flows.error) return <ErrorState message={flows.error} onRetry={() => void flows.reload()} />;
  if (flows.loading || !data) return <SkeletonRows rows={5} />;
  if (!data.cash.length && !data.positioning.length) {
    return (
      <EmptyState
        title="No institutional flow data yet"
        body="NSE didn't answer from this server and nothing has been captured yet. The daily capture fills this in after market hours; try again later."
        action={
          <button type="button" className="btn" onClick={() => void flows.reload()}>
            Try again
          </button>
        }
      />
    );
  }
  const latest = data.cash[data.cash.length - 1];
  const last20 = data.cash.slice(-20);
  const sum = (key: "fii" | "dii") => last20.reduce((total, row) => total + (row[key].net ?? 0), 0);
  const latestOi = data.positioning[data.positioning.length - 1];

  return (
    <div className="stack-lg">
      <section className="kpi-strip" aria-label="Institutional flows">
        {latest ? (
          <>
            <MetricCard label={`FII/FPI net · ${formatDate(latest.date)}`} hint={featureText("cash")} value={<Signed value={latest.fii.net} text={crore(latest.fii.net)} />} sub={`Bought ${crore(latest.fii.buy, false)} · sold ${crore(latest.fii.sell, false)}`} />
            <MetricCard label={`DII net · ${formatDate(latest.date)}`} hint={featureText("cash")} value={<Signed value={latest.dii.net} text={crore(latest.dii.net)} />} sub={`Bought ${crore(latest.dii.buy, false)} · sold ${crore(latest.dii.sell, false)}`} />
            {last20.length > 1 ? (
              <>
                <MetricCard label={`FII net · last ${last20.length} captured days`} value={<Signed value={sum("fii")} text={crore(sum("fii"))} />} sub={`since ${formatDate(last20[0].date)}`} />
                <MetricCard label={`DII net · last ${last20.length} captured days`} value={<Signed value={sum("dii")} text={crore(sum("dii"))} />} sub={`since ${formatDate(last20[0].date)}`} />
              </>
            ) : null}
          </>
        ) : null}
        {latestOi ? (
          <MetricCard
            label={`FII index futures long · ${formatDate(latestOi.date)}`}
            hint={featureText("positioning")}
            value={formatFraction(latestOi.fiiIndexFuturesLongShare, 0)}
            sub={`Net ${(latestOi.indexFuturesNet.fii ?? 0).toLocaleString("en-IN")} contracts`}
          />
        ) : null}
      </section>
      <p className="text-meta">
        Daily NSE data. Cash-market history since {formatDate(data.historySince.cash)} (NSE publishes only the latest day, so it builds up from the daily capture); positioning
        history since {formatDate(data.historySince.positioning)}. Totals cover captured days only.
      </p>

      {cumulativeLines.length && data.cash.length > 1 ? (
        <section className="panel" aria-labelledby="cum-heading">
          <div className="panel-header">
            <h2 id="cum-heading" style={{ fontSize: "var(--text-h4)" }}>
              Cumulative cash-market net (₹ crore)
            </h2>
          </div>
          <div className="panel-body">
            <TimeSeriesChart lines={cumulativeLines} ariaLabel="Running total of FII/FPI and DII net cash-market buying since capture began, in rupees crore. The table below lists each day." />
          </div>
        </section>
      ) : null}

      {shareLine.length && data.positioning.length > 1 ? (
        <section className="panel" aria-labelledby="share-heading">
          <div className="panel-header">
            <h2 id="share-heading" style={{ fontSize: "var(--text-h4)" }}>
              FII long share of index-futures open interest
            </h2>
          </div>
          <div className="panel-body">
            <TimeSeriesChart lines={shareLine} valueFormat="percent" size="small" ariaLabel="Share of FII index-futures open interest that is long, by day. 50% would mean longs and shorts are equal." />
          </div>
        </section>
      ) : null}

      <section className="table-frame" aria-labelledby="daily-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="daily-heading" style={{ fontSize: "var(--text-h4)" }}>
            Daily cash-market activity
          </h2>
          <span className="text-meta">NSE provisional figures, ₹ crore</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="right">
                  FII/FPI net
                </th>
                <th scope="col" className="right">
                  DII net
                </th>
                <th scope="col" className="right">
                  FII index futures long
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.cash].reverse().slice(0, 15).map((row) => {
                const oi = data.positioning.find((item) => item.date === row.date);
                return (
                  <tr key={row.date}>
                    <td className="num">{formatDate(row.date)}</td>
                    <td className="right num">
                      <Signed value={row.fii.net} text={crore(row.fii.net)} />
                    </td>
                    <td className="right num">
                      <Signed value={row.dii.net} text={crore(row.dii.net)} />
                    </td>
                    <td className="right num">{oi ? formatFraction(oi.fiiIndexFuturesLongShare, 0) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SectorPanel() {
  const flows = useAuthedQuery((token) => fetchSectorFlows(token, 6, "1mo"), [], { action: "load sector flows" });
  const data = flows.data;
  if (flows.error) return <ErrorState message={flows.error} onRetry={() => void flows.reload()} />;
  if (flows.loading || !data) return <SkeletonRows rows={6} />;
  if (!data.reports.length) return <Notice tone="warn">NSDL's sector report didn't load from this server. Try again later.</Notice>;
  const latest = data.reports[data.reports.length - 1];
  const earlier = data.reports.slice(0, -1).slice(-3);
  const rows = [...latest.sectors].sort((a, b) => (b.netEquity ?? 0) - (a.netEquity ?? 0));
  const previous = (sector: string, report: (typeof data.reports)[number]) => report.sectors.find((item) => item.sector === sector)?.netEquity ?? null;
  return (
    <div className="stack-lg">
      <section className="table-frame" aria-labelledby="sector-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="sector-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Sector-wise FPI flows" text={featureText("sectors")}>
              Foreign portfolio flows by sector
            </LabelWithHint>
          </h2>
          <span className="text-meta">
            NSDL, fortnightly, equity, ₹ crore · latest: {latest.period} · total {crore(latest.total?.netEquity)}
          </span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Sector</th>
                <th scope="col" className="right">
                  Latest fortnight
                </th>
                {earlier.map((report) => (
                  <th scope="col" className="right" key={report.date}>
                    To {formatDate(report.date)}
                  </th>
                ))}
                <th scope="col" className="right">
                  Share of FPI equity holdings
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sector}>
                  <td>{row.sector}</td>
                  <td className="right num">
                    <Signed value={row.netEquity} text={crore(row.netEquity)} />
                  </td>
                  {earlier.map((report) => {
                    const value = previous(row.sector, report);
                    return (
                      <td className="right num text-secondary" key={report.date}>
                        {crore(value)}
                      </td>
                    );
                  })}
                  <td className="right num">{formatFraction(row.aucShare, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel" aria-labelledby="sector-index-heading">
        <div className="panel-header">
          <h2 id="sector-index-heading" style={{ fontSize: "var(--text-h4)" }}>
            Sector indices, last month
          </h2>
        </div>
        <div className="panel-body">
          <ul className="bar-list" aria-label="Sector index returns">
            {data.indexPerformance.filter((item) => item.return != null).map((item) => (
              <li key={item.symbol}>
                <span className="bar-list-label">{item.label}</span>
                <span className="text-meta">{item.return == null ? "No price history from Yahoo" : `${formatDate(item.from)} – ${formatDate(item.to)}`}</span>
                <span className="bar-list-value num">{item.return == null ? "—" : <Signed value={item.return} text={formatSignedFraction(item.return, 1)} />}</span>
              </li>
            ))}
          </ul>
          {data.indexPerformance.some((item) => item.return == null) ? (
            <p className="text-meta" style={{ marginTop: "var(--space-3)" }}>
              No price history from Yahoo for {data.indexPerformance.filter((item) => item.return == null).map((item) => item.label).join(", ")}.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CapexPanel() {
  const { token, handleAuthError } = useAuthed();
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanyCapex[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectors, setSectors] = useState<SectorCapex | null>(null);
  const [sectorsBusy, setSectorsBusy] = useState(false);

  const add = async (symbol: string) => {
    setBusy(true);
    setError(null);
    try {
      const [result] = await fetchCompanyCapex(token, [symbol]);
      setCompanies((previous) => [result, ...previous.filter((item) => item.symbol !== result.symbol)].slice(0, 4));
    } catch (caught) {
      if (handleAuthError(caught)) return;
      setError(describeError(caught, "load that company's capex"));
    } finally {
      setBusy(false);
    }
  };

  const loadSectors = async () => {
    setSectorsBusy(true);
    setError(null);
    try {
      setSectors(await fetchSectorCapex(token));
    } catch (caught) {
      if (handleAuthError(caught)) return;
      setError(describeError(caught, "load sector capex"));
    } finally {
      setSectorsBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="panel panel-body stack" aria-label="Company capex">
        <div style={{ maxWidth: 420 }}>
          <SymbolCombobox id="capex-symbol" label="Company" value={query} onChange={setQuery} onSelect={(symbol) => void add(symbol)} pickOnEnter clearOnSelect hint="Annual figures from reported cash-flow statements" />
        </div>
        {busy ? <Skeleton height={120} /> : null}
        {error ? <ErrorState message={error} /> : null}
        {companies.map((company) => (
          <div key={company.symbol} className="stack" style={{ gap: "var(--space-2)" }}>
            <h3 style={{ fontSize: "var(--text-h4)" }}>
              {company.name ?? company.symbol} <span className="text-meta mono">{company.symbol}</span>
            </h3>
            {company.source !== "live" || !company.data ? (
              <p className="text-secondary">{company.reason ?? "No capex data available."}</p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Fiscal year ending</th>
                      <th scope="col" className="right">
                        Capex
                      </th>
                      <th scope="col" className="right">
                        Change
                      </th>
                      <th scope="col" className="right">
                        <LabelWithHint label="Capex intensity" text={featureText("capex")}>
                          Capex / revenue
                        </LabelWithHint>
                      </th>
                      <th scope="col" className="right">
                        Capex / operating cash flow
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.data.years.map((year) => (
                      <tr key={year.fiscalYearEnd}>
                        <td className="num">{formatDate(year.fiscalYearEnd)}</td>
                        <td className="right num">{statementAmount(year.capex, company.data?.currency)}</td>
                        <td className="right num">{year.capexGrowth == null ? "—" : <Signed value={year.capexGrowth} text={formatSignedFraction(year.capexGrowth, 1)} />}</td>
                        <td className="right num">{formatFraction(year.capexToRevenue, 1)}</td>
                        <td className="right num">{formatFraction(year.capexToOperatingCashFlow, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="sector-capex-heading">
        <div className="panel-header">
          <h2 id="sector-capex-heading" style={{ fontSize: "var(--text-h4)" }}>
            Capex by sector (Nifty 50 companies)
          </h2>
          {!sectors ? (
            <button type="button" className="btn" disabled={sectorsBusy} onClick={() => void loadSectors()}>
              {sectorsBusy ? "Adding up 50 companies…" : "Load sector capex"}
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {!sectors ? (
            <p className="text-secondary">Sums each Nifty 50 company's reported annual capex by sector. The first load reads 50 statements and can take up to a minute; it's then kept for a week.</p>
          ) : sectors.source === "unavailable" || !sectors.sectors ? (
            <p className="text-secondary">{sectors.reason ?? "Sector capex is unavailable right now."}</p>
          ) : (
            <div className="stack">
              <p className="text-meta">
                As of {formatDate(sectors.asOf)} · {sectors.coverage?.reporting} of {sectors.coverage?.total} companies reported · annual, ₹ crore. Change is shown only when the same companies reported both years.
                {sectors.note ? ` ${sectors.note}` : ""}
              </p>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Sector</th>
                      <th scope="col" className="right">
                        Companies
                      </th>
                      <th scope="col" className="right">
                        Latest year capex
                      </th>
                      <th scope="col" className="right">
                        Change
                      </th>
                      <th scope="col" className="right">
                        Capex / revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectors.sectors.map((item) => {
                      const year = item.years[0];
                      return (
                        <tr key={item.sector}>
                          <td>{item.sector}</td>
                          <td className="right num">{item.companies}</td>
                          <td className="right num">{year ? `${statementAmount(year.capex, "INR")} (FY${year.fiscalYear})` : "—"}</td>
                          <td className="right num">{year?.capexGrowth == null ? "—" : <Signed value={year.capexGrowth} text={formatSignedFraction(year.capexGrowth, 1)} />}</td>
                          <td className="right num">{formatFraction(year?.capexToRevenue, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function MarketFlowsPage() {
  const [tab, setTab] = useState<"institutional" | "sectors" | "capex">("institutional");
  return (
    <div className="page">
      <SectionHeader section={section} />
      <Notice icon="info">Flows and capex describe what has happened; they aren't trading signals. Every figure shows its date and how often the source updates.</Notice>
      <div className="segmented" role="tablist" aria-label="Market flows views">
        {(
          [
            ["institutional", "FII / DII"],
            ["sectors", "Sector flows"],
            ["capex", "Capex"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "institutional" ? <InstitutionalPanel /> : tab === "sectors" ? <SectorPanel /> : <CapexPanel />}
    </div>
  );
}
