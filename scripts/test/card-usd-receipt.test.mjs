// The Liquity-family position cards' collateral USD (rails-ops ui-jobs 740):
// the receipt's rows rebuild the card's figure — the collateral at six
// decimals, the price at six significant figures, their product to the cent,
// the figure being that product (shownUsd). Liquity V2's card and the forks'.
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
    if (!existsSync(fileURLToPath(url))) {
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

const { forkLiveVocab } = await import(ROOT + "lib/shared/liquity-fork-live-provenance.ts");
const { shownUsd, amountText, priceText } = await import(ROOT + "lib/shared/holder-usd-receipt.ts");
const { collSheetUsd } = await import(ROOT + "lib/liquity/sheet-usd.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const rebuilds = (prov, figure) => {
  // The balance row, then the price row.
  const [a, p] = prov.inputs.map((i) => num(i.value));
  return Math.round(a * p * 100) / 100 === figure;
};

// Liquity V2's card receipt (lib/liquity/trove-card-provenance.ts, which
// loads a .tsx module and so is not importable here) prints its rows with
// amountText / priceText and the card draws shownUsd: the arithmetic is
// asserted on those three.
test("Liquity V2's card: the rows as printed rebuild the figure", () => {
  const coll = 12.34567891;
  const priceUsd = 3456.789123;
  const figure = shownUsd(coll, priceUsd);
  const rows = [`${amountText(coll)} WETH`, priceText(priceUsd)];
  assert.deepEqual(rows, ["12.345679 WETH", "$3,456.789123"]);
  assert.equal(Math.round(num(rows[0]) * num(rows[1]) * 100) / 100, figure);
  assert.equal(figure, 42676.41);
});

test("a BTC price keeps the precision its product needs: under a cent from the chain's", () => {
  const amount = 1234.57;
  const price = 98765.4321;
  const figure = shownUsd(amount, price);
  assert.equal(priceText(price), "$98,765.4321");
  assert.ok(Math.abs(figure - amount * price) < 0.01, `${figure} vs ${amount * price}`);
  // An amount past six decimals rounds at the seventh: at a BTC price that is
  // at most half a millionth of a coin, under five cents of the chain's.
  const longAmount = 1234.5678915;
  const btc = 98765;
  assert.ok(
    Math.abs(shownUsd(longAmount, btc) - longAmount * btc) < 0.05,
    `${shownUsd(longAmount, btc)} vs ${longAmount * btc}`,
  );
  // Two decimals at least, trailing zeros trimmed.
  assert.equal(priceText(104568), "$104,568.00");
  assert.equal(priceText(0.98765432), "$0.987654");
});

test("the event sheet's dollars add up to the cent", () => {
  for (const c of [
    {
      beforeColl: 12.345678912,
      collAfter: 15.111111111,
      redistColl: 0.123456789,
      priceNow: 3456.789123,
      prevPrice: 3401.123456,
    },
    { beforeColl: 0.987654321, collAfter: 0.5, redistColl: 0, priceNow: 98765.4321, prevPrice: 101234.5678 },
  ]) {
    const before = shownUsd(c.beforeColl, c.priceNow);
    const total = shownUsd(c.collAfter, c.priceNow);
    const s = collSheetUsd({ ...c, before, total });
    const cents = (x) => Math.round(x * 100);
    assert.equal(cents(s.last) + cents(s.market), cents(s.before), "Last + market = Before");
    assert.equal(cents(s.before) + cents(s.redistribution) + cents(s.event), cents(s.total), "Before + rows = Total");
  }
});

test("a fork's card: the rows rebuild the figure, under a dollar too", () => {
  const vocab = forkLiveVocab("ebisu");
  for (const [amount, price] of [
    [0.123456789, 0.987654321],
    [1234.5678912, 98765.4321],
  ]) {
    const prov = vocab.forkUsdProv("Collateral", "WBTC", { amount, price });
    assert.ok(rebuilds(prov, shownUsd(amount, price)), `${amount} × ${price}`);
    assert.match(prov.summary, /fetchPrice simulated @ head/);
  }
  const stale = vocab.forkUsdProv("Collateral", "WBTC", { amount: 1, price: 2, stale: true });
  assert.match(stale.summary, /lastGoodPrice/);
  assert.match(stale.inputs[1].note, /^PriceFeed\.lastGoodPrice, the last fetchPrice result/);
});
