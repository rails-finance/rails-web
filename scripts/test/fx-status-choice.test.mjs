// f(x)'s Status as Open / Closed / All (lib/fx/listing-visibility.ts, ui-jobs 805). The API has
// no row status: `closed` is a facet of the settled sweep and `liquidated` is the ever-liquidated
// fact, OR-joined (rails-server api/src/routes/fx.ts). So Closed sends `closed` alone, there is no
// "Closed by liquidation", and "Liquidated before" stands with All. A registered resolver maps
// `@/` and adds the `.ts`.
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

const { fxCountLine, defaultStatusChoice, statusChoice, liquidatedBefore, readFxStatusParam, fxStatusFacets } =
  await import(ROOT + "lib/fx/listing-visibility.ts");

const HOLDER = "0x" + "ab".repeat(20);

/** The filter fields after the Status dimension's `set` reads a `?status=` list. */
function fromParam(values, q = "") {
  const read = readFxStatusParam(values);
  const choice = read.choice ?? defaultStatusChoice({ q });
  return {
    q,
    status: choice === defaultStatusChoice({ q }) ? [] : [choice],
    liquidations: choice === "all" && read.liquidatedBefore ? ["liquidated"] : [],
  };
}

test("the bare directory rests on Open", () => {
  assert.equal(statusChoice({ status: [], q: "" }), "open");
  assert.deepEqual(fxStatusFacets({ status: [], q: "" }), ["open"]);
});

test("a search naming a holder or a position rests on All", () => {
  assert.equal(defaultStatusChoice({ q: HOLDER }), "all");
  assert.equal(defaultStatusChoice({ q: "1234" }), "all");
  assert.equal(fxStatusFacets({ status: [], q: HOLDER }), undefined);
});

test("an old ?status=liquidated is Liquidated before with All", () => {
  const f = fromParam(["liquidated"]);
  assert.equal(statusChoice(f), "all");
  assert.equal(liquidatedBefore(f), true);
  assert.deepEqual(fxStatusFacets(f), ["liquidated"]);
});

test("an old list with liquidated beside another status is All", () => {
  for (const v of [
    ["open", "liquidated"],
    ["closed", "liquidated"],
    ["open", "closed", "liquidated"],
  ]) {
    const f = fromParam(v);
    assert.equal(statusChoice(f), "all", v.join(","));
    assert.equal(liquidatedBefore(f), false, v.join(","));
    assert.equal(fxStatusFacets(f), undefined, v.join(","));
  }
});

test("the facets sent for each choice", () => {
  assert.deepEqual(fxStatusFacets({ status: ["open"], q: HOLDER }), ["open"]);
  assert.deepEqual(fxStatusFacets({ status: ["closed"] }), ["closed"]);
  assert.equal(fxStatusFacets({ status: ["all"] }), undefined);
  assert.deepEqual(fxStatusFacets({ status: ["all"], liquidations: ["liquidated"] }), ["liquidated"]);
});

test("Liquidated before is in effect with All alone", () => {
  assert.equal(liquidatedBefore({ status: ["closed"], liquidations: ["liquidated"] }), false);
  assert.deepEqual(fxStatusFacets({ status: ["closed"], liquidations: ["liquidated"] }), ["closed"]);
  assert.equal(liquidatedBefore({ status: [], q: HOLDER, liquidations: ["liquidated"] }), true);
});

test("the count line names what is shown", () => {
  assert.deepEqual(fxCountLine({ status: [], q: "" }), { noun: "open positions" });
  assert.deepEqual(fxCountLine({ status: ["closed"] }), { noun: "closed positions" });
  assert.deepEqual(fxCountLine({ status: [], q: HOLDER }), { noun: "positions" });
});
