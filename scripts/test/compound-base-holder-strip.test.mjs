// lib/compound-base/holder-strip.ts against a stubbed whole-wallet Comet
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
const { compoundBaseHolderStrip } = await import(ROOT + "lib/compound-base/holder-strip.ts");

const WALLET = "0x5c38a0ab51ac64d93203247eefbc5b6b3ee7f4f6";
const USDC = { key: "usdc", label: "cUSDCv3", comet: "0xb125e6687d4313864e53df431d5425969c15eb2f", baseSymbol: "USDC" };
const WETH = { key: "weth", label: "cWETHv3", comet: "0x46e6b214b524310239732d51387075e0e70970bf", baseSymbol: "WETH" };
const AERO = { key: "aero", label: "cAEROv3", comet: "0x784efeb622244d2348d4f2522f8860b96fbece89", baseSymbol: "AERO" };

const raw = (amount, decimals) => String(BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals - 6));
const chain = (m, o) => ({
  wallet: WALLET,
  market: m.key,
  comet: m.comet,
  blockNumber: 200,
  baseSymbol: m.baseSymbol,
  baseDecimals: o.baseDecimals ?? 6,
  quoteUnit: o.quoteUnit ?? "USD",
  supplyBalanceRaw: raw(o.supply ?? 0, o.baseDecimals ?? 6),
  borrowBalanceRaw: raw(o.borrow ?? 0, o.baseDecimals ?? 6),
  basePrice: o.basePrice ?? 1,
  collateral: (o.collateral ?? []).map(([symbol, amount, price]) => ({
    symbol,
    address: `0x${symbol.toLowerCase().padEnd(40, "0")}`,
    decimals: 18,
    balanceRaw: raw(amount, 18),
    price,
  })),
  borrowCapacity: 0,
  liquidationCapacity: 0,
  debtValue: o.borrow ?? 0,
  healthFactor: null,
  isBorrowCollateralized: true,
  isLiquidatable: false,
  utilization: 0,
  supplyApr: 0,
  borrowApr: 0,
  baseBorrowMin: 0,
  chainStale: false,
});

// cUSDCv3: 2 cbETH at $3,000 against 1,000 USDC borrowed. cWETHv3 (ETH-quoted,
// ethUsd 2,500): 0.5 WETH lent. cAEROv3 (AERO at $0.40): 100 AERO lent.
const usdc = chain(USDC, { borrow: 1000, collateral: [["CBETH", 2, 3000]] });
const weth = chain(WETH, { quoteUnit: "ETH", baseDecimals: 18, supply: 0.5, basePrice: 1 });
const aero = chain(AERO, { baseDecimals: 18, supply: 100, basePrice: 0.4 });
const head = {
  wallet: WALLET,
  blockNumber: 200,
  marketsScanned: 5,
  positionsFound: 3,
  positions: [usdc, weth, aero],
  chainStale: false,
  ethUsd: 2500,
};
const comets = [
  { market: USDC, chain: usdc, status: "open" },
  { market: WETH, chain: weth, status: "open" },
  { market: AERO, chain: aero, status: "open" },
];

test("the Base strip counts Comet positions and states dollars at each Comet's feed", () => {
  const s = compoundBaseHolderStrip(head, comets);
  const leg = (id) => s.legs.find((l) => l.id === id);
  assert.equal(s.countsLine, "This wallet holds 3 Comet positions, all open.");
  assert.equal(leg("collateral").value, "$6,000.00");
  assert.equal(leg("collateral").footnote.text, "cUSDCv3 $6,000.00");
  assert.equal(leg("debt").value, "$1,000.00");
  // 0.5 WETH × $2,500 + 100 AERO × $0.40
  assert.equal(leg("lent").value, "$1,290.00");
  assert.equal(leg("lent").footnote.text, "0.5 WETH · 100 AERO");
  assert.ok(s.legs.every((l) => l.approx));
  assert.equal(
    s.legs.some((l) => /health/i.test(l.label)),
    false,
  );
});

test("every receipt names Base's wallet route", () => {
  const s = compoundBaseHolderStrip(head, comets);
  for (const l of s.legs) assert.match(l.prov.via, /^GET \/api\/chain\/compound-base\/wallet at block 200 /);
});
