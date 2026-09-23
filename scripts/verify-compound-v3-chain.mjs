// ============================================================================
// VERIFY: Compound V3 (Comet) chain assumptions for the reference-depth uplift
// ============================================================================
//
// Read-only. Every risk surface the uplift adds rests on a contract assumption;
// this script checks each one directly against mainnet before (and after) the
// build, so the surfaces are grounded in verified chain behaviour:
//
//   1. Market catalog integrity — baseToken / baseScale match the hardcoded
//      registry for all three captured markets.
//   2. Asset enumeration — numAssets + getAssetInfo(i) return the AssetInfo
//      struct (offset ordinal, asset, priceFeed, scale, borrowCollateralFactor,
//      liquidateCollateralFactor, liquidationFactor), scale == 10^decimals,
//      BCF < LCF <= 1e18 for every collateral asset.
//   3. Price numeraire — getPrice(baseTokenPriceFeed) ~= 1e8 in EVERY market:
//      each market quotes in its own base unit (USD for cUSDCv3/cUSDTv3, ETH
//      for cWETHv3). The risk surfaces must therefore value in base-token
//      terms, never assume USD.
//   4. Rates — getSupplyRate/getBorrowRate(getUtilization) are per-second
//      1e18-scaled; utilization == totalBorrow/totalSupply.
//   5. Account state — at most one of balanceOf/borrowBalanceOf is nonzero;
//      userBasic.principal sign agrees; assetsIn bitmask <-> nonzero
//      collateralBalanceOf; collateralBalanceOf == userCollateral.balance.
//   6. Health arithmetic — the client-side sum
//      SUM(collateral x price x liquidateCollateralFactor) / (borrow x basePrice)
//      agrees with the contract's own isLiquidatable / isBorrowCollateralized
//      verdicts (the surfaces ship the contract's verdicts, kind "chain").
//   7. Index agreement — the captured event-replay collateral is wei-exact vs
//      chain (collateral is non-earning), and the chain-refresher overlay's
//      base value matches the live read within accrual drift.
//
// Run:  node scripts/verify-compound-v3-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN
//       (live-index samples; skipped if missing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

// The captured markets — must mirror lib/compound/asset-catalog.ts.
const MARKETS = [
  {
    key: "usdc",
    comet: "0xc3d688b66703497daa19211eedff47f25384cdc3",
    baseToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    baseDecimals: 6,
  },
  {
    key: "weth",
    comet: "0xa17581a9e3356d9a858b789d68b4d866e593ae94",
    baseToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    baseDecimals: 18,
  },
  {
    key: "usdt",
    comet: "0x3afdc9bca9213a35503b077a6072f3d0d5ab0840",
    baseToken: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    baseDecimals: 6,
  },
];

// Sample accounts from the live index (2026-07-13): a 3-collateral USDC
// borrower, a 2-collateral USDT borrower, a WETH-market lender.
const SAMPLES = [
  { market: "usdc", account: "0x52a3cdf2ef6b17e6ffdaceb38ef30a8c42e6a366" },
  { market: "usdt", account: "0x17bb0517ed6809f00c39417a5458f7dd105775be" },
  { market: "weth", account: "0xd9b41558904f05da3e4b98022e91c52406319ea6" },
];

