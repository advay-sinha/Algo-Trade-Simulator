// Personal-data detectors used before anything leaves the browser. Mirrors backend/services/pii.py
// exactly (both are tested against shared/pii-vectors.json). Pure and import-free so the Node test
// runner can load it. Detectors run in priority order and blank out each match before the next one.

export type PiiKind = "pan" | "aadhaar" | "demat_id" | "bank_account" | "ifsc" | "email" | "phone" | "upi" | "date";

export const KIND_LABELS: Record<PiiKind, string> = {
  pan: "a PAN",
  aadhaar: "an Aadhaar number",
  demat_id: "a demat / BO account ID",
  bank_account: "a bank account number",
  ifsc: "an IFSC code",
  email: "an email address",
  phone: "a phone number",
  upi: "a UPI ID",
  date: "a date (such as a date of birth)",
};

export const PLACEHOLDERS: Record<PiiKind, string> = {
  pan: "[PAN removed]",
  aadhaar: "[Aadhaar removed]",
  demat_id: "[demat ID removed]",
  bank_account: "[bank account removed]",
  ifsc: "[IFSC removed]",
  email: "[email removed]",
  phone: "[phone removed]",
  upi: "[UPI ID removed]",
  date: "[date removed]",
};

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  let check = 0;
  const reversed = digits.split("").reverse();
  reversed.forEach((char, index) => {
    check = D[check][P[index % 8][Number(char)]];
  });
  return check === 0;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const B = "(?<![0-9A-Za-z])";
const E = "(?![0-9A-Za-z])";

const DETECTORS: Array<{ kind: PiiKind; pattern: RegExp; extra?: (match: string) => boolean }> = [
  { kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  { kind: "upi", pattern: /[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]+(?![A-Za-z0-9.@])/g },
  { kind: "demat_id", pattern: new RegExp(`${B}IN\\d{14}${E}`, "gi") },
  { kind: "demat_id", pattern: new RegExp(`${B}\\d{16}${E}`, "g") },
  { kind: "aadhaar", pattern: new RegExp(`${B}[2-9]\\d{3}[\\s-]?\\d{4}[\\s-]?\\d{4}${E}`, "g"), extra: (match) => verhoeffValid(match.replace(/\D/g, "")) },
  { kind: "phone", pattern: new RegExp(`(?<![0-9A-Za-z+])(?:\\+?91[\\s-]?|0)?[6-9]\\d{4}[\\s-]?\\d{5}${E}`, "g") },
  { kind: "ifsc", pattern: new RegExp(`${B}[A-Za-z]{4}0[A-Za-z0-9]{6}${E}`, "g") },
  { kind: "pan", pattern: new RegExp(`${B}[A-Za-z]{3}[PCHFATBLJGpchfatbljg][A-Za-z]\\d{4}[A-Za-z]${E}`, "g") },
  { kind: "date", pattern: /(?<!\d)(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})(?!\d)/g },
  { kind: "date", pattern: new RegExp(`${B}\\d{1,2}[\\s-](?:${MONTHS})[a-z]*[\\s-]\\d{2,4}${E}`, "gi") },
  { kind: "bank_account", pattern: new RegExp(`${B}\\d{9,18}${E}`, "g") },
];

const DATE_FIELDS = new Set(["buyDate"]);
// Free text (chat, note title/body/tags) mentions market dates all the time; a date there can't be
// told apart from a date of birth, so the date detector only runs on structured import fields.
const FREE_TEXT_FIELDS = new Set(["text", "title", "body", "message"]);
const skipDates = (field: string) => DATE_FIELDS.has(field) || FREE_TEXT_FIELDS.has(field) || field.startsWith("tag");

interface Hit {
  kind: PiiKind;
  start: number;
  end: number;
}

function scan(value: string, field: string): Hit[] {
  let text = value;
  const hits: Hit[] = [];
  for (const { kind, pattern, extra } of DETECTORS) {
    if (kind === "date" && skipDates(field)) continue;
    for (const match of [...text.matchAll(pattern)]) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (extra && !extra(match[0])) continue;
      hits.push({ kind, start, end });
      text = text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
    }
  }
  return hits;
}

/** Kinds of personal data found in one text value (deduplicated, detector order). */
export function scanText(value: string, field = "text"): PiiKind[] {
  const kinds: PiiKind[] = [];
  for (const hit of scan(value ?? "", field)) if (!kinds.includes(hit.kind)) kinds.push(hit.kind);
  return kinds;
}

/** Replace every detected value with a placeholder. */
export function maskText(text: string): { masked: string; kinds: PiiKind[] } {
  const hits = scan(text ?? "", "text");
  let masked = text ?? "";
  for (const hit of [...hits].sort((a, b) => b.start - a.start)) masked = masked.slice(0, hit.start) + PLACEHOLDERS[hit.kind] + masked.slice(hit.end);
  const kinds: PiiKind[] = [];
  for (const hit of [...hits].sort((a, b) => a.start - b.start)) if (!kinds.includes(hit.kind)) kinds.push(hit.kind);
  return { masked, kinds };
}

const SENSITIVE_HEADER = [
  /\b(client|user|login)\s*(id|code)\b/,
  /^ucc$/,
  /\b(dp|bo|demat|beneficiary)\s*(id|account|a\/c|ac|no|number)?\b/,
  /\bpan\b/,
  /\baadhaa?r\b/,
  /\b(e-?mail|mobile|phone|contact)\b/,
  /\baddress\b/,
  /\b(date of birth|dob|birth)\b/,
  /\b(bank|account number|a\/c no|ifsc|upi|nominee)\b/,
  /\b(account holder|holder)\b/,
];
const INSTRUMENT_WORDS = /\b(stock|scheme|company|instrument|security|scrip|fund|share|isin|symbol)\b/;

/** True for column headers that hold personal data (they are never mapped or uploaded). */
export function isSensitiveHeader(header: string): boolean {
  const text = header.toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^(full |first |last |client |investor |customer )?name$/.test(text)) return true;
  if (INSTRUMENT_WORDS.test(text) && !/\b(client|holder|investor)\b/.test(text)) return false;
  return SENSITIVE_HEADER.some((pattern) => pattern.test(text));
}
