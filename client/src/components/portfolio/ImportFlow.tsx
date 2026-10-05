// Privacy-first holdings import: checklist → source → column map → preview (personal-data scan,
// Remove / Remove all) → upload. Files are parsed here in the browser; only allowlisted holding rows
// are ever sent, and the server re-checks them and rejects the whole import on any finding.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ApiError, importHoldings } from "../../api";
import { parseCsv } from "../../lib/csv";
import { describeError } from "../../lib/errors";
import { KIND_LABELS, isSensitiveHeader, scanText, type PiiKind } from "../../lib/pii";
import {
  ASSET_TYPES,
  FIELD_LABELS,
  IMPORT_FIELDS,
  MAX_ROWS,
  TEMPLATE_CSV,
  autoMap,
  buildRows,
  emptyRow,
  findHeaderRow,
  rowProblems,
  toPayloadRows,
  type DraftRow,
  type ImportField,
} from "../../lib/portfolioImport";
import { findSymbol } from "../../lib/symbolSearch";
import { useAuthed } from "../../lib/session";
import { useSymbolCatalog } from "../../lib/useSymbolCatalog";
import type { ImportRejection, PortfolioHolding } from "../../types";
import { Icon } from "../ui/Icon";
import { ErrorState, Notice } from "../ui/primitives";
import { SymbolCombobox } from "../ui/SymbolCombobox";

type Step = "checklist" | "source" | "unlock" | "map" | "preview";
type Source = "csv" | "zerodha" | "groww" | "upstox" | "manual" | "cas_nsdl" | "cas_cdsl" | "cams" | "kfintech";
const CAS_SOURCES: Record<string, Source> = { cas_nsdl: "cas_nsdl", cas_cdsl: "cas_cdsl", cams: "cams", kfintech: "kfintech" };

const SOURCES: Array<{ id: Source; label: string }> = [
  { id: "zerodha", label: "Zerodha (Console holdings CSV)" },
  { id: "groww", label: "Groww (holdings CSV)" },
  { id: "upstox", label: "Upstox (holdings CSV)" },
  { id: "csv", label: "Other broker / our template (CSV)" },
];
const ASSET_LABELS: Record<string, string> = { equity: "Equity", etf: "ETF", mutual_fund: "Mutual fund", gold: "Gold", other: "Other" };
const REMOVE_ITEMS = [
  "Demat / BO ID (16 digits) and DP ID",
  "Broker client ID",
  "PAN and Aadhaar",
  "Your name, address, email and phone number",
  "Date of birth",
  "Bank account number, IFSC and UPI ID",
  "Nominee details",
];

