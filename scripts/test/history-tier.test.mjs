// lib/shared/history-tier.ts: the history tag's words per kind (rails-ops
// decisions 0061 and 0063) and the start date as the tag writes it.
// Run: npm test
//
// The module imports lib/date by extensionless relative specifier, so this
// file registers a resolver that adds the `.ts` before loading it.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { HISTORY_NONE, HISTORY_FROM_DATE, historyDate, historyWords } = await import("../../lib/shared/history-tier.ts");

test("none keeps decision 0061's words", () => {
  assert.deepEqual(historyWords("none"), {
    name: "Read on visit",
    line: "Figures are read from the chain when you open the page.",
  });
  assert.equal(HISTORY_NONE.waits, "History, listings and holder counts arrive when Rails indexes this protocol.");
});

test("from-date names the start date and no block", () => {
  // 4 Dec 2024 08:58:47 UTC.
  const date = historyDate(1_733_302_727);
  assert.equal(date, "4 Dec 2024");
  const w = historyWords("from-date", date);
  assert.equal(w.name, "History from 4 Dec 2024");
  assert.equal(w.line, "Rails records this protocol from 4 Dec 2024.");
  assert.doesNotMatch(w.name + w.line, /block|\d{5,}/i);
});

test("the date is the UTC day", () => {
  // 23:30 UTC on 30 Sep 2026 is 1 Oct in Berlin; the tag writes 30 Sep.
  assert.equal(historyDate(Date.UTC(2026, 8, 30, 23, 30) / 1000), "30 Sep 2026");
});

test("with no time read, the tag names no date", () => {
  for (const t of [null, undefined, 0, -1, Number.NaN]) assert.equal(historyDate(t), null);
  const w = historyWords("from-date", null);
  assert.equal(w.name, "History from a start date");
  assert.equal(w.line, "Rails records this protocol from a date after it launched.");
  assert.doesNotMatch(w.name + w.line, /undefined|null|NaN/);
  assert.equal(HISTORY_FROM_DATE.name(null), w.name);
});
