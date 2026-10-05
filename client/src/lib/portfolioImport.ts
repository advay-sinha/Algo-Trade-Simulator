// Turning a broker export or the template into allowlisted holding rows, in the browser.
// Pure and import-free (types only) so the Node test runner can load it.

export type ImportField = "symbol" | "isin" | "quantity" | "avgCost" | "buyDate" | "assetType";
export type AssetType = "equity" | "etf" | "mutual_fund" | "gold" | "other";
export const IMPORT_FIELDS: ImportField[] = ["symbol", "isin", "quantity", "avgCost", "buyDate", "assetType"];
export const ASSET_TYPES: AssetType[] = ["equity", "etf", "mutual_fund", "gold", "other"];
export const FIELD_LABELS: Record<ImportField, string> = {
  symbol: "Symbol",
  isin: "ISIN",
  quantity: "Quantity",
  avgCost: "Average cost",
  buyDate: "Purchase date",
  assetType: "Asset type",
};
export const MAX_ROWS = 100;

/** One editable preview row; every value stays a string until upload. */
export type DraftRow = Record<ImportField, string> & { key: string };

const SYNONYMS: Record<ImportField, RegExp> = {
  symbol: /^(symbol|instrument|trading ?symbol|tradingsymbol|scrip|scrip ?symbol|stock ?symbol|ticker|nse ?symbol|security ?symbol)$/,
  isin: /^(isin|isin ?code|isin ?no\.?|isin ?number)$/,
  quantity: /^(qty\.?|quantity|quantity ?available|net ?qty\.?|total ?quantity|shares|units|balance ?units|holding ?quantity|free ?quantity)$/,
  avgCost: /^(avg\.? ?cost|average ?cost|avg\.? ?price|average ?price|average ?buy ?price|avg\.? ?buy ?price|buy ?avg\.?|buy ?average|cost ?price|average ?cost ?price)$/,
  buyDate: /^(buy ?date|purchase ?date|date ?of ?purchase|acquisition ?date|trade ?date)$/,
  assetType: /^(asset ?type|asset ?class|instrument ?type|type)$/,
};

const normaliseHeader = (header: string) => header.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

export function guessField(header: string): ImportField | null {
  const text = normaliseHeader(header);
  for (const field of IMPORT_FIELDS) if (SYNONYMS[field].test(text)) return field;
  return null;
}

/**
 * Broker exports often start with title lines (and sometimes the account holder's name or client
 * code) before the table. The header row is the first row that names a quantity column and a
 * symbol or ISIN column; everything above it is ignored and never uploaded.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let index = 0; index < Math.min(rows.length, 40); index++) {
    const fields = rows[index].map(guessField);
    if (fields.includes("quantity") && (fields.includes("symbol") || fields.includes("isin"))) return index;
  }
  return 0;
}

export function autoMap(headers: string[], isSensitive: (header: string) => boolean): Array<ImportField | null> {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    if (isSensitive(header)) return null;
    const field = guessField(header);
    if (!field || used.has(field)) return null;
    used.add(field);
    return field;
  });
}

export function parseNumber(raw: string): string {
  const cleaned = raw.replace(/[₹$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-") return "";
  return Number.isFinite(Number(cleaned)) ? String(Number(cleaned)) : raw.trim();
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (value: number) => String(value).padStart(2, "0");

/** Indian exports write day first; ISO dates pass through. Unparseable values are kept for the user to fix. */
export function parseDate(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) return `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
  match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-](\d{2,4})$/);
  if (match && MONTHS[match[2].toLowerCase()]) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${pad(MONTHS[match[2].toLowerCase()])}-${pad(Number(match[1]))}`;
  }
  return text;
}

export function parseAssetType(raw: string): string {
  const text = raw.toLowerCase().trim();
  if (!text) return "equity";
  if (/mutual|\bmf\b|fund/.test(text)) return "mutual_fund";
  if (/etf/.test(text)) return "etf";
  if (/gold|sgb/.test(text)) return "gold";
  if (/equity|stock|share/.test(text)) return "equity";
  return ASSET_TYPES.includes(text as AssetType) ? text : "other";
}