interface CellFinding {
  kind: PiiKind | string;
  label: string;
  fromServer?: boolean;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "holdings-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportFlow({ onImported, onCancel }: { onImported: (holdings: PortfolioHolding[]) => void; onCancel: () => void }) {
  const { token, handleAuthError } = useAuthed();
  const catalog = useSymbolCatalog();
  const [step, setStep] = useState<Step>("checklist");
  const [acknowledged, setAcknowledged] = useState(false);
  const [source, setSource] = useState<Source>("zerodha");
  const [table, setTable] = useState<{ rows: string[][]; headerIndex: number; fileName: string } | null>(null);
  const [mapping, setMapping] = useState<Array<ImportField | null>>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<ImportRejection | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [casFile, setCasFile] = useState<File | null>(null);
  const [casPassword, setCasPassword] = useState("");
  const [casBusy, setCasBusy] = useState(false);
  const [casMessage, setCasMessage] = useState<string | null>(null);
  const [casSummary, setCasSummary] = useState<{ layout: string; rows: number; parsedTotal: number; statementTotal: number | null; totalsMatch: boolean | null; missingCost: number } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => catalog.ensure(), [catalog.ensure]);
  useEffect(() => headingRef.current?.focus(), [step]);

  // Bare NSE trading symbols from broker exports ("RELIANCE") get the ".NS" suffix when the catalog knows it.
  const normaliseSymbol = (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!upper || !catalog.index || /[.^=]/.test(upper)) return upper;
    if (findSymbol(catalog.index, upper)) return upper;
    return findSymbol(catalog.index, `${upper}.NS`) ? `${upper}.NS` : upper;
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError(null);
    if (/\.pdf$/i.test(file.name)) {
      void openCas(file);
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      setFileError("Excel files can't be read here. Open the file and save it as CSV, then choose it again.");
      return;
    }
    if (file.size > 2_000_000) {
      setFileError("That file is larger than a holdings export should be. Choose the holdings CSV only.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (!parsed.length) {
      setFileError("That file has no rows. Choose your holdings CSV.");
      return;
    }
    const headerIndex = findHeaderRow(parsed);
    setTable({ rows: parsed, headerIndex, fileName: file.name });
    setMapping(autoMap(parsed[headerIndex], isSensitiveHeader));
    setStep("map");
  };

  // CAS statements are read here with pdf.js; the PDF and its password are never uploaded.
  const openCas = async (file: File, password?: string) => {
    setFileError(null);
    setCasMessage(null);
    if (file.size > 15_000_000) {
      setFileError("That PDF is larger than a CAS statement should be. Choose the statement you downloaded from NSDL, CDSL, CAMS or KFintech.");
      return;
    }
    setCasBusy(true);
    try {
      const { readCas, CasPasswordError } = await import("../../lib/cas");
      try {
        const result = await readCas(file, password);
        setCasFile(null);
        setCasPassword("");
        if (!result.rows.length) {
          setStep("source");
          setFileError("We couldn't find holdings in this statement's layout. Export your holdings as CSV from your broker instead, or enter them by hand.");
          return;
        }
        setSource(CAS_SOURCES[result.layout] ?? "csv");
        setRows(
          result.rows.map((row) => ({
            ...emptyRow(),
            isin: row.isin,
            quantity: String(row.quantity),
            avgCost: row.avgCost != null ? String(row.avgCost) : "",
            assetType: row.assetType,
          })),
        );
        setCasSummary({
          layout: result.layout,
          rows: result.rows.length,
          parsedTotal: result.parsedTotal,
          statementTotal: result.statementTotal,
          totalsMatch: result.totalsMatch,
          missingCost: result.rows.filter((row) => row.avgCost == null).length,
        });
        setRejection(null);
        setStep("preview");
      } catch (error) {
        if (error instanceof CasPasswordError) {
          setCasFile(file);
          setCasPassword("");
          setCasMessage(error.incorrect ? "That password didn't open the statement. Check it and try again." : null);
          setStep("unlock");
          return;
        }
        setStep("source");
        setFileError("This file couldn't be read as a CAS statement. Export your holdings as CSV instead, or enter them by hand.");
      }
    } catch {
      setFileError("The statement reader didn't load. Check your connection and try again.");
    } finally {
      setCasBusy(false);
    }
  };

  const headers = table ? table.rows[table.headerIndex] : [];
  const sensitive = useMemo(() => headers.map(isSensitiveHeader), [headers]);
  const sample = (column: number) => table?.rows.slice(table.headerIndex + 1).find((cells) => (cells[column] ?? "").trim())?.[column] ?? "";
  const mappedFields = mapping.filter(Boolean) as ImportField[];
  const mapProblem = !mappedFields.includes("quantity")
    ? "Choose which column holds the quantity."
    : !mappedFields.includes("symbol") && !mappedFields.includes("isin")
      ? "Choose a Symbol or ISIN column."
      : null;
  const dataRowCount = table ? table.rows.length - table.headerIndex - 1 : 0;

  const toPreview = () => {
    if (!table) return;
    const built = buildRows(table.rows, table.headerIndex, mapping).map((row) => ({ ...row, symbol: normaliseSymbol(row.symbol) }));
    setRows(built);
    setRejection(null);
    setStep("preview");
  };

  const startManual = () => {
    setSource("manual");
    setRows([]);
    setRejection(null);
    setStep("preview");
  };

  // Personal-data findings per cell: browser scan + anything the server reported.
  const findings = useMemo(() => {
    const map = new Map<string, CellFinding[]>();
    rows.forEach((row, index) => {
      for (const field of IMPORT_FIELDS) {
        const kinds = scanText(row[field], field);
        if (kinds.length) map.set(`${index}:${field}`, kinds.map((kind) => ({ kind, label: KIND_LABELS[kind] })));
      }
    });
    if (rejection?.code === "personal_data_detected") {
      for (const finding of rejection.findings) {
        const key = `${finding.row - 1}:${finding.field}`;
        if (!map.has(key) && finding.field !== "other") map.set(key, [{ kind: finding.kind, label: finding.label, fromServer: true }]);
      }
    }
    return map;
  }, [rows, rejection]);
  const problems = useMemo(() => rows.map((row) => rowProblems(row)), [rows]);
  const unresolvedRows = new Set(rejection?.code === "unresolved_instruments" ? rejection.rows.map((item) => item.row - 1) : []);
  const findingCount = findings.size;
  const problemCount = problems.filter((item) => Object.keys(item).length).length;
  const tooMany = rows.length > MAX_ROWS;
  const canUpload = rows.length > 0 && !findingCount && !problemCount && !tooMany && !uploading;

  const updateCell = (index: number, field: ImportField, value: string) => {
    setRows((previous) => previous.map((row, position) => (position === index ? { ...row, [field]: value } : row)));
    if (rejection) setRejection(null);
  };
  const removeCell = (index: number, field: ImportField) => updateCell(index, field, field === "assetType" ? "equity" : "");
  const removeAll = () => {
    setRows((previous) =>
      previous.map((row, index) => {
        const next = { ...row };
        for (const field of IMPORT_FIELDS) if (findings.has(`${index}:${field}`)) next[field] = field === "assetType" ? "equity" : "";
        return next;
      }),
    );
    setRejection(null);
  };

  const upload = async () => {
    setUploading(true);
    setUploadError(null);
    setRejection(null);
    try {
      const result = await importHoldings(token, source, toPayloadRows(rows));
      onImported(result.holdings);
    } catch (error) {
      if (handleAuthError(error)) return;
      if (error instanceof ApiError && error.detail && typeof error.detail === "object" && "code" in (error.detail as object)) {
        setRejection(error.detail as ImportRejection);
      } else {
        setUploadError(describeError(error, "import your holdings"));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="import-heading">
      <div className="panel-header">
        <h2 id="import-heading" ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-h4)" }}>
          {step === "checklist"
            ? "Before you import"
            : step === "source"
              ? "Choose what to import"
              : step === "unlock"
                ? "Unlock the statement"
                : step === "map"
                  ? "Match the columns"
                  : "Check your holdings"}
        </h2>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel import
        </button>
      </div>
      <div className="panel-body stack">
        {step === "checklist" ? (
          <>
            <div className="grid-2">
              <div className="stack" style={{ gap: "var(--space-2)" }}>
                <h3 className="field-label">Remove or leave out</h3>
                <ul className="stack" style={{ gap: "var(--space-1)", paddingLeft: "var(--space-5)", margin: 0 }}>
                  {REMOVE_ITEMS.map((item) => (
                    <li key={item} className="text-secondary">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="stack" style={{ gap: "var(--space-2)" }}>
                <h3 className="field-label">We only need</h3>
                <p className="text-secondary">The instrument (symbol or ISIN), the quantity, and optionally your average cost and purchase date.</p>
                <p className="text-meta">
                  Files are read in your browser and never uploaded. Only those holding fields are sent, they're checked again on our server, and anything that looks like personal data
                  makes us refuse the whole import. You can delete your holdings at any time. Holdings are used only to compute your portfolio report.
                </p>
              </div>
            </div>
            <label className="cluster" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I've removed or left out these personal details
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-primary" disabled={!acknowledged} onClick={() => setStep("source")}>
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === "source" ? (
          <>
            <div className="field" style={{ maxWidth: 420 }}>
              <label className="field-label" htmlFor="import-source">
                Where is the file from?
              </label>
              <select id="import-source" className="select" value={source === "manual" ? "csv" : source} onChange={(event) => setSource(event.target.value as Source)}>
                {SOURCES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Export your holdings as CSV from the broker's website (save Excel files as CSV first), or use the monthly CAS statement from NSDL, CDSL, CAMS or KFintech — it's read on
                this device and never uploaded.
              </span>
            </div>
            {fileError ? <ErrorState message={fileError} /> : null}
            <div className="cluster">
              <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <Icon name="download" />
                Choose holdings CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event)} />
              <button type="button" className="btn" disabled={casBusy} onClick={() => pdfRef.current?.click()}>
                <Icon name="shield" />
                {casBusy ? "Reading statement…" : "Read a CAS statement (PDF)"}
              </button>
              <input ref={pdfRef} type="file" accept=".pdf,application/pdf" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event)} />
              <button type="button" className="btn" onClick={startManual}>
                <Icon name="plus" />
                Enter holdings by hand
              </button>
              <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>
                Download the CSV template
              </button>
            </div>
          </>
        ) : null}

        {step === "unlock" && casFile ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const password = casPassword;
              setCasPassword("");
              void openCas(casFile, password);
            }}
          >
            <p className="text-secondary">
              {casFile.name} is password-protected (usually your PAN in capitals, sometimes with your date of birth). The password is used on this device to open the file and is
              never sent or saved.
            </p>
            <div className="field" style={{ maxWidth: 320 }}>
              <label className="field-label" htmlFor="cas-password">
                Statement password
              </label>
              <input
                id="cas-password"
                className="input"
                type="password"
                autoComplete="off"
                value={casPassword}
                aria-invalid={casMessage ? true : undefined}
                aria-describedby={casMessage ? "cas-password-error" : undefined}
                onChange={(event) => {
                  setCasPassword(event.target.value);
                  if (casMessage) setCasMessage(null);
                }}
              />
              {casMessage ? (
                <span className="field-error" id="cas-password-error">
                  {casMessage}
                </span>
              ) : null}
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCasFile(null);
                  setCasPassword("");
                  setStep("source");
                }}
              >
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={!casPassword || casBusy}>
                {casBusy ? "Opening…" : "Open statement"}
              </button>
            </div>
          </form>
        ) : null}

        {step === "map" && table ? (
          <>
            <p className="text-secondary">
              {table.fileName}: {dataRowCount} row{dataRowCount === 1 ? "" : "s"} below the header. Only the columns you match are read; everything else stays on your device.
            </p>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Column in your file</th>
                    <th scope="col">Example</th>
                    <th scope="col">Use as</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, column) => {
                    const example = sample(column);
                    const exampleFlagged = scanText(example).length > 0;
                    return (
                      <tr key={`${header}-${column}`}>
                        <td style={{ fontWeight: 500 }}>{header || `Column ${column + 1}`}</td>
                        <td className="text-secondary mono">{sensitive[column] || exampleFlagged ? "Hidden — personal data" : example || "—"}</td>
                        <td>
                          {sensitive[column] ? (
                            <span className="status-pill">
                              <Icon name="shield" />
                              Personal data · never uploaded
                            </span>
                          ) : (
                            <>
                              <label className="visually-hidden" htmlFor={`map-${column}`}>
                                Use {header} as
                              </label>
                              <select
                                id={`map-${column}`}
                                className="select"
                                value={mapping[column] ?? ""}
                                onChange={(event) => {
                                  const value = (event.target.value || null) as ImportField | null;
                                  setMapping((previous) => previous.map((field, position) => (position === column ? value : value && field === value ? null : field)));
                                }}
                              >
                                <option value="">Not uploaded</option>
                                {IMPORT_FIELDS.map((field) => (
                                  <option key={field} value={field}>
                                    {FIELD_LABELS[field]}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mapProblem ? <Notice tone="warn">{mapProblem}</Notice> : null}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setStep("source")}>
                Choose another file
              </button>
              <button type="button" className="btn btn-primary" disabled={Boolean(mapProblem)} onClick={toPreview}>
                Preview holdings
              </button>
            </div>
          </>
        ) : null}

        {step === "preview" && casSummary ? (
          <Notice icon={casSummary.totalsMatch === false ? "alert" : "check"} tone={casSummary.totalsMatch === false ? "warn" : "info"}>
            Read {casSummary.rows} holding{casSummary.rows === 1 ? "" : "s"} from the statement.{" "}
            {casSummary.totalsMatch === true
              ? "Their values add up to the statement's total."
              : casSummary.totalsMatch === false
                ? "Their values don't add up to the statement's total — some holdings may be missing. Check against your statement."
                : ""}{" "}
            {casSummary.missingCost
              ? `Demat statements show market value, not what you paid: add an average cost for ${casSummary.missingCost === 1 ? "that holding" : `those ${casSummary.missingCost} holdings`} if you want P&L and XIRR — the risk report works without it.`
              : ""}
          </Notice>
        ) : null}

        {step === "preview" ? (
          <PreviewStep
            rows={rows}
            findings={findings}
            problems={problems}
            unresolvedRows={unresolvedRows}
            onCell={updateCell}
            onRemoveCell={removeCell}
            onRemoveAll={removeAll}
            onDeleteRow={(index) => setRows((previous) => previous.filter((_, position) => position !== index))}
            onAdd={(row) => setRows((previous) => [...previous, { ...row, symbol: normaliseSymbol(row.symbol) }])}
            findingCount={findingCount}
            problemCount={problemCount}
            tooMany={tooMany}
            rejection={rejection}
            uploadError={uploadError}
            canUpload={canUpload}
            uploading={uploading}
            onUpload={() => void upload()}
            onBack={() => {
              setCasSummary(null);
              setStep(source === "manual" || casSummary ? "source" : "map");
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

interface PreviewProps {
  rows: DraftRow[];
  findings: Map<string, CellFinding[]>;
  problems: Array<Partial<Record<ImportField, string>>>;
  unresolvedRows: Set<number>;
  onCell: (index: number, field: ImportField, value: string) => void;
  onRemoveCell: (index: number, field: ImportField) => void;
  onRemoveAll: () => void;
  onDeleteRow: (index: number) => void;
  onAdd: (row: DraftRow) => void;
  findingCount: number;
  problemCount: number;
  tooMany: boolean;
  rejection: ImportRejection | null;
  uploadError: string | null;
  canUpload: boolean;
  uploading: boolean;
  onUpload: () => void;
  onBack: () => void;
}

function PreviewStep(props: PreviewProps) {
  const { rows, findings, problems, unresolvedRows, findingCount, problemCount, tooMany, rejection } = props;
  return (
    <>
      {rejection ? (
        <Notice tone="bad" icon="alert">
          {rejection.message}
          {rejection.code === "invalid_rows" ? (
            <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-5)" }}>
              {rejection.problems.slice(0, 5).map((problem, index) => (
                <li key={index}>
                  {problem.row ? `Row ${problem.row}` : "Import"}
                  {problem.field ? `, ${FIELD_LABELS[problem.field as ImportField] ?? problem.field}` : ""}: {problem.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      {props.uploadError ? <ErrorState message={props.uploadError} /> : null}
      {findingCount ? (
        <Notice tone="warn" icon="shield">
          <span>
            {findingCount} value{findingCount === 1 ? "" : "s"} look{findingCount === 1 ? "s" : ""} like personal data. Remove {findingCount === 1 ? "it" : "them"} before uploading.
          </span>{" "}
          <button type="button" className="btn" onClick={props.onRemoveAll}>
            Remove all personal data
          </button>
        </Notice>
      ) : null}
      {tooMany ? <Notice tone="warn">Imports are limited to 100 holdings. Remove {rows.length - 100} row{rows.length - 100 === 1 ? "" : "s"} or split the file.</Notice> : null}

      {rows.length ? (
        <div className="table-scroll">
          <table className="table import-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {IMPORT_FIELDS.map((field) => (
                  <th scope="col" key={field}>
                    {FIELD_LABELS[field]}
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className={unresolvedRows.has(index) ? "row-flagged" : undefined}>
                  <td className="num text-secondary">{index + 1}</td>
                  {IMPORT_FIELDS.map((field) => {
                    const cellFindings = findings.get(`${index}:${field}`);
                    const problem = problems[index][field] ?? (unresolvedRows.has(index) && (field === "symbol" || field === "isin") ? "No listed instrument matches this." : undefined);
                    const id = `cell-${row.key}-${field}`;
                    return (
                      <td key={field} className={cellFindings ? "cell-flagged" : undefined}>
                        <label className="visually-hidden" htmlFor={id}>
                          Row {index + 1} {FIELD_LABELS[field]}
                        </label>
                        {cellFindings ? (
                          <div className="stack" style={{ gap: "var(--space-1)" }}>
                            <span className="field-error" id={`${id}-error`}>
                              Looks like {cellFindings[0].label}
                            </span>
                            <button type="button" className="btn" aria-describedby={`${id}-error`} onClick={() => props.onRemoveCell(index, field)}>
                              Remove
                            </button>
                          </div>
                        ) : field === "assetType" ? (
                          <select id={id} className="select" value={row.assetType} onChange={(event) => props.onCell(index, field, event.target.value)}>
                            {ASSET_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {ASSET_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input
                              id={id}
                              className="input"
                              value={row[field]}
                              placeholder={field === "buyDate" ? "YYYY-MM-DD" : undefined}
                              inputMode={field === "quantity" || field === "avgCost" ? "decimal" : undefined}
                              aria-invalid={problem ? true : undefined}
                              aria-describedby={problem ? `${id}-problem` : undefined}
                              onChange={(event) => props.onCell(index, field, event.target.value)}
                            />
                            {problem ? (
                              <span className="field-error" id={`${id}-problem`}>
                                {problem}
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className="right">
                    <button type="button" className="btn btn-ghost" aria-label={`Delete row ${index + 1}`} onClick={() => props.onDeleteRow(index)}>
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-secondary">No holdings yet. Add them below.</p>
      )}

      <ManualAdd onAdd={props.onAdd} />

      <p className="text-meta">
        Only these fields are sent: symbol or ISIN, quantity, average cost, purchase date, asset type. {problemCount ? `${problemCount} row${problemCount === 1 ? " needs" : "s need"} fixing.` : ""}
      </p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={props.onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" disabled={!props.canUpload} onClick={props.onUpload}>
          {props.uploading ? "Checking and saving…" : `Upload ${rows.length} holding${rows.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </>
  );
}

function ManualAdd({ onAdd }: { onAdd: (row: DraftRow) => void }) {
  const [draft, setDraft] = useState<DraftRow>(emptyRow);
  const [errors, setErrors] = useState<Partial<Record<ImportField, string>>>({});

  // Blur-first checks: personal-data detectors plus the format rules; errors clear as soon as fixed.
  const checkField = (field: ImportField, value: string) => {
    const kinds = scanText(value, field);
    if (kinds.length) return `This looks like ${KIND_LABELS[kinds[0]]}. Remove it.`;
    return rowProblems({ ...draft, [field]: value })[field];
  };
  const set = (field: ImportField, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    if (errors[field] && !checkField(field, value)) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };
  const blur = (field: ImportField) => setErrors((previous) => ({ ...previous, [field]: checkField(field, draft[field]) }));

  const add = () => {
    const found: Partial<Record<ImportField, string>> = {};
    for (const field of IMPORT_FIELDS) {
      const message = checkField(field, draft[field]);
      if (message) found[field] = message;
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    onAdd(draft);
    setDraft(emptyRow());
  };

  const input = (field: ImportField, label: string, props: { inputMode?: "decimal"; placeholder?: string } = {}) => (
    <div className="field">
      <label className="field-label" htmlFor={`manual-${field}`}>
        {label}
      </label>
      <input
        id={`manual-${field}`}
        className="input"
        value={draft[field]}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `manual-${field}-error` : undefined}
        onChange={(event) => set(field, event.target.value)}
        onBlur={() => blur(field)}
        {...props}
      />
      {errors[field] ? (
        <span className="field-error" id={`manual-${field}-error`}>
          {errors[field]}
        </span>
      ) : null}
    </div>
  );

  return (
    <fieldset className="panel panel-body stack" style={{ margin: 0 }}>
      <legend className="field-label" style={{ padding: "0 var(--space-1)" }}>
        Add a holding
      </legend>
      <div className="form-row">
        <SymbolCombobox
          id="manual-symbol"
          label="Symbol"
          value={draft.symbol}
          onChange={(value) => set("symbol", value)}
          onSelect={(value) => set("symbol", value)}
          onBlur={() => blur("symbol")}
          error={errors.symbol}
        />
        {input("isin", "ISIN (optional)", { placeholder: "INE002A01018" })}
        {input("quantity", "Quantity", { inputMode: "decimal" })}
        {input("avgCost", "Average cost (optional)", { inputMode: "decimal" })}
        {input("buyDate", "Purchase date (optional)", { placeholder: "YYYY-MM-DD" })}
        <div className="field">
          <label className="field-label" htmlFor="manual-assetType">
            Asset type
          </label>
          <select id="manual-assetType" className="select" value={draft.assetType} onChange={(event) => set("assetType", event.target.value)}>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {ASSET_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={add}>
          <Icon name="plus" />
          Add holding
        </button>
      </div>
    </fieldset>
  );
}
