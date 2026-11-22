// The Liquity V2 deposit listing and its forks': Status as Open / Closed / All
// (lib/liquity-v2/sp-visibility.ts, ui-jobs 805). The resting choice, an old
// `?status=` list read as the choice, and the status each choice sends.
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

const { defaultStatusChoice, statusChoice, statusParam, spCountLine } = await import(
  ROOT + "lib/liquity-v2/sp-visibility.ts"
);
const { readStatusParam } = await import(ROOT + "lib/shared/status-choice.ts");

const HOLDER = "0xabababababababababababababababababababab";

/** The filter's status after the Status dimension's `set` reads a `?status=` list. */
const set = (f, v) => {
  const choice = readStatusParam(v).choice ?? defaultStatusChoice(f);
  return { ...f, status: choice === defaultStatusChoice(f) ? [] : [choice] };
};

test("the bare listing rests on Open", () => {
  assert.equal(defaultStatusChoice({ q: "" }), "open");
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.equal(statusParam({ status: [], q: "" }), "open");
});

test("a search naming a depositor rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(statusParam({ status: [], q: HOLDER }), undefined);
  assert.equal(defaultStatusChoice({ q: "vitalik.eth" }), "all");
});

test("an explicit choice wins over the resting one", () => {
  assert.equal(statusChoice({ status: ["open"], q: HOLDER }), "open");
  assert.equal(statusChoice({ status: ["all"], q: "" }), "all");
});

test("old ?status= links read as the choice", () => {
  assert.deepEqual(set({ status: [], q: "" }, ["closed"]).status, ["closed"]);
  assert.deepEqual(set({ status: [], q: "" }, ["open"]).status, []);
  // Both tokens together are All.
  assert.deepEqual(set({ status: [], q: "" }, ["open", "closed"]).status, ["all"]);
  assert.deepEqual(set({ status: [], q: HOLDER }, ["open", "closed"]).status, []);
  assert.equal(statusChoice({ status: ["open", "closed"], q: "" }), "all");
});

test("each choice sends its status", () => {
  assert.equal(statusParam({ status: ["open"] }), "open");
  assert.equal(statusParam({ status: ["closed"] }), "closed");
  assert.equal(statusParam({ status: ["all"] }), undefined);
});

test("the count line names the choice", () => {
  assert.deepEqual(spCountLine({ status: [], q: "" }), { noun: "open deposits" });
  assert.deepEqual(spCountLine({ status: ["closed"] }), { noun: "closed deposits" });
  assert.deepEqual(spCountLine({ status: [], q: HOLDER }), { noun: "deposits" });
});