// Multicall-batch the parallel scalar reads (a bare free-tier endpoint 429s on
// ~20 concurrent eth_calls; batched they collapse into a few aggregate3 calls),
// retry hard on 429, and pace the market/account phases.
const client = createPublicClient({
  chain: mainnet,
  batch: { multicall: { wait: 50 } },
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const cometAbi = parseAbi([
  "function baseToken() view returns (address)",
  "function baseScale() view returns (uint64)",
  "function baseTokenPriceFeed() view returns (address)",
  "function baseBorrowMin() view returns (uint104)",
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrow() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function userBasic(address account) view returns (int104 principal, uint64 baseTrackingIndex, uint64 baseTrackingAccrued, uint16 assetsIn, uint8 _reserved)",
  "function userCollateral(address account, address asset) view returns (uint128 balance, uint128 _reserved)",
  "function isBorrowCollateralized(address account) view returns (bool)",
  "function isLiquidatable(address account) view returns (bool)",
]);
const erc20Abi = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

const SECONDS_PER_YEAR = 31_536_000;
const FACTOR = 1e18; // Comet factors (BCF/LCF/liquidationFactor) are 1e18-scaled
const PRICE = 1e8; // getPrice returns 8-decimal values in the market's quote unit

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function apiPositions(wallet) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/compound/positions?wallet=${wallet}&limit=10`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.rows ?? null; // raw backend rows: baseFinalRaw / currentBaseRaw / collateral[{asset, amountRaw}]
}

async function verifyMarket(m) {
  console.log(`\n== Market ${m.key} (${m.comet}) ==`);
  const at = (functionName, args = []) => client.readContract({ address: m.comet, abi: cometAbi, functionName, args });

  const [baseToken, baseScale, baseFeed, baseBorrowMin, numAssets, utilization, totalSupply, totalBorrow] =
    await Promise.all([
      at("baseToken"),
      at("baseScale"),
      at("baseTokenPriceFeed"),
      at("baseBorrowMin"),
      at("numAssets"),
      at("getUtilization"),
      at("totalSupply"),
      at("totalBorrow"),
    ]);

  check(`${m.key}: baseToken matches catalog`, baseToken.toLowerCase() === m.baseToken, baseToken);
  check(
    `${m.key}: baseScale == 10^baseDecimals`,
    baseScale === BigInt("1" + "0".repeat(m.baseDecimals)),
    baseScale.toString(),
  );

  const basePrice = Number(await at("getPrice", [baseFeed])) / PRICE;
  check(
    `${m.key}: base price ~= 1.0 in its own quote unit`,
    Math.abs(basePrice - 1) < 0.02,
    `${basePrice} (quote unit = ${m.key === "weth" ? "ETH" : "USD"})`,
  );
  console.log(`      baseBorrowMin = ${Number(baseBorrowMin) / Number(baseScale)} base tokens`);

  const [supplyRate, borrowRate] = await Promise.all([
    at("getSupplyRate", [utilization]),
    at("getBorrowRate", [utilization]),
  ]);
  const supplyApr = (Number(supplyRate) * SECONDS_PER_YEAR) / FACTOR;
  const borrowApr = (Number(borrowRate) * SECONDS_PER_YEAR) / FACTOR;
  const utilFrac = Number(utilization) / FACTOR;
  const utilFromTotals = totalSupply > 0n ? Number(totalBorrow) / Number(totalSupply) : 0;
  check(
    `${m.key}: rates sane (supply < borrow, both in (0, 50%))`,
    supplyApr > 0 && borrowApr > supplyApr && borrowApr < 0.5,
    `supply ${(supplyApr * 100).toFixed(2)}% / borrow ${(borrowApr * 100).toFixed(2)}% @ util ${(utilFrac * 100).toFixed(1)}%`,
  );
  check(
    `${m.key}: getUtilization == totalBorrow/totalSupply`,
    Math.abs(utilFrac - utilFromTotals) < 0.005,
    `${utilFrac.toFixed(4)} vs ${utilFromTotals.toFixed(4)}`,
  );

  // Asset enumeration + per-asset invariants.
  const infos = await Promise.all(Array.from({ length: Number(numAssets) }, (_, i) => at("getAssetInfo", [i])));
  const metas = await Promise.all(
    infos.map((a) =>
      Promise.all([
        client.readContract({ address: a.asset, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
        client.readContract({ address: a.asset, abi: erc20Abi, functionName: "decimals" }),
      ]),
    ),
  );
  let enumOk = true;
  let factorsOk = true;
  infos.forEach((a, i) => {
    const [symbol, decimals] = metas[i];
    if (a.offset !== i || a.scale !== BigInt("1" + "0".repeat(decimals))) enumOk = false;
    const bcf = Number(a.borrowCollateralFactor) / FACTOR;
    const lcf = Number(a.liquidateCollateralFactor) / FACTOR;
    const lf = Number(a.liquidationFactor) / FACTOR;
    // Governance deprecates collateral by setting BCF = 0 (no new borrowing
    // against it) while LCF stays > 0 (still liquidation-eligible) — verified
    // live on deUSD/rsETH/USDe/wUSDM. So the contract invariant is BCF <= LCF,
    // NOT BCF > 0; borrow capacity and liquidation capacity legitimately
    // diverge, and the surfaces must sum them separately.
    if (!(bcf <= lcf && lcf <= 1 && lf <= 1)) factorsOk = false;
    console.log(
      `      asset[${i}] ${symbol}: BCF ${bcf} / LCF ${lcf} / liqFactor ${lf} (scale 10^${decimals})${bcf === 0 ? " [borrowing deprecated]" : ""}`,
    );
  });
  check(`${m.key}: getAssetInfo offsets ordinal + scale == 10^decimals`, enumOk, `${infos.length} assets`);
  check(`${m.key}: BCF <= LCF <= 1 and liquidationFactor <= 1 for all assets (BCF 0 = deprecated)`, factorsOk);

  return { infos, metas, baseFeed, baseScale };
}

async function verifyAccount(sample, marketCtx) {
  const m = MARKETS.find((x) => x.key === sample.market);
  const { infos, metas, baseFeed } = marketCtx[sample.market];
  const account = getAddress(sample.account);
  console.log(`\n== Account ${sample.account} in ${sample.market} ==`);
  const at = (functionName, args) => client.readContract({ address: m.comet, abi: cometAbi, functionName, args });

  const [supply, borrow, basic, collateralized, liquidatable, basePriceRaw] = await Promise.all([
    at("balanceOf", [account]),
    at("borrowBalanceOf", [account]),
    at("userBasic", [account]),
    at("isBorrowCollateralized", [account]),
    at("isLiquidatable", [account]),
    at("getPrice", [baseFeed]),
  ]);
  const [principal, , , assetsIn] = basic;

  check(
    `${sample.market}/${sample.account.slice(0, 8)}: at most one of balanceOf/borrowBalanceOf nonzero`,
    supply === 0n || borrow === 0n,
    `supply ${supply} / borrow ${borrow}`,
  );
  check(
    `${sample.market}/${sample.account.slice(0, 8)}: userBasic.principal sign agrees with side`,
    (borrow > 0n && principal < 0n) || (supply > 0n && principal > 0n) || (supply === 0n && borrow === 0n),
    `principal ${principal}`,
  );

  // Per-asset: collateralBalanceOf == userCollateral.balance; assetsIn bit <-> nonzero.
  const perAsset = await Promise.all(
    infos.map((a) =>
      Promise.all([
        at("collateralBalanceOf", [account, a.asset]),
        at("userCollateral", [account, a.asset]),
        at("getPrice", [a.priceFeed]),
      ]),
    ),
  );
  let mirrorOk = true;
  let bitmaskOk = true;
  let liqCapacity = 0; // SUM coll x price x LCF, quote units
  let borrowCapacity = 0; // SUM coll x price x BCF
  perAsset.forEach(([bal, uc, priceRaw], i) => {
    if (bal !== uc[0]) mirrorOk = false;
    const bitSet = (Number(assetsIn) & (1 << i)) !== 0;
    if (bitSet !== bal > 0n) bitmaskOk = false;
    const a = infos[i];
    const units = Number(bal) / Number(a.scale);
    const price = Number(priceRaw) / PRICE;
    liqCapacity += units * price * (Number(a.liquidateCollateralFactor) / FACTOR);
    borrowCapacity += units * price * (Number(a.borrowCollateralFactor) / FACTOR);
    if (bal > 0n) console.log(`      ${metas[i][0]}: ${units} @ ${price}`);
  });
  check(`${sample.market}/${sample.account.slice(0, 8)}: collateralBalanceOf == userCollateral.balance`, mirrorOk);
  check(`${sample.market}/${sample.account.slice(0, 8)}: assetsIn bitmask <-> nonzero balances`, bitmaskOk);

  const baseScale = Number(marketCtx[sample.market].baseScale);
  const debtValue = (Number(borrow) / baseScale) * (Number(basePriceRaw) / PRICE);
  if (borrow > 0n) {
    const hf = liqCapacity / debtValue;
    check(
      `${sample.market}/${sample.account.slice(0, 8)}: computed health agrees with isLiquidatable`,
      liquidatable === hf < 1,
      `HF ${hf.toFixed(4)}, isLiquidatable ${liquidatable}`,
    );
    check(
      `${sample.market}/${sample.account.slice(0, 8)}: borrow capacity agrees with isBorrowCollateralized`,
      collateralized === borrowCapacity >= debtValue,
      `capacity ${borrowCapacity.toFixed(2)} vs debt ${debtValue.toFixed(2)}, collateralized ${collateralized}`,
    );
  } else {
    check(
      `${sample.market}/${sample.account.slice(0, 8)}: no debt -> collateralized, not liquidatable`,
      collateralized && !liquidatable,
    );
  }

  // Index agreement (skipped without API creds).
  const rows = await apiPositions(sample.account);
  const row = rows?.find((r) => r.market === sample.market);
  if (row) {
    if (row.collateral?.length) {
      const byAddr = new Map(perAsset.map(([bal], i) => [infos[i].asset.toLowerCase(), bal]));
      const replayExact = row.collateral.every((c) => byAddr.get(c.asset) === BigInt(c.amountRaw));
      check(
        `${sample.market}/${sample.account.slice(0, 8)}: event-replay collateral wei-exact vs chain`,
        replayExact,
        row.collateral.map((c) => c.amountRaw).join(", "),
      );
    }
    if (row.currentBaseRaw != null && row.chainStale !== true) {
      const overlay = BigInt(row.currentBaseRaw); // signed: balanceOf − borrowBalanceOf at refresh
      const live = supply - borrow;
      const drift =
        overlay === 0n ? (live === 0n ? 0 : 1) : Math.abs(Number(live - overlay)) / Math.abs(Number(overlay));
      check(
        `${sample.market}/${sample.account.slice(0, 8)}: overlay base within accrual drift of live read`,
        drift < 0.001,
        `overlay ${overlay} vs live ${live} (drift ${(drift * 100).toFixed(4)}%)`,
      );
    }
  } else {
    console.log("      (no live-index row — API creds missing or row absent; index checks skipped)");
  }
}

const marketCtx = {};
for (const m of MARKETS) {
  marketCtx[m.key] = await verifyMarket(m);
  await pause(1_500);
}
for (const s of SAMPLES) {
  await verifyAccount(s, marketCtx);
  await pause(1_500);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
