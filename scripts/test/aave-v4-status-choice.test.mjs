// Aave V4's Status as Open / Closed / All (lib/aave-v4/listing-visibility.ts,
// ui-jobs 805): the contextual default, an old `?status=` list read as the
// choice, and the statuses each choice asks the API for.
// Run: npm test
//
// The module imports its siblings by extensionless relative specifier, so this
// file registers a resolver that adds the `.ts`.
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

const { defaultStatusChoice, statusChoice, endedByLiquidation, aaveV4StatusBuckets, aaveV4CountLine } = await import(
  "../../lib/aave-v4/listing-visibility.ts"
);

const { readStatusParam } = await import("../../lib/shared/status-choice.ts");

const HOLDER = "0x" + "ab".repeat(20);

test("the bare directory rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ statuses: [], q: "" }), "open");
  assert.deepEqual(aaveV4StatusBuckets({ statuses: [], q: "" }), ["open"]);
});

test("a search naming a holder rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(statusChoice({ statuses: [], q: HOLDER }), "all");
  assert.deepEqual(aaveV4StatusBuckets({ statuses: [], q: HOLDER }), ["open", "closed", "liquidated"]);
});

test("an ENS name rests on All", () => {
  assert.equal(defaultStatusChoice({ q: "vitalik.eth" }), "all");
});

test("an explicit choice wins over the resting one", () => {
  assert.equal(statusChoice({ statuses: ["open"], q: HOLDER }), "open");
  assert.equal(statusChoice({ statuses: ["all"], q: "" }), "all");
});

test("old links read as the choice: one token is that choice, both are All", () => {
  assert.equal(statusChoice({ statuses: ["closed"], q: "" }), "closed");
  assert.equal(statusChoice({ statuses: ["open", "closed"], q: "" }), "all");
  assert.equal(statusChoice({ statuses: ["liquidated"], q: "" }), "closed");
  assert.equal(statusChoice({ statuses: ["bogus"], q: "" }), "open");
});

test("each choice asks for its statuses", () => {
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["open"] }), ["open"]);
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["closed"] }), ["closed", "liquidated"]);
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["all"] }), ["open", "closed", "liquidated"]);
});

test("the count line names the choice", () => {
  assert.deepEqual(aaveV4CountLine({ statuses: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(aaveV4CountLine({ statuses: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(aaveV4CountLine({ statuses: [], q: HOLDER }), { noun: "positions" });
});

test("an old ?status=liquidated reads as Closed with the switch on", () => {
  assert.equal(statusChoice({ statuses: ["liquidated"], q: "" }), "closed");
  assert.equal(readStatusParam(["liquidated"]).endedByLiquidation, true);
});

test("Closed by liquidation narrows Closed to the liquidated wire status", () => {
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["closed"], ended: ["liquidated"] }), ["liquidated"]);
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["closed"], ended: [] }), ["closed", "liquidated"]);
});

test("Closed by liquidation applies with Closed alone", () => {
  assert.equal(endedByLiquidation({ statuses: ["closed"], ended: ["liquidated"] }), true);
  assert.equal(endedByLiquidation({ statuses: ["open"], ended: ["liquidated"] }), false);
  assert.equal(endedByLiquidation({ statuses: ["all"], ended: ["liquidated"] }), false);
  assert.deepEqual(aaveV4StatusBuckets({ statuses: ["all"], ended: ["liquidated"] }), ["open", "closed", "liquidated"]);
});
