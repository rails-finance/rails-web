// /start's "liquidated" results (lib/start/liquidated-link.ts, ui-jobs 805): once Status is
// Open / Closed / All, a listing with "Closed by liquidation" is linked as
// `status=closed&ended=liquidated`, and one with "Liquidated before" as that switch with All.
// The dimensions below are the parts of each family's filter registry the link reads
// (lib/<family>/list-filter-dimensions.tsx, which is TSX and not imported here).
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

import { readFileSync } from "node:fs";

const { liquidatedLink } = await import(ROOT + "lib/start/liquidated-link.ts");
const { STATUS_CHOICE_OPTIONS, ENDED_BY_LIQUIDATION } = await import(ROOT + "lib/shared/status-choice.ts");

const tree = JSON.parse(readFileSync(new URL("lib/start/start-tree.json", ROOT), "utf8"));
const spec = tree.results.liquidated;

const status = { param: "status", options: STATUS_CHOICE_OPTIONS };
const ended = { param: "ended", options: [{ value: ENDED_BY_LIQUIDATION }] };
const liq = { param: "liq", options: [{ value: "liquidated" }] };

const DIMS = {
  morpho: [status, ended],
  makerdao: [status, ended],
  polaris: [status, ended],
  "morpho-base": [status, ended, liq],
  fx: [status, liq],
};

test("the tree names the Closed by liquidation entry", () => {
  assert.deepEqual(spec.ended, { status: "closed", param: "ended", value: "liquidated" });
  assert.ok(spec.history.some((h) => h.param === "liq" && h.value === "liquidated"));
});

test("morpho, makerdao and polaris link Closed with the switch on", () => {
  for (const fam of ["morpho", "makerdao", "polaris"]) {
    assert.deepEqual(
      liquidatedLink(DIMS[fam], spec),
      { params: { status: "closed", ended: "liquidated" }, source: "the listing's status filter" },
      fam,
    );
  }
});

test("fx links Liquidated before with All", () => {
  assert.deepEqual(liquidatedLink(DIMS.fx, spec), {
    params: { liq: "liquidated", status: "all" },
    source: "the listing's liquidation filter",
  });
});

test("a listing with both switches is linked through Liquidated before", () => {
  assert.deepEqual(liquidatedLink(DIMS["morpho-base"], spec).params, { liq: "liquidated", status: "all" });
});

test("a Status still listing buckets keeps status=liquidated", () => {
  const old = [{ param: "status", options: [{ value: "open" }, { value: "closed" }, { value: "liquidated" }] }];
  assert.deepEqual(liquidatedLink(old, spec).params, { status: "liquidated" });
});

test("a listing that cannot ask has no link", () => {
  assert.equal(liquidatedLink([status], spec), null);
});