let counter = 0;
export function emptyRow(): DraftRow {
  counter += 1;
  return { key: `row-${Date.now()}-${counter}`, symbol: "", isin: "", quantity: "", avgCost: "", buyDate: "", assetType: "equity" };
}

/** Build preview rows from the mapped columns only — unmapped columns never enter a row object. */
export function buildRows(rows: string[][], headerIndex: number, mapping: Array<ImportField | null>): DraftRow[] {
  const out: DraftRow[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const draft = emptyRow();
    let hasValue = false;
    mapping.forEach((field, column) => {
      if (!field) return;
      const raw = (cells[column] ?? "").trim();
      if (!raw) return;
      hasValue = true;
      if (field === "quantity" || field === "avgCost") draft[field] = parseNumber(raw);
      else if (field === "buyDate") draft[field] = parseDate(raw);
      else if (field === "assetType") draft[field] = parseAssetType(raw);
      else if (field === "isin") draft[field] = raw.toUpperCase();
      else draft[field] = raw.toUpperCase();
    });
    // Skip totals/footer lines and rows that carry no instrument.
    if (/^(sub ?total|grand ?total|total)\b/i.test(draft.symbol)) continue;
    if (hasValue && (draft.symbol || draft.isin)) out.push(draft);
  }
  return out;
}

const SYMBOL_RE = /^[A-Za-z0-9.^=&-]{1,20}$/;
const ISIN_RE = /^[A-Za-z]{2}[A-Za-z0-9]{9}[0-9]$/;

/** Format checks mirroring the server schema (the server re-validates everything). */
export function rowProblems(row: DraftRow, today = new Date().toISOString().slice(0, 10)): Partial<Record<ImportField, string>> {
  const problems: Partial<Record<ImportField, string>> = {};
  if (!row.symbol && !row.isin) problems.symbol = "Add a symbol or an ISIN.";
  if (row.symbol && !SYMBOL_RE.test(row.symbol)) problems.symbol = "Use a ticker like RELIANCE.NS.";
  if (row.isin && !ISIN_RE.test(row.isin)) problems.isin = "An ISIN has 12 characters, like INE002A01018.";
  const quantity = Number(row.quantity);
  if (!row.quantity || !Number.isFinite(quantity) || quantity <= 0) problems.quantity = "Enter a quantity above zero.";
  if (row.avgCost) {
    const cost = Number(row.avgCost);
    if (!Number.isFinite(cost) || cost < 0) problems.avgCost = "Enter a cost of zero or more, or leave it empty.";
  }
  if (row.buyDate && (!/^\d{4}-\d{2}-\d{2}$/.test(row.buyDate) || row.buyDate > today)) problems.buyDate = "Use a past date as YYYY-MM-DD, or leave it empty.";
  if (!ASSET_TYPES.includes(row.assetType as AssetType)) problems.assetType = "Choose an asset type.";
  return problems;
}

/** The request rows: allowlisted fields only, empty optionals omitted. */
export function toPayloadRows(rows: DraftRow[]) {
  return rows.map((row) => ({
    ...(row.symbol ? { symbol: row.symbol.toUpperCase() } : {}),
    ...(row.isin ? { isin: row.isin.toUpperCase() } : {}),
    quantity: Number(row.quantity),
    ...(row.avgCost ? { avgCost: Number(row.avgCost) } : {}),
    ...(row.buyDate ? { buyDate: row.buyDate } : {}),
    assetType: row.assetType,
  }));
}

export const TEMPLATE_CSV = "symbol,isin,quantity,avgCost,buyDate,assetType\nRELIANCE.NS,,10,2450.50,2024-03-15,equity\n,INE467B01029,5,,,equity\nGOLDBEES.NS,,100,52.10,,etf\n";
