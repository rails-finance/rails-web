// MakerDAO's dollar receipts (rails-ops ui-jobs 743): each amount at six
// decimals × its price as shown, the product to the cent, the figure the
// product; the OSM price named with its block, a capped one with its cap and
// the oracle behind it; the debt at the Vat's $1 par; a Lifetime flows row
// names its price's block beside the event's; a missing price draws nothing.
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

const { makerCollateralUsd, makerDebtUsd, makerFlowUsd, makerVaultCollateralUsd, makerLiquidationPrice } = await import(
  ROOT + "lib/makerdao/usd-receipt.ts"
);
const { replayMaker } = await import(ROOT + "lib/makerdao/flows.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const row = (prov, label) => prov.inputs.find((i) => i.label === label);

test("rows multiply out to the cent, a 7-decimal ink at a high price among them", () => {
  const r = makerCollateralUsd({
    what: "The vault's WBTC collateral in USD",
    symbol: "WBTC",
    ink: 1.2345678,
    inkSource: "chain",
    inkBlock: 21_000_000,
    price: 98_765.43218765,
    priceBlock: 21_000_000,
  });
  const amount = num(row(r.prov, "WBTC amount").value);
  const price = num(row(r.prov, "WBTC price").value);
  assert.equal(amount, 1.234568);
  assert.equal(price, 98765.432188);
  assert.equal(r.usd, Math.round(amount * price * 100) / 100);
  assert.equal(row(r.prov, "WBTC amount").pclass, "state", "the eth_call read is a state read");
  assert.match(
    row(r.prov, "WBTC price").note,
    /Vat\.ilks\(ilk\)\.spot × Spotter\.par × Spotter\.ilks\(ilk\)\.mat ÷ RAY³ at block 21,000,000/,
  );
  const listing = makerVaultCollateralUsd({ collateralSymbol: "ETH", ink: 2, source: "api", priceUsd: 3000.5 });
  assert.equal(row(listing.prov, "ETH amount").pclass, "indexed", "the replay is indexed");
  assert.match(row(listing.prov, "ETH price").note, /a block this read does not name/);
});

test("a capped price names the cap and the oracle behind it, where the cap binds", () => {
  const capped = makerVaultCollateralUsd({
    collateralSymbol: "SKY",
    ink: 1000,
    source: "chain",
    atBlock: 22_000_000,
    priceUsd: 0.025,
    priceCap: { capUsd: 0.025, oracleUsd: 0.0612345 },
  });
  assert.match(row(capped.prov, "SKY price").note, /capped by governance at \$0\.025; oracle \$0\.0612345/);
  const under = makerVaultCollateralUsd({
    collateralSymbol: "SKY",
    ink: 1000,
    source: "chain",
    atBlock: 22_000_000,
    priceUsd: 0.02,
    priceCap: { capUsd: 0.025, oracleUsd: 0.02 },
  });
  assert.doesNotMatch(row(under.prov, "SKY price").note, /capped/);
});

test("the debt stands at the Vat's $1 par, its amount at six decimals, the product to the cent", () => {
  const r = makerDebtUsd({ what: "Debt", symbol: "USDS", debt: 1234.5678919, amountNote: "art × rate" });
  assert.equal(row(r.prov, "USDS amount").value, "1,234.567892 USDS");
  assert.match(row(r.prov, "USDS price").note, /\$1, the Vat's par: one USDS counts as one dollar/);
  assert.equal(r.usd, 1234.57);
});

test("a flows row names the store's block beside the event's, and the nearest day where it fell back", () => {
  const ev = (id, ts, block, inkAfter) => ({
    id,
    ts,
    block,
    kind: "frob",
    dink: inkAfter,
    debtChange: 0,
    inkAfter,
    debtAfter: 0,
    rate: 1,
    stated: null,
    price: null,
    returned: false,
  });
  const DAY = 86_400;
  const rows = [ev("a", 20_000 * DAY + 100, 1000, 2), ev("b", 20_005 * DAY + 100, 2000, 3)];
  const replayed = replayMaker(rows, {
    collSymbol: "ETH",
    debtSymbol: "DAI",
    now: 20_100 * DAY,
    live: null,
    daily: [
      [20_000, 3000],
      [20_003, 3100],
    ],
    dailyBlocks: new Map([
      [20_000, 999],
      [20_003, 1888],
    ]),
  });
  const own = makerFlowUsd({
    what: "x",
    symbol: "ETH",
    amount: 2,
    amountNote: "ink",
    price: replayed[0].price,
    from: replayed[0].priceAt,
  });
  assert.match(
    row(own.prov, "ETH price").note,
    /price at the close of .*2024, block 999; this event is at block 1,000/,
  );
  assert.equal(replayed[1].priceFrom, "store-near");
  const near = makerFlowUsd({
    what: "x",
    symbol: "ETH",
    amount: 3,
    amountNote: "ink",
    price: replayed[1].price,
    from: replayed[1].priceAt,
  });
  assert.match(
    row(near.prov, "ETH price").note,
    /the nearest day's price, at the close of .*, block 1,888; this event is at block 2,000/,
  );
  assert.equal(near.usd, 9300);
});

test("a missing price draws no figure", () => {
  assert.equal(
    makerCollateralUsd({ what: "x", symbol: "ETH", ink: 1, inkSource: "api", price: null, priceBlock: 1 }),
    null,
  );
  assert.equal(
    makerVaultCollateralUsd({ collateralSymbol: "ETH", ink: 1, source: "chain", atBlock: 5, priceUsd: null }),
    null,
  );
});

test("the liquidation price is the arithmetic of its inputs as shown", () => {
  const l = makerLiquidationPrice(10_000.1234567, 1.45, 5.0000001);
  assert.equal(l.debt, "10,000.123457");
  assert.equal(l.ink, "5");
  assert.equal(l.mat, "145%");
  assert.ok(Math.abs(l.price - (10_000.123457 * 1.45) / 5) < 1e-6);
});

const { MAKER_PRICE_FORMULA, makerRowPriceNote } = await import(ROOT + "lib/makerdao/price-notes.ts");

test("the dollar price rebuilds from the raw spot, par and mat integers as the formula says: ÷ RAY³", () => {
  const RAY = 10n ** 27n;
  const rdiv = (x, y) => (x * RAY) / y;
  const val = 3_000_512_345_678_900_000_000n; // $3,000.5123456789 as a wad
  const par = RAY; // one DAI = $1
  const mat = (145n * RAY) / 100n; // 145%
  const spot = rdiv(rdiv(val * 10n ** 9n, par), mat); // Spotter.poke
  assert.match(MAKER_PRICE_FORMULA, /÷ RAY³$/);
  const rebuilt = Number((spot * par * mat) / RAY ** 2n) / 1e27; // ÷ RAY³, the last RAY as a float
  assert.ok(Math.abs(rebuilt - 3000.5123456789) < 1e-9, `rebuilt ${rebuilt}`);
});

test("an event receipt names the cap where it binds; the today note with no block is one statement", () => {
  const r = makerCollateralUsd({
    what: "x",
    symbol: "SKY",
    ink: 100,
    inkSource: "api",
    inkBlock: 22_000_000,
    price: 0.025,
    priceBlock: 22_000_000,
    cap: { capUsd: 0.025, oracleUsd: 0.06 },
  });
  assert.match(row(r.prov, "SKY price").note, /at block 22,000,000, capped by governance at \$0\.025; oracle \$0\.06/);
  assert.equal(makerRowPriceNote({ from: "today", block: null }), "the live read's price, which names no block");
  assert.match(makerRowPriceNote({ from: "today", block: 5, capped: true }), /capped price/);
});
