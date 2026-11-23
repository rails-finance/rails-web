// Sky Savings's Status as Open / Closed / All (lib/sky-savings/listing-visibility.ts,
// ui-jobs 805): the contextual default, an old `?status=` list read as the
// choice, and the `status` value each choice sends.
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

const { defaultStatusChoice, statusChoice, parseSkySearch, skyCountLine } = await import(
  "../../lib/sky-savings/listing-visibility.ts"
);

const HOLDER = "0x" + "ab".repeat(20);

test("the bare directory rests on Open, and sends it", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
});

test("a search naming a wallet rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(defaultStatusChoice({ q: "someone.eth" }), "all");
  assert.equal(statusChoice({ status: [], q: HOLDER }), "all");
  assert.equal(defaultStatusChoice({ q: "not a wallet" }), "open");
});

test("an explicit choice wins over the resting one", () => {
  assert.equal(statusChoice({ status: ["open"], q: HOLDER }), "open");
  assert.equal(statusChoice({ status: ["all"], q: "" }), "all");
});

test("old links read as the choice: one token is that choice, both are All", () => {
  assert.equal(statusChoice({ status: ["closed"], q: "" }), "closed");
  assert.equal(statusChoice({ status: ["open", "closed"], q: "" }), "all");
  assert.equal(statusChoice({ status: ["liquidated"], q: "" }), "closed");
});

test("the search parser names an address or an ENS name", () => {
  assert.deepEqual(parseSkySearch(HOLDER.toUpperCase().replace("0X", "0x")), { address: HOLDER });
  assert.deepEqual(parseSkySearch("someone.eth"), { ens: "someone.eth" });
  assert.deepEqual(parseSkySearch("hello"), {});
});

test("the count line names the choice", () => {
  assert.deepEqual(skyCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(skyCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(skyCountLine({ status: [], q: HOLDER }), { noun: "positions" });
});
