// Run with: npm run test:client — reads the synthetic fixtures with pdf.js (legacy build for Node).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { groupLines, parseCas, type TextItem } from "../src/lib/casParse.ts";
import { scanText } from "../src/lib/pii.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/cas/${name}.pdf`, import.meta.url)));
const HEADER_VALUES = ["Asha", "ABCPE1234F", "Kothrud", "investor.one@example.com", "9876543210", "1208160012345678", "12345678", "IN300999", "9123456"];

async function linesOf(name: string, password?: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: fixture(name), password, useWasm: false, verbosity: 0 }).promise;
  const items: TextItem[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (item.str != null && item.transform) items.push({ str: item.str, x: item.transform[4], y: item.transform[5] - number * 10_000 });
    }
  }
  return groupLines(items);
}

const EXPECTED: Record<string, { layout: string; rows: Array<[string, number, number | null]>; total: number }> = {
  nsdl: { layout: "cas_nsdl", rows: [["INE002A01018", 40, null], ["INE467B01029", 20, null], ["INE040A01034", 50, null], ["INF204KB17I5", 300, null]], total: 161458 },
  cdsl: { layout: "cas_cdsl", rows: [["INE009A01021", 30, null], ["INE154A01025", 100, null]], total: 71040 },
  cams: { layout: "cams", rows: [["INF846K01WO1", 502, 26.1355]], total: 14558.05 },
  kfintech: { layout: "kfintech", rows: [["INF846K01WJ1", 120.5, 20]], total: 3042.02 },
};

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`${name}: holdings, totals, and nothing from the header`, async () => {
    const result = parseCas(await linesOf(name));
    assert.equal(result.layout, expected.layout);
    assert.deepEqual(result.rows.map((row) => [row.isin, row.quantity, row.avgCost]), expected.rows);
    assert.equal(result.statementTotal, expected.total);
    assert.equal(result.totalsMatch, true, `parsed ${result.parsedTotal} vs statement ${result.statementTotal}`);
    const serialized = JSON.stringify(result.rows);
    for (const value of HEADER_VALUES) assert.ok(!serialized.includes(value), value);
    for (const row of result.rows) assert.deepEqual(scanText(row.isin, "isin"), []);
  });
}

test("a locked statement needs the right password", async () => {
  await assert.rejects(linesOf("nsdl-locked"), (error: { name?: string }) => error.name === "PasswordException");
  await assert.rejects(linesOf("nsdl-locked", "wrong-password"), (error: { name?: string }) => error.name === "PasswordException");
  const result = parseCas(await linesOf("nsdl-locked", "TESTPASS01"));
  assert.equal(result.rows.length, 4);
});
