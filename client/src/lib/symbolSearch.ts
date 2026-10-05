// Offline symbol search over shared/symbols.json. Pure and dependency-free (no imports) so the
// Node test runner can load it directly. Build the index once, then search on every keystroke.

export interface CatalogFile {
  version: number;
  generatedAt: string;
  fields: string[];
  rows: unknown[][];
}

export interface SymbolEntry {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  isin: string | null;
  tier: number;
  sector: string | null;
  aliases: string[];
}

interface Indexed {
  entry: SymbolEntry;
  symbolKey: string; // without exchange suffix / caret, alphanumerics only
  symbolFull: string; // whole symbol, alphanumerics only
  tokens: string[]; // name tokens without noise words
  joined: string;
  acronym: string;
  aliases: string[];
  aliasKeys: string[];
}

export interface SymbolIndex {
  generatedAt: string;
  size: number;
  items: Indexed[];
}

export type MatchKind = "symbol" | "alias" | "name" | "acronym" | "fuzzy";

export interface SymbolMatch {
  entry: SymbolEntry;
  score: number;
  kind: MatchKind;
}

const NOISE = new Set(["ltd", "limited", "inc", "incorporated", "corp", "corporation", "the", "co", "plc", "company", "and", "of", "pvt", "private"]);
const SUFFIXES = new Set(["ns", "bo", "l"]);

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const compact = (text: string) =>
  normalize(text)
    .split(" ")
    .filter((token) => token && token !== "and")
    .join("");

function tokensOf(text: string): string[] {
  const all = normalize(text).split(" ").filter(Boolean);
  const meaningful = all.filter((token) => !NOISE.has(token));
  return meaningful.length ? meaningful : all;
}

function symbolKey(symbol: string): string {
  const parts = symbol.toLowerCase().replace(/^\^/, "").split(".");
  if (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join("").replace(/[^a-z0-9]/g, "");
}

export function buildIndex(catalog: CatalogFile): SymbolIndex {
  const position = (name: string) => catalog.fields.indexOf(name);
  const [s, n, x, t, i, k, c, a] = ["s", "n", "x", "t", "i", "k", "c", "a"].map(position);
  const items: Indexed[] = catalog.rows.map((row) => {
    const entry: SymbolEntry = {
      symbol: String(row[s]),
      name: String(row[n]),
      exchange: String(row[x]),
      type: String(row[t]),
      isin: (row[i] as string | null) ?? null,
      tier: Number(row[k] ?? 0),
      sector: (row[c] as string | null) ?? null,
      aliases: (row[a] as string[] | undefined) ?? [],
    };
    const tokens = tokensOf(entry.name);
    const aliases = entry.aliases.map((alias) => tokensOf(alias).join(" "));
    return {
      entry,
      symbolKey: symbolKey(entry.symbol),
      symbolFull: entry.symbol.toLowerCase().replace(/[^a-z0-9]/g, ""),
      tokens,
      joined: tokens.join(" "),
      acronym: tokens.map((token) => token[0]).join(""),
      aliases,
      aliasKeys: entry.aliases.map(compact),
    };
  });
  return { generatedAt: catalog.generatedAt, size: items.length, items };
}

/** True when two strings are within one edit (insert, delete, substitute, or adjacent swap). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // deletion / insertion
}

function fuzzyMatch(qTokens: string[], tokens: string[]): boolean {
  return qTokens.every((q) =>
    tokens.some((token) => token.startsWith(q) || (q.length >= 4 && token[0] === q[0] && (withinOneEdit(q, token) || withinOneEdit(q, token.slice(0, q.length))))),
  );
}

function tokensPrefixMatch(query: string[], tokens: string[]): { all: boolean; inOrder: boolean } {
  const used = new Set<number>();
  let inOrder = true;
  let last = -1;
  for (const q of query) {
    let found = -1;
    for (let index = 0; index < tokens.length; index++) {
      if (!used.has(index) && tokens[index].startsWith(q)) {
        found = index;
        break;
      }
    }
    if (found < 0) return { all: false, inOrder: false };
    used.add(found);
    if (found < last) inOrder = false;
    last = found;
  }
  return { all: true, inOrder };
}

function baseScore(item: Indexed, qTokens: string[], qJoined: string, qCompact: string, raw: string): [number, MatchKind] | null {
  if (!qCompact) return null;
  if (item.symbolKey === qCompact || item.symbolFull === raw) return [1000, "symbol"];
  if (item.aliasKeys.includes(qCompact) || item.aliases.includes(qJoined)) return [950, "alias"];
  if (item.symbolKey.startsWith(qCompact) || item.symbolFull.startsWith(raw)) return [800 - Math.min(80, (item.symbolKey.length - qCompact.length) * 8), "symbol"];
  if (item.aliases.some((alias) => alias.startsWith(qJoined))) return [720, "alias"];
  if (item.joined.startsWith(qJoined)) return [680, "name"];
  const tokenMatch = tokensPrefixMatch(qTokens, item.tokens);
  if (tokenMatch.all) return [tokenMatch.inOrder ? 620 : 590, "name"];
  if (qCompact.length >= 2 && item.acronym === qCompact) return [560, "acronym"];
  if (qCompact.length >= 3 && item.acronym.startsWith(qCompact)) return [460, "acronym"];
  if (qJoined.length >= 3 && item.joined.includes(qJoined)) return [320, "name"];
  return null;
}

/** Best matches for a free-text query (company name, ticker, alias, or acronym), best first. */
export function searchSymbols(index: SymbolIndex, query: string, limit = 8): SymbolMatch[] {
  const qJoined = tokensOf(query).join(" ");
  const qTokens = qJoined.split(" ").filter(Boolean);
  const qCompact = compact(query);
  const raw = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!qTokens.length && !qCompact) return [];
  const scored: SymbolMatch[] = [];
  const bonus = (entry: SymbolEntry) =>
    entry.tier * 30 + (entry.type === "INDEX" ? 8 : entry.type === "EQ" ? 5 : 0) + (entry.exchange === "NSE" ? 3 : 0) - Math.min(10, entry.name.length / 10);
  for (const item of index.items) {
    const base = baseScore(item, qTokens, qJoined, qCompact, raw);
    if (base) scored.push({ entry: item.entry, score: base[0] + bonus(item.entry), kind: base[1] });
  }
  // One-typo tolerance only when the exact passes come up short (keeps typing fast).
  if (scored.length < limit && qJoined.length >= 5) {
    const seen = new Set(scored.map((match) => match.entry.symbol));
    for (const item of index.items) {
      if (!seen.has(item.entry.symbol) && fuzzyMatch(qTokens, item.tokens)) scored.push({ entry: item.entry, score: 200 + bonus(item.entry), kind: "fuzzy" });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.entry.symbol.localeCompare(b.entry.symbol));
  return scored.slice(0, limit);
}

/** Exact lookup by ticker (case-insensitive). */
export function findSymbol(index: SymbolIndex, symbol: string): SymbolEntry | null {
  const upper = symbol.trim().toUpperCase();
  return index.items.find((item) => item.entry.symbol === upper)?.entry ?? null;
}
