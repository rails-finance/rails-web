// Liquity V1's Trove Status as Open / Closed / All (lib/liquity-v1/listing-visibility.ts,
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

const { defaultStatusChoice, statusChoice, endedByLiquidation, liquityV1StatusBuckets, liquityV1CountLine } =
  await import("../../lib/liquity-v1/listing-visibility.ts");

const { readStatusParam } = await import("../../lib/shared/status-choice.ts");

const WALLET = "0x" + "ab".repeat(20);

test("the bare listing rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(liquityV1StatusBuckets({ status: [], q: "" }), ["open"]);
});

test("a search naming a wallet rests on All", () => {
  assert.equal(defaultStatusChoice({ q: ` ${WALLET} ` }), "all");
  assert.equal(liquityV1StatusBuckets({ status: [], q: WALLET }), undefined);
  assert.equal(defaultStatusChoice({ q: "0xab" }), "open");
});

test("the system view's queue link lands on Open", () => {
  assert.equal(statusChoice({ status: ["open"], q: "" }), "open");
  assert.deepEqual(liquityV1StatusBuckets({ status: ["open"], q: "" }), ["open"]);
});

test("an old ?status=liquidated reads as Closed with the switch on", () => {
  assert.equal(statusChoice({ status: ["liquidated"], q: "" }), "closed");
  assert.equal(readStatusParam(["liquidated"]).endedByLiquidation, true);
  assert.deepEqual(liquityV1StatusBuckets({ status: ["closed"], ended: ["liquidated"], q: "" }), ["liquidated"]);
});

test("an old list with open and an ended status reads as All", () => {
  assert.equal(statusChoice({ status: ["open", "closed", "liquidated"], q: "" }), "all");
  assert.equal(statusChoice({ status: ["open", "liquidated"], q: "" }), "all");
});

test("each choice asks for its buckets", () => {
  assert.deepEqual(liquityV1StatusBuckets({ status: ["open"] }), ["open"]);
  assert.deepEqual(liquityV1StatusBuckets({ status: ["closed"] }), ["closed", "liquidated"]);
  assert.deepEqual(liquityV1StatusBuckets({ status: ["closed"], ended: ["liquidated"] }), ["liquidated"]);
  assert.equal(liquityV1StatusBuckets({ status: ["all"] }), undefined);
});

test("Closed by liquidation applies with Closed alone", () => {
  assert.equal(endedByLiquidation({ status: ["closed"], ended: ["liquidated"] }), true);
  assert.equal(endedByLiquidation({ status: ["open"], ended: ["liquidated"] }), false);
  assert.equal(endedByLiquidation({ status: ["all"], ended: ["liquidated"] }), false);
});

test("the count line names the choice", () => {
  assert.deepEqual(liquityV1CountLine({ status: [], q: "" }), { noun: "open Troves" });
  assert.deepEqual(liquityV1CountLine({ status: ["closed"] }), { noun: "closed Troves" });
  assert.deepEqual(liquityV1CountLine({ status: [], q: WALLET }), { noun: "Troves" });
});
