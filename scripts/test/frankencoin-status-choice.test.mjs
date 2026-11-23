// Frankencoin's Status as Open / Closed / All (lib/frankencoin/listing-visibility.ts,
// ui-jobs 805): the contextual default, an old `?status=` list read as the
// choice and the Denied switch, and the buckets each choice asks the API for.
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

const {
  defaultStatusChoice,
  statusChoice,
  endedDenied,
  readFrankencoinStatusParam,
  frankencoinStatusBuckets,
  frankencoinCountLine,
} = await import("../../lib/frankencoin/listing-visibility.ts");

const OWNER = "0x" + "cd".repeat(20);

test("the bare directory rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(frankencoinStatusBuckets({ status: [], q: "" }), ["open"]);
});

test("a search naming an owner rests on All", () => {
  assert.equal(defaultStatusChoice({ q: OWNER }), "all");
  assert.equal(frankencoinStatusBuckets({ status: [], q: OWNER }), undefined);
});

test("an old ?status=denied reads as Closed with Denied on", () => {
  assert.deepEqual(readFrankencoinStatusParam(["denied"]), { choice: "closed", denied: true });
  assert.equal(statusChoice({ status: ["denied"], q: "" }), "closed");
  assert.deepEqual(frankencoinStatusBuckets({ status: ["closed"], ended: ["denied"] }), ["denied"]);
});

test("an old list with open and an ended status reads as All", () => {
  assert.deepEqual(readFrankencoinStatusParam(["open", "closed"]), { choice: "all", denied: false });
  assert.deepEqual(readFrankencoinStatusParam(["open", "denied"]), { choice: "all", denied: false });
  assert.deepEqual(readFrankencoinStatusParam(["open", "closed", "denied"]), { choice: "all", denied: false });
});

test("an old list of closed reads as Closed, with or without denied", () => {
  assert.deepEqual(readFrankencoinStatusParam(["closed"]), { choice: "closed", denied: false });
  assert.deepEqual(readFrankencoinStatusParam(["closed", "denied"]), { choice: "closed", denied: false });
});

test("an unknown token names no status", () => {
  assert.deepEqual(readFrankencoinStatusParam(["expired"]), { choice: null, denied: false });
  assert.equal(statusChoice({ status: ["expired"], q: "" }), "open");
});

test("each choice asks for its buckets", () => {
  assert.deepEqual(frankencoinStatusBuckets({ status: ["open"] }), ["open"]);
  assert.deepEqual(frankencoinStatusBuckets({ status: ["closed"] }), ["closed", "denied"]);
  assert.deepEqual(frankencoinStatusBuckets({ status: ["closed"], ended: ["denied"] }), ["denied"]);
  assert.equal(frankencoinStatusBuckets({ status: ["all"] }), undefined);
});

test("Denied applies with Closed alone", () => {
  assert.equal(endedDenied({ status: ["closed"], ended: ["denied"] }), true);
  assert.equal(endedDenied({ status: ["open"], ended: ["denied"] }), false);
  assert.equal(endedDenied({ status: ["all"], ended: ["denied"] }), false);
});

test("the count line names the choice", () => {
  assert.deepEqual(frankencoinCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(frankencoinCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(frankencoinCountLine({ status: [], q: OWNER }), { noun: "positions" });
});
