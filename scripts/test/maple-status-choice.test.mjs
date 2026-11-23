// Maple's Status as Open / Closed / All (lib/maple/listing-visibility.ts,
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

const { defaultStatusChoice, statusChoice, mapleStatusBuckets, mapleCountLine } = await import(
  "../../lib/maple/listing-visibility.ts"
);

const HOLDER = "0x" + "ab".repeat(20);

test("the bare directory rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(mapleStatusBuckets({ status: [], q: "" }), ["open"]);
});

test("a search naming a holder rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(statusChoice({ status: [], q: HOLDER }), "all");
  assert.equal(mapleStatusBuckets({ status: [], q: HOLDER }), undefined);
});

test("an explicit choice wins over the resting one", () => {
  assert.equal(statusChoice({ status: ["open"], q: HOLDER }), "open");
  assert.equal(statusChoice({ status: ["all"], q: "" }), "all");
});

test("old links read as the choice: one token is that choice, both are All", () => {
  assert.equal(statusChoice({ status: ["closed"], q: "" }), "closed");
  assert.equal(statusChoice({ status: ["open", "closed"], q: "" }), "all");
  assert.equal(statusChoice({ status: ["liquidated"], q: "" }), "closed");
  assert.equal(statusChoice({ status: ["bogus"], q: "" }), "open");
});

test("each choice asks for its statuses", () => {
  assert.deepEqual(mapleStatusBuckets({ status: ["open"] }), ["open"]);
  assert.deepEqual(mapleStatusBuckets({ status: ["closed"] }), ["closed"]);
  assert.equal(mapleStatusBuckets({ status: ["all"] }), undefined);
});

test("the count line names the choice", () => {
  assert.deepEqual(mapleCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(mapleCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(mapleCountLine({ status: [], q: HOLDER }), { noun: "positions" });
});
