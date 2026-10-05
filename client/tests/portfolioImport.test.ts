// Run with: npm run test:client
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../src/lib/csv.ts";
import { isSensitiveHeader, scanText } from "../src/lib/pii.ts";
import { autoMap, buildRows, findHeaderRow, parseDate, parseNumber, rowProblems, toPayloadRows } from "../src/lib/portfolioImport.ts";

const BROKER_EXPORT = [
  "Holdings statement",
  "Client Name,Asha Example",
  "Client ID,AB1234",
  "",
  'Symbol,ISIN,Client ID,Quantity Available,"Average Price",PAN,LTP',
  'RELIANCE,INE002A01018,AB1234,10,"2,450.50",ABCPE1234F,2900',
  "TCS,INE467B01029,AB1234,5,3100,ABCPE1234F,4000",
  "Total,,,,,,",
].join("\r\n");

test("CSV parser handles quotes, CRLF and embedded commas", () => {
  const rows = parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n');
  assert.deepEqual(rows, [["a", "b,c", 'd "q"'], ["1", "2", "3"]]);
});

test("header row is found below title lines and personal columns are never mapped", () => {
  const rows = parseCsv(BROKER_EXPORT);
  const headerIndex = findHeaderRow(rows);
  assert.equal(rows[headerIndex][0], "Symbol");
  const mapping = autoMap(rows[headerIndex], isSensitiveHeader);
  assert.deepEqual(mapping, ["symbol", "isin", null, "quantity", "avgCost", null, null]);
  const drafts = buildRows(rows, headerIndex, mapping);
  assert.equal(drafts.length, 2); // totals line skipped
  const payload = JSON.stringify(toPayloadRows(drafts));
  for (const leaked of ["AB1234", "ABCPE1234F", "Asha", "2900"]) assert.ok(!payload.includes(leaked), leaked);
  assert.deepEqual(toPayloadRows(drafts)[0], { symbol: "RELIANCE", isin: "INE002A01018", quantity: 10, avgCost: 2450.5, assetType: "equity" });
});

test("numbers and day-first dates normalise; bad values stay visible for fixing", () => {
  assert.equal(parseNumber("₹ 1,234.50"), "1234.5");
  assert.equal(parseDate("15/03/2024"), "2024-03-15");
  assert.equal(parseDate("15-Mar-2024"), "2024-03-15");
  assert.equal(parseDate("2024-3-5"), "2024-03-05");
  assert.equal(parseDate("someday"), "someday");
});

test("row checks mirror the server schema", () => {
  const ok = { key: "k", symbol: "TCS.NS", isin: "", quantity: "5", avgCost: "", buyDate: "", assetType: "equity" };
  assert.deepEqual(rowProblems(ok), {});
  const bad = { key: "k", symbol: "", isin: "INE1", quantity: "0", avgCost: "-1", buyDate: "2999-01-01", assetType: "crypto" };
  assert.deepEqual(Object.keys(rowProblems(bad, "2026-10-05")).sort(), ["assetType", "avgCost", "buyDate", "isin", "quantity"]);
  assert.deepEqual(scanText("2024-03-15", "buyDate"), []);
});
