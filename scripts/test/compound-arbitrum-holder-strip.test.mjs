// lib/compound-arbitrum/holder-strip.ts against a stubbed whole-wallet Comet
// read. The adapter imports through `@/`, so this file resolves `@/` and
// extensionless paths the way scripts/verify/verify-holder-strip.mjs does for
// the Polaris and Liquity V2 adapters.
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
const { compoundArbitrumHolderStrip } = await import(ROOT + "lib/compound-arbitrum/holder-strip.ts");

const WALLET = "0x06ef90d2416582eb1ceb7634f5347baeb3397c72";
const USDC = { key: "usdc", label: "cUSDCv3", comet: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf", baseSymbol: "USDC" };
const USDT = { key: "usdt", label: "cUSDTv3", comet: "0xd98be00b5d27fc98112bde293e487f8d4ca57d07", baseSymbol: "USDT" };
const WETH = { key: "weth", label: "cWETHv3", comet: "0x6f7d514bbd4aff3bcd1140b7344b32f063dee486", baseSymbol: "WETH" };

/** One Comet's read. Amounts in whole units; raws scaled by `decimals`. */
const chain = (m, o) => ({
  wallet: WALLET,
  market: m.key,
  comet: m.comet,
  blockNumber: 100,
  baseSymbol: m.baseSymbol,
  baseDecimals: o.baseDecimals ?? 6,
  quoteUnit: o.quoteUnit ?? "USD",
  supplyBalanceRaw: String(BigInt(Math.round((o.supply ?? 0) * 1e6)) * 10n ** BigInt((o.baseDecimals ?? 6) - 6)),
  borrowBalanceRaw: String(BigInt(Math.round((o.borrow ?? 0) * 1e6)) * 10n ** BigInt((o.baseDecimals ?? 6) - 6)),
  basePrice: o.basePrice ?? 1,
  collateral: (o.collateral ?? []).map(([symbol, amount, price]) => ({
    symbol,
    address: `0x${symbol.toLowerCase().padEnd(40, "0")}`,
    decimals: 18,
    balanceRaw: String(BigInt(Math.round(amount * 1e6)) * 10n ** 12n),
    price,
  })),
  borrowCapacity: o.borrowCapacity ?? 0,
  liquidationCapacity: o.liquidationCapacity ?? 0,
  debtValue: o.debtValue ?? 0,
  healthFactor: null,
  isBorrowCollateralized: true,
  isLiquidatable: o.isLiquidatable ?? false,
  utilization: 0,
  supplyApr: 0,
  borrowApr: 0,
  baseBorrowMin: 0,
  chainStale: false,
});

// cUSDCv3: 10 WETH collateral at $2,000, 5,000 USDC borrowed against an 8,000
// absorb line (62.5%). cUSDTv3: 1,000 ARB at $0.50, 300 USDT borrowed against
// a 400 line (75%). cWETHv3 (ETH-quoted, ethUsd 2,000): 1.5 WETH lent, no
// debt. And one closed Comet the history names.
const usdc = chain(USDC, {
  borrow: 5000,
  collateral: [["WETH", 10, 2000]],
  debtValue: 5000,
  liquidationCapacity: 8000,
  borrowCapacity: 7000,
});
const usdt = chain(USDT, {
  borrow: 300,
  collateral: [["ARB", 1000, 0.5]],
  debtValue: 300,
  liquidationCapacity: 400,
  borrowCapacity: 350,
});
const weth = chain(WETH, { quoteUnit: "ETH", baseDecimals: 18, supply: 1.5, basePrice: 1 });
const head = {
  wallet: WALLET,
  blockNumber: 100,
  marketsScanned: 4,
  positionsFound: 3,
  positions: [usdc, usdt, weth],
  chainStale: false,
  ethUsd: 2000,
};
const comets = [
  { market: USDC, chain: usdc, status: "open" },
  { market: USDT, chain: usdt, status: "open" },
  { market: WETH, chain: weth, status: "open" },
  { market: { key: "usdce", label: "cUSDCev3", comet: "0xa5", baseSymbol: "USDC.e" }, chain: null, status: "closed" },
];

test("the counts line names Comet positions by status", () => {
  const s = compoundArbitrumHolderStrip(WALLET, head, comets);
  assert.equal(s.countsLine, "This wallet holds 4 Comet positions, 3 open and 1 closed.");
  assert.deepEqual(s.counts, { open: 3, closed: 1, liquidated: 0 });
  assert.equal(s.truncated, false);
});

test("the legs are dollars at each Comet's feed, wearing ≈, the parts beneath", () => {
  const s = compoundArbitrumHolderStrip(WALLET, head, comets);
  const leg = (id) => s.legs.find((l) => l.id === id);
  // 10 × 2,000 + 1,000 × 0.5
  assert.equal(leg("collateral").value, "$20,500.00");
  assert.equal(leg("collateral").approx, true);
  assert.equal(leg("collateral").footnote.text, "cUSDCv3 $20,000.00 · cUSDTv3 $500.00");
  assert.equal(leg("collateral").prov.kind, "chain-derived");
  assert.equal(leg("collateral").prov.pclass, "oracle");
  // 5,000 + 300
  assert.equal(leg("debt").value, "$5,300.00");
  assert.equal(leg("debt").footnote.text, "5,000 USDC · 300 USDT");
  // 1.5 WETH at 1 ETH × $2,000
  assert.equal(leg("lent").value, "$3,000.00");
  assert.equal(leg("lent").footnote.text, "1.5 WETH");
  assert.ok(s.legs.every((l) => l.tip && l.approx));
});

test("nearest its floor is the largest share of an absorb line reached", () => {
  const s = compoundArbitrumHolderStrip(WALLET, head, comets);
  assert.equal(s.nearest.label, "cUSDTv3");
  assert.equal(s.nearest.measure, "75.0% of its absorb line");
  assert.equal(s.nearest.href, `/arbitrum/compound-v3/usdt/${WALLET}`);
  assert.equal(s.nearest.ratioPct, undefined);
});

test("liquidatable is said only when a Comet is", () => {
  const hot = { ...usdt, isLiquidatable: true };
  const s = compoundArbitrumHolderStrip(WALLET, { ...head, positions: [usdc, hot, weth] }, [
    comets[0],
    { ...comets[1], chain: hot },
    comets[2],
  ]);
  assert.equal(s.countsLine, "This wallet holds 3 Comet positions, all open. 1 of the open ones is liquidatable.");
  assert.doesNotMatch(compoundArbitrumHolderStrip(WALLET, head, comets).countsLine, /liquidatable/);
});

test("a wallet with no debt has no nearest-floor line", () => {
  const s = compoundArbitrumHolderStrip(WALLET, { ...head, positions: [weth] }, [comets[2], comets[3]]);
  assert.equal(s.nearest, undefined);
  assert.deepEqual(
    s.legs.map((l) => l.id),
    ["lent"],
  );
});

test("no Comet read: the history's count and a note, no legs", () => {
  const s = compoundArbitrumHolderStrip(
    WALLET,
    null,
    comets.map((c) => ({ ...c, chain: null, status: "closed" })),
  );
  assert.equal(s.countsLine, "The history names 4 Comet positions for this wallet.");
  assert.deepEqual(s.legs, []);
  assert.equal(s.nearest, undefined);
  assert.match(s.note, /did not answer/);
});
