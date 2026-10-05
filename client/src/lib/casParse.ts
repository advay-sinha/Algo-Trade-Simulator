// CAS statement parsing (NSDL / CDSL eCAS, CAMS / KFintech mutual-fund CAS) from extracted text.
// Pure and import-free so the Node test runner can load it.
//
// Privacy by construction: a holding row is built ONLY from an ISIN (validated check digit) and the
// numbers around it. Statement headers (name, PAN, address, email, phone, BO / DP / client IDs) are
// never copied into a row — there is no field for them.

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

export type CasLayout = "cas_nsdl" | "cas_cdsl" | "cams" | "kfintech" | "unknown";

export interface CasRow {
  isin: string;
  quantity: number;
  /** Average cost per unit when the statement shows a cost value (mutual-fund CAS). */
  avgCost: number | null;
  assetType: "equity" | "etf" | "mutual_fund";
  /** Market value on the statement — used locally to check totals; never uploaded. */
  statementValue: number | null;
}

export interface CasResult {
  layout: CasLayout;
  rows: CasRow[];
  parsedTotal: number;
  statementTotal: number | null;
  totalsMatch: boolean | null;
}

/** Group positioned text items into lines (top to bottom, left to right). */
export function groupLines(items: TextItem[], tolerance = 2): string[] {
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) =>
    row.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.str.trim())
      .join("  "),
  );
}

const ISIN_RE = /\b(IN[A-Z0-9]{9}[0-9])\b/g;
// Indian (1,61,458.00) and western (161,458.00) grouping both parse.
const NUMBER_RE = /(?<![\w/.-])(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?![\w/-])/g;

export function isinValid(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits = isin
    .slice(0, -1)
    .split("")
    .map((char) => parseInt(char, 36).toString())
    .join("");
  let total = 0;
  digits
    .split("")
    .reverse()
    .forEach((char, index) => {
      let value = Number(char);
      if (index % 2 === 0) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      total += value;
    });
  return (10 - (total % 10)) % 10 === Number(isin[isin.length - 1]);
}

export function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER_RE)].map((match) => parseAmount(match[1])).filter((value) => Number.isFinite(value));
}

export function detectLayout(lines: string[]): CasLayout {
  const head = lines.slice(0, 15).join(" ").toUpperCase();
  if (head.includes("NSDL")) return "cas_nsdl";
  if (head.includes("CDSL")) return "cas_cdsl";
  if (head.includes("KFINTECH") || head.includes("KFIN ")) return "kfintech";
  if (head.includes("CAMS")) return "cams";
  return "unknown";
}

function labelled(block: string, label: RegExp): number | null {
  const match = block.match(label);
  return match ? parseAmount(match[1]) : null;
}

const UNITS = /closing\s+unit\s+balance\s*:?\s*([\d,]+(?:\.\d+)?)/i;
const COST = /(?:total\s+)?cost\s+value\s*:?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;
const MARKET = /(?:market\s+value|valuation)[^:]*:\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;

/** Demat line: find quantity × price ≈ value among the numbers after the ISIN. */
function dematRow(text: string): { quantity: number; value: number } | null {
  const numbers = numbersIn(text);
  for (let q = 0; q < numbers.length; q++) {
    for (let p = q + 1; p < numbers.length; p++) {
      for (let v = p + 1; v < numbers.length; v++) {
        const [quantity, price, value] = [numbers[q], numbers[p], numbers[v]];
        if (quantity <= 0 || price <= 0 || value <= 0) continue;
        if (Math.abs(quantity * price - value) <= Math.max(0.01 * value, 1)) return { quantity, value };
      }
    }
  }
  return null;
}

export function parseCas(lines: string[]): CasResult {
  const layout = detectLayout(lines);
  const rows: CasRow[] = [];
  const isinLines: Array<{ index: number; isin: string; after: string }> = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(ISIN_RE)) {
      if (isinValid(match[1])) isinLines.push({ index, isin: match[1], after: line.slice((match.index ?? 0) + match[1].length) });
    }
  });

  isinLines.forEach((entry, position) => {
    const nextIndex = position + 1 < isinLines.length ? isinLines[position + 1].index : lines.length;
    const block = [entry.after, ...lines.slice(entry.index + 1, Math.min(nextIndex, entry.index + 8))].join("\n");
    const fund = entry.isin.startsWith("INF") && UNITS.test(block);
    if (fund) {
      const units = labelled(block, UNITS);
      if (!units || units <= 0) return;
      const cost = labelled(block, COST);
      rows.push({ isin: entry.isin, quantity: units, avgCost: cost ? Math.round((cost / units) * 10_000) / 10_000 : null, assetType: "mutual_fund", statementValue: labelled(block, MARKET) });
      return;
    }
    const demat = dematRow(entry.after);
    if (demat) rows.push({ isin: entry.isin, quantity: demat.quantity, avgCost: null, assetType: entry.isin.startsWith("INF") ? "etf" : "equity", statementValue: demat.value });
  });

  const parsedTotal = Math.round(rows.reduce((sum, row) => sum + (row.statementValue ?? 0), 0) * 100) / 100;
  let statementTotal: number | null = null;
  for (const line of lines) {
    if (/\b(grand\s+total|total\s+market\s+value|portfolio\s+value|total)\b/i.test(line) && !ISIN_RE.test(line)) {
      const numbers = numbersIn(line);
      if (numbers.length) statementTotal = numbers[numbers.length - 1];
    }
    ISIN_RE.lastIndex = 0;
  }
  const totalsMatch = statementTotal == null || !rows.length ? null : Math.abs(statementTotal - parsedTotal) <= Math.max(1, statementTotal * 0.001);
  return { layout, rows, parsedTotal, statementTotal, totalsMatch };
}
