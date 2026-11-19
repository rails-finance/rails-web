// f(x)'s dollar receipts (rails-ops ui-jobs 743): every price a leg of the
// pool's oracle at a named block. The collateral at six decimals × the leg as
// shown, the product to the cent, the figure the product; the leg (anchor or
// min) and the oracle named; a sum of seized legs is the sum of the shown
// products; a missing price draws nothing.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    // A directory resolves to a same-named .ts beside it, then its index.ts.
    if (!existsSync(fileURLToPath(url)) || statSync(fileURLToPath(url)).isDirectory()) {
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

const { fxCollateralUsd, fxPositionCollUsd, fxSeizedUsd } = await import(ROOT + "lib/fx/usd-receipt.ts");
const { shownUsd } = await import(ROOT + "lib/shared/shown-usd.ts");
const { FX_MIN_ONLY_NOTE, FX_NO_ANCHOR } = await import(ROOT + "lib/fx/price-notes.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const row = (prov, label) => prov.inputs.find((i) => i.label === label);
const view = (colls, priceUsd = null, priceBlock = null) => ({
  pool: "wbtc",
  settled: { colls, block: 23_500_000 },
  oracle: { priceUsd, priceBlock },
});

test("rows multiply out to the cent, a 7-decimal colls at a high price among them", () => {
  const r = fxCollateralUsd({
    what: "x",
    pool: "wbtc",
    colls: 1.2345678,
    amountNote: "getPosition",
    leg: "min",
    price: 98_765.43218765,
    priceBlock: 23_500_000,
  });
  const amount = num(row(r.prov, "WBTC amount").value);
  const price = num(row(r.prov, "WBTC price").value);
  assert.equal(amount, 1.234568);
  assert.equal(price, 98765.432188);
  assert.equal(r.usd, Math.round(amount * price * 100) / 100);
  assert.equal(row(r.prov, "WBTC price").contract.address, "0xb3c90e64eb6f456a5f5c17aa99b6aeca6f4a6390");
});

test("a position's collateral stands at the anchor leg, its receipt rebuilding the figure; the seizures keep the min leg", () => {
  const anchor = fxPositionCollUsd(view(2.5), { anchor: 97_000.123456, block: 23_499_990 });
  assert.match(row(anchor.prov, "WBTC price").note, /anchor leg \(getPrice\).*at block 23,499,990/);
  assert.equal(
    anchor.usd,
    Math.round(num(row(anchor.prov, "WBTC amount").value) * num(row(anchor.prov, "WBTC price").value) * 100) / 100,
  );
  // The collateral and the price stand at different blocks: both named.
  assert.match(anchor.prov.summary, /collateral stands at block 23,500,000 and the price at block 23,499,990/);
  const seized = fxSeizedUsd({ what: "x", pool: "wbtc", legs: [{ amount: 0.1, price: 96_500.5, block: 23_000_000 }] });
  assert.match(row(seized.prov, "WBTC price").note, /min leg \(getLiquidatePrice\)/);
});

test("a sheet row whose block stores only the min leg names it as such", () => {
  const r = fxCollateralUsd({
    what: "x",
    pool: "wsteth",
    colls: 1.5,
    amountNote: "",
    leg: "min",
    price: 1990.5,
    priceBlock: 23_000_000,
    priceNote: `${FX_MIN_ONLY_NOTE}, block 23,000,000`,
  });
  assert.equal(
    row(r.prov, "stETH price").note,
    "the min leg (getLiquidatePrice), the only leg stored at this block, block 23,000,000",
  );
});

test("a missing price draws no figure", () => {
  // No anchor read: no collateral dollars, even with the sweep's min leg stored.
  assert.equal(fxPositionCollUsd(view(2.5, 96_500.5, 23_499_990), null), null);
  assert.match(FX_NO_ANCHOR, /^no dollar figure: /);
  assert.equal(
    fxCollateralUsd({ what: "x", pool: "wsteth", colls: 1, amountNote: "", leg: "anchor", price: null, priceBlock: 1 }),
    null,
  );
  assert.equal(
    fxSeizedUsd({
      what: "x",
      pool: "wsteth",
      legs: [
        { amount: 1, price: 2000, block: 1 },
        { amount: 1, price: null, block: 2 },
      ],
    }),
    null,
  );
});

test("the bonus's collateral is the sum of shown legs, each at the min leg of its block", () => {
  const legs = [
    { kind: "rebalance", amount: 0.1234567, price: 2001.987654, block: 23_000_002, priceBlock: 23_000_001 },
    { kind: "redemption", amount: 0.0500001, price: 1999.123456, block: 23_100_003, priceBlock: 23_100_002 },
  ];
  const r = fxSeizedUsd({ what: "x", pool: "wsteth", legs });
  const sum = Math.round(legs.reduce((s, l) => s + shownUsd(l.amount, l.price), 0) * 100) / 100;
  assert.equal(r.usd, sum);
  const notes = r.prov.inputs.map((i) => i.note ?? "").join(" | ");
  // Each row names its event and the event's block; the price stands at the
  // block before it, where it was read.
  assert.match(notes, /collateral the rebalance took at block 23,000,002/);
  assert.match(notes, /collateral the redemption took at block 23,100,003/);
  assert.match(notes, /min leg \(getLiquidatePrice\).*at block 23,000,001/);
  assert.match(notes, /min leg \(getLiquidatePrice\).*at block 23,100,002/);
});

const { fxMarketMove, FX_LEGS_DIFFER } = await import(ROOT + "lib/fx/usd-receipt.ts");

test("a market move is the difference of two shown products on one leg, and no figure across two", () => {
  const same = fxMarketMove(1.2345678, { price: 1990.123456, leg: "min" }, { price: 2010.654321, leg: "min" });
  assert.equal(same.usd, Math.round((shownUsd(1.2345678, 2010.654321) - shownUsd(1.2345678, 1990.123456)) * 100) / 100);
  const across = fxMarketMove(1.2345678, { price: 1990.123456, leg: "min" }, { price: 2010.654321, leg: "anchor" });
  assert.deepEqual(across, { none: FX_LEGS_DIFFER });
  assert.equal(FX_LEGS_DIFFER, "The two values stand on different oracle legs (min then, anchor now).");
});

const { fxAnchorOf } = await import(ROOT + "lib/fx/usd-receipt.ts");

test("the position figures gate on the anchor alone: an anchor-only read states the collateral", () => {
  const anchor = fxAnchorOf({ anchorPrice: "1779567367000000000000", minPrice: null }, 26_445_741);
  assert.deepEqual(anchor, { anchor: 1779.567367, block: 26_445_741 });
  assert.ok(fxPositionCollUsd(view(2.5), anchor));
  assert.equal(fxAnchorOf({ anchorPrice: null, minPrice: "1770000000000000000000" }, 26_445_741), null);
});
