// Run with: npm run test:client — the same vectors as backend/tests/test_pii.py.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KIND_LABELS, isSensitiveHeader, maskText, scanText } from "../src/lib/pii.ts";

const vectors = JSON.parse(readFileSync(new URL("../../shared/pii-vectors.json", import.meta.url), "utf8")) as {
  cases: Array<{ id: string; field: string; value: string; kinds: string[] }>;
  headers: Array<{ header: string; sensitive: boolean }>;
};

test("detectors match the shared vectors exactly", () => {
  const failures = vectors.cases
    .map((item) => ({ id: item.id, got: [...scanText(item.value, item.field)].sort(), want: [...item.kinds].sort() }))
    .filter((item) => JSON.stringify(item.got) !== JSON.stringify(item.want));
  assert.deepEqual(failures, []);
});

test("every kind has a positive vector", () => {
  const covered = new Set(vectors.cases.flatMap((item) => item.kinds));
  assert.deepEqual([...covered].sort(), Object.keys(KIND_LABELS).sort());
});

test("sensitive column headers are recognised and instrument columns are not", () => {
  const failures = vectors.headers.filter((item) => isSensitiveHeader(item.header) !== item.sensitive).map((item) => item.header);
  assert.deepEqual(failures, []);
});

test("masking matches the server's placeholders", () => {
  const { masked, kinds } = maskText("My PAN is ABCPE1234F, call 9876543210 or mail investor.one@example.com about RELIANCE.NS");
  assert.ok(!masked.includes("ABCPE1234F") && !masked.includes("9876543210") && !masked.includes("investor.one@example.com"));
  assert.ok(masked.includes("[PAN removed]") && masked.includes("RELIANCE.NS"));
  assert.deepEqual(kinds, ["pan", "phone", "email"]);
});
