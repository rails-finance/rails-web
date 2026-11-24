// Morpho Blue's Status as Open / Closed / All (lib/morpho/listing-visibility.ts, ui-jobs 805): the
// contextual default, an old `?status=` list read as the choice, and the lifecycle buckets each
// choice asks the API for. A registered resolver maps `@/` and adds the `.ts`.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..") + "/").href;
const hook = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!existsSync(fileURLToPath(url)) || statSync(fileURLToPath(url)).isDirectory()) {
      for (const ext of [".ts", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { morphoCountLine, defaultStatusChoice, statusChoice, endedByLiquidation, morphoStatusBuckets } = await import(
  ROOT + "lib/morpho/listing-visibility.ts"
);
const { readStatusParam } = await import(ROOT + "lib/shared/status-choice.ts");

const HOLDER = "0xabababababababababababababababababababab";

/** The filter fields after the Status dimension's `set` reads a `?status=` list. */
function fromParam(values, q = "") {
  const read = readStatusParam(values);
  const choice = read.choice ?? defaultStatusChoice({ q });
  return {
    q,
    status: choice === defaultStatusChoice({ q }) ? [] : [choice],
    ended: choice === "closed" && read.endedByLiquidation ? ["liquidated"] : [],
  };
}

test("the bare directory rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(morphoStatusBuckets({ status: [], q: "" }), ["open"]);
});

test("a search naming a holder rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(statusChoice({ status: [], q: HOLDER }), "all");
  assert.equal(morphoStatusBuckets({ status: [], q: HOLDER }), undefined);
});

test("an old ?status=liquidated is Closed with the switch on", () => {
  const f = fromParam(["liquidated"]);
  assert.equal(statusChoice(f), "closed");
  assert.equal(endedByLiquidation(f), true);
  assert.deepEqual(morphoStatusBuckets(f), ["liquidated"]);
});

test("an old list naming every status is All", () => {
  const f = fromParam(["open", "closed", "liquidated"]);
  assert.equal(statusChoice(f), "all");
  assert.equal(morphoStatusBuckets(f), undefined);
});

test("the buckets sent for each choice", () => {
  assert.deepEqual(morphoStatusBuckets({ status: ["open"], q: HOLDER }), ["open"]);
  assert.deepEqual(morphoStatusBuckets({ status: ["closed"] }), ["closed", "liquidated"]);
  assert.deepEqual(morphoStatusBuckets({ status: ["closed"], ended: ["liquidated"] }), ["liquidated"]);
  assert.equal(morphoStatusBuckets({ status: ["all"] }), undefined);
});

test("the switch narrows Closed alone", () => {
  assert.equal(endedByLiquidation({ status: ["all"], ended: ["liquidated"] }), false);
  assert.deepEqual(morphoStatusBuckets({ status: [], ended: ["liquidated"] }), ["open"]);
});

test("the count line names what is shown", () => {
  assert.deepEqual(morphoCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(morphoCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(morphoCountLine({ status: [], q: HOLDER }), { noun: "positions" });
});
