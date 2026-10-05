// Run with: node --test client/tests  (Node >= 22.18 strips TypeScript types natively)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildIndex, findSymbol, searchSymbols, type CatalogFile } from "../src/lib/symbolSearch.ts";

const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("shared/symbols.json", root), "utf8")) as CatalogFile;
const cases = JSON.parse(readFileSync(new URL("shared/symbol-search-cases.json", root), "utf8")) as {
  top1: [string, string][];
  top3: [string, string][];
  none: string[];
};
const index = buildIndex(catalog);

test("company names, tickers, aliases and acronyms rank the intended listing first", () => {
  const failures = cases.top1
    .map(([query, expected]) => [query, expected, searchSymbols(index, query, 3).map((match) => match.entry.symbol)] as const)
    .filter(([, expected, got]) => got[0] !== expected);
  assert.deepEqual(failures, []);
});

test("secondary listings appear in the top three", () => {
  for (const [query, expected] of cases.top3) {
    const got = searchSymbols(index, query, 3).map((match) => match.entry.symbol);
    assert.ok(got.includes(expected), `${query} -> ${got.join(", ")} (wanted ${expected})`);
  }
});

test("gibberish returns nothing", () => {
  for (const query of cases.none) assert.deepEqual(searchSymbols(index, query), [], query);
});

test("ranking is deterministic and exact lookup works", () => {
  assert.deepEqual(searchSymbols(index, "bank"), searchSymbols(index, "bank"));
  assert.equal(findSymbol(index, "reliance.ns")?.isin, "INE002A01018");
});

test("search stays inside the per-keystroke budget", () => {
  const started = performance.now();
  const queries = ["r", "re", "rel", "reli", "relia", "tata c", "hdfc b", "goog", "m&m", "infosys ltd"];
  for (let round = 0; round < 5; round++) for (const query of queries) searchSymbols(index, query);
  const perQuery = (performance.now() - started) / (queries.length * 5);
  assert.ok(perQuery < 5, `average ${perQuery.toFixed(2)} ms per query`);
});
