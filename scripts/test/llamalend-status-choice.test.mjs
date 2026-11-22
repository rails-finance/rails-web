// LlamaLend's Status as Open / Closed / All (lib/llamalend/listing-visibility.ts,
// ui-jobs 805): the contextual default, an old `?status=` list read as the
// choice, and the lifecycle buckets each choice asks the API for.
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

const { defaultStatusChoice, statusChoice, endedByLiquidation, llamalendStatusBuckets, llamalendCountLine } =
  await import("../../lib/llamalend/listing-visibility.ts");

const { readStatusParam } = await import("../../lib/shared/status-choice.ts");

const HOLDER = "0x" + "ab".repeat(20);

test("the bare directory rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(llamalendStatusBuckets({ status: [], q: "" }), ["open"]);
});

test("a search naming a holder rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(statusChoice({ status: [], q: HOLDER }), "all");
  assert.equal(llamalendStatusBuckets({ status: [], q: HOLDER }), undefined);
});

test("an explicit choice wins over the resting one", () => {
  assert.equal(statusChoice({ status: ["open"], q: HOLDER }), "open");
  assert.equal(statusChoice({ status: ["all"], q: "" }), "all");
});

test("an old ?status=liquidated reads as Closed with the switch on", () => {
  assert.equal(statusChoice({ status: ["liquidated"], q: "" }), "closed");
  // The Status dimension's set writes the switch from the old list.
  assert.equal(readStatusParam(["liquidated"]).endedByLiquidation, true);
  assert.deepEqual(llamalendStatusBuckets({ status: ["closed"], ended: ["liquidated"], q: "" }), ["liquidated"]);
});

test("an old list of every status reads as All", () => {
  assert.equal(statusChoice({ status: ["open", "closed", "liquidated"], q: "" }), "all");
});

test("each choice asks for its buckets", () => {
  assert.deepEqual(llamalendStatusBuckets({ status: ["open"] }), ["open"]);
  assert.deepEqual(llamalendStatusBuckets({ status: ["closed"] }), ["closed", "liquidated"]);
  assert.deepEqual(llamalendStatusBuckets({ status: ["closed"], ended: ["liquidated"] }), ["liquidated"]);
  assert.equal(llamalendStatusBuckets({ status: ["all"] }), undefined);
});

test("Closed by liquidation applies with Closed alone", () => {
  assert.equal(endedByLiquidation({ status: ["closed"], ended: ["liquidated"] }), true);
  assert.equal(endedByLiquidation({ status: ["open"], ended: ["liquidated"] }), false);
  assert.equal(endedByLiquidation({ status: ["all"], ended: ["liquidated"] }), false);
});

test("the count line names the choice", () => {
  assert.deepEqual(llamalendCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(llamalendCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(llamalendCountLine({ status: [], q: HOLDER }), { noun: "positions" });
});
