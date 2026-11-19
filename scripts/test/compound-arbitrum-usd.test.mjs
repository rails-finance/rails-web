// The Compound V3 wallet read's dollars (rails-ops ui-jobs 743), Arbitrum and
// Base: each amount at six decimals × its Comet's getPrice as shown, the
// product to the cent, each figure the sum of its products; the WETH Comet's
// price one composed row, getPrice in ETH × WETH in dollars; a Comet with no
// conversion draws no totals; Base's strip names Base's read.
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

const { compoundArbitrumUsd } = await import(ROOT + "lib/compound-arbitrum/usd.ts");
const { cometUsdPrice } = await import(ROOT + "lib/compound/comet-usd.ts");
const { compoundArbitrumHolderStrip } = await import(ROOT + "lib/compound-arbitrum/holder-strip.ts");
const { compoundBaseHolderStrip } = await import(ROOT + "lib/compound-base/holder-strip.ts");
const { shownUsd, shownComposedPrice } = await import(ROOT + "lib/shared/shown-usd.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const raw = (n, d) => BigInt(Math.round(n * 10 ** Math.min(d, 9))) * 10n ** BigInt(Math.max(0, d - 9));
const USDC_COMET = "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf";
const WETH_COMET = "0x6f7d514bbd4aff3bcd1140b7344b32f063dee486";
const usdc = (o = {}) => ({
  comet: USDC_COMET,
  market: "usdc",
  baseSymbol: "USDC",
  baseDecimals: 6,
  quoteUnit: "USD",
  basePrice: 0.99987654,
  supplyBalanceRaw: "0",
  borrowBalanceRaw: String(raw(1234.567891, 6)),
  collateral: [
    { address: "0xwbtc", symbol: "WBTC", decimals: 8, balanceRaw: String(raw(0.1234567, 8)), price: 98765.43218765 },
  ],
  isLiquidatable: false,
  ...o,
});
const weth = (o = {}) => ({
  comet: WETH_COMET,
  market: "weth",
  baseSymbol: "WETH",
  baseDecimals: 18,
  quoteUnit: "ETH",
  basePrice: 1,
  supplyBalanceRaw: "0",
  borrowBalanceRaw: String(raw(1.5, 18)),
  collateral: [
    { address: "0xwsteth", symbol: "wstETH", decimals: 18, balanceRaw: String(raw(2.25, 18)), price: 1.2123456789 },
  ],
  isLiquidatable: false,
  ...o,
});
const read = (positions, ethUsd = 3012.345678) => ({
  wallet: "0xabc",
  blockNumber: 400_000_000,
  marketsScanned: 4,
  positionsFound: positions.length,
  positions,
  chainStale: false,
  ethUsd,
});
const comet = (chain, label) => ({
  market: { key: chain.market, label, comet: chain.comet, baseSymbol: chain.baseSymbol },
  chain,
  status: "open",
});
const rows = (prov) => new Map(prov.inputs.map((i) => [i.label, i]));

test("rows multiply out to the cent, a 7-decimal amount at a high price among them", () => {
  const r = read([usdc()]);
  const u = compoundArbitrumUsd(r).byComet.get(USDC_COMET);
  assert.equal(u.collateralUsd, shownUsd(0.1234567, 98765.43218765));
  const strip = compoundArbitrumHolderStrip(r, [comet(usdc(), "cUSDCv3")]);
  const coll = strip.legs.find((l) => l.id === "collateral");
  const m = rows(coll.prov);
  const amount = num(m.get("cUSDCv3 WBTC amount").value);
  const price = num(m.get("cUSDCv3 WBTC price").value);
  assert.equal(amount, 0.123457);
  assert.equal(Math.round(amount * price * 100) / 100, u.collateralUsd);
  assert.equal(num(coll.value), u.collateralUsd);
  assert.match(coll.prov.summary, /at block 400,000,000/);
});

test("the WETH Comet's price is one composed row: getPrice in ETH × WETH in dollars, each as shown", () => {
  const p = cometUsdPrice({ quoteUnit: "ETH" }, 1.2123456789, 3012.345678);
  assert.equal(p.usd, shownComposedPrice(1.2123456789, 3012.345678));
  const r = read([weth()]);
  const strip = compoundArbitrumHolderStrip(r, [comet(weth(), "cWETHv3")]);
  const m = rows(strip.legs.find((l) => l.id === "collateral").prov);
  const note = m.get("cWETHv3 wstETH price").note;
  assert.match(
    note,
    /1\.212346 ETH \(cWETHv3's getPrice, in ETH\) × \$3,012\.345678 \(WETH\/USD, from the same read\)$/,
  );
  assert.equal(num(m.get("cWETHv3 wstETH price").value), p.usd);
});

test("a Comet with no conversion draws no totals", () => {
  const r = { ...read([usdc(), weth()]), ethUsd: undefined };
  const usd = compoundArbitrumUsd(r);
  assert.equal(usd.totals.collateralUsd, null);
  assert.equal(usd.totals.debtUsd, null);
  const strip = compoundArbitrumHolderStrip(r, [comet(usdc(), "cUSDCv3"), comet(weth(), "cWETHv3")]);
  const coll = strip.legs.find((l) => l.id === "collateral");
  assert.equal(coll.value, "—");
  assert.match(
    coll.prov.summary,
    /no dollar figure: cWETHv3 quotes in ETH and the read carries no WETH in dollars to convert at, so the total collateral is not drawn\./,
  );
});

test("Base's strip takes the same rows and names Base's read", () => {
  const r = read([weth()]);
  const strip = compoundBaseHolderStrip(r, [comet(weth(), "cWETHv3")], { blockNumber: 22_000_123 });
  const prov = strip.legs.find((l) => l.id === "debt").prov;
  assert.match(prov.via, /GET \/api\/chain\/compound-base\/wallet/);
  assert.match(
    rows(prov).get("cWETHv3 WETH price").note,
    /WETH\/USD, on cUSDCv3's WETH feed, read beside it at block 22,000,123/,
  );
  assert.equal(
    num(strip.legs.find((l) => l.id === "debt").value),
    compoundArbitrumUsd(r).byComet.get(WETH_COMET).borrowUsd,
  );
});

test("a zero getPrice on a USD-quoted Comet is named as such, not as a missing conversion", () => {
  const zero = usdc({
    collateral: [{ address: "0xwbtc", symbol: "WBTC", decimals: 8, balanceRaw: String(raw(0.5, 8)), price: 0 }],
  });
  const strip = compoundArbitrumHolderStrip(read([zero]), [comet(zero, "cUSDCv3")]);
  const coll = strip.legs.find((l) => l.id === "collateral");
  assert.equal(coll.value, "—");
  assert.match(
    coll.prov.summary,
    /no dollar figure: cUSDCv3's getPrice answered zero at this read, so the total collateral is not drawn\./,
  );
  assert.doesNotMatch(coll.prov.summary, /convert/);
});

test("Base's receipts name each price's block on its row: the WETH factor is its own read", () => {
  const strip = compoundBaseHolderStrip(read([weth(), usdc()]), [comet(weth(), "cWETHv3"), comet(usdc(), "cUSDCv3")], {
    blockNumber: 22_000_123,
  });
  const prov = strip.legs.find((l) => l.id === "collateral").prov;
  assert.match(prov.summary, /each price at the block its row names/);
  const m = rows(prov);
  assert.match(
    m.get("cWETHv3 wstETH price").note,
    /getPrice, in ETH at block 400,000,000\) × .*read beside it at block 22,000,123/,
  );
  assert.match(m.get("cUSDCv3 WBTC price").note, /cUSDCv3's getPrice, in dollars at block 400,000,000/);
});
