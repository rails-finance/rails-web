// The Liquity V2 holder strip with the wallet's Stability Pool deposits
// (rails-ops TO-DO-stability-pool-deposits §1b): counted across kinds, one
// BOLD leg of their own, and the share card's status word naming them. The adapter imports through `@/`, resolved here
// as compound-arbitrum-holder-strip.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { liquityV2HolderStrip } = await import(ROOT + "lib/liquity-v2/holder-strip.ts");
const { liquityV2HolderCardModel } = await import(ROOT + "lib/liquity/share-card.ts");

const E18 = "000000000000000000";
const prices = { weth: 3000, wsteth: 3600, reth: 3400 };
const trove = (id, status, coll, debt) => ({
  id,
  collateralType: "WETH",
  status,
  collateral: { amount: coll },
  debt: { current: debt },
});
const deposit = (branch, status, bold) => ({
  collateral_type: branch,
  depositor: "0xw",
  status,
  deposit_raw: status === "open" ? `${bold}${E18}` : "0",
});
const troves = [trove("1", "open", 2, 1000), trove("2", "closed", 0, 0)];
const deposits = {
  rows: [deposit("WETH", "open", 300), deposit("rETH", "open", 200), deposit("wstETH", "closed")],
  total: 3,
};

test("deposits are counted beside the Troves and summed in BOLD on their own leg", () => {
  const s = liquityV2HolderStrip(troves, 2, prices, 20, 0, "0xw", deposits);
  assert.equal(
    s.countsLine,
    "This wallet holds 1 open Trove and has closed 1. It has 2 Stability Pool deposits and has closed 1.",
  );
  assert.deepEqual(s.kinds, [{ id: "deposit", noun: ["deposit", "deposits"], open: 2, closed: 1 }]);
  assert.equal(s.positions, 5);
  const leg = s.legs.find((l) => l.id === "deposit");
  assert.equal(leg.label, "Stability Pool deposits");
  assert.equal(leg.figure.amount, 500);
  assert.equal(s.legs.find((l) => l.id === "debt").figure.amount, 1000);
});

test("without deposits the strip is as before", () => {
  const s = liquityV2HolderStrip(troves, 2, prices, 20, 0, "0xw");
  assert.equal(s.countsLine, "This wallet holds 1 open Trove and has closed 1.");
  assert.equal(s.kinds, undefined);
  assert.equal(s.positions, 2);
});

test("the wallet card names the deposits in its status word", () => {
  const card = liquityV2HolderCardModel(troves, 2, prices, 20, "0xw", 0, deposits);
  assert.equal(card.status, "1 open · 1 closed · 2 open deposits · 1 closed deposit");
  assert.deepEqual(
    card.stats.map((x) => x.label),
    ["Total collateral", "Total debt", "Stability Pool deposits"],
  );
});

test("Troves past one page: the count, then the deposits by status", () => {
  const many = Array.from({ length: 20 }, (_, i) => trove(String(i), "open", 1, 1));
  const s = liquityV2HolderStrip(many, 25, prices, 20, 0, "0xw", deposits);
  assert.equal(s.truncated, true);
  assert.equal(s.countsLine, "This wallet holds 25 Troves. It has 2 Stability Pool deposits and has closed 1.");
});

test("a wallet with no Troves keeps the static card", () => {
  assert.equal(liquityV2HolderCardModel([], 0, prices, 20, "0xw", 0, deposits), null);
});
