// Verify the Aave V4 on BASE (chain 8453) position/reserve facts the explorer
// renders as primary truth. Base carries one hub (Equities) and one spoke
// (Mag7: seven Coinbase tokenized stocks as collateral, USDC to borrow) —
// this is the Ethereum Aave V4 verifier's own checks
// (scripts/verify-aave-v4-chain.mjs), cut down to one spoke and one hub, plus
// the parameters that verifier has no Ethereum analogue for: the hub's
// per-reserve caps and the USDC drawn rate, both exposed cleanly on this
// deployment's hub (`getSpokeConfig` / `getSpokeAddedAssets` /
// `getSpokeTotalOwed` / `getAssetDrawnRate`, read the same way
// rails-server-onboarding's workers/base-lending-copy/src/snapshot-aave-v4.mjs
// reads them — that file is the ABI's source, since the struct shapes are not
// published: `getReserve`/`getReserveConfig`/`getDynamicReserveConfig`/
// `getLiquidationConfig` were checked against it by hand, 2026-09-27).
//
// Deliberately NOT checked, and why:
//   • Coinbase's tokenized-stock registry pause flag. The spoke does not read
//     it (rails-ops/reference/aave-v4-base.md §6) and it has its own verifier,
//     rails-server-onboarding/scripts/verify-aave-v4-base-registry-pause.mjs.
//   • Liquidation events, for the same reason as the Ethereum verifier: V4
//     liquidation event coverage has known gaps, so no check depends on
//     events the protocol may not have emitted.
//   • Reserve LT ↔ position CF and the collateral-USD-weighted avgCF identity
//     ARE checked (Ethereum's checks 4b/5), because both read cleanly here.
//
// Run: node scripts/verify-aave-v4-base-chain.mjs
// Env: .env.local — BASE_RPC_URL (chain reads); RAILS_API_URL +
//      API_BEARER_TOKEN (the served /reserves and /spoke-positions
//      cross-checks; their absence downgrades those checks to a stated skip —
//      the chain-only checks 1 and 2 still run and gate exit).

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
if (!env.BASE_RPC_URL) throw new Error("BASE_RPC_URL missing from .env.local");

const c = createPublicClient({
  chain: base,
  batch: { multicall: { wait: 40 } },
  transport: http(env.BASE_RPC_URL, { retryCount: 8, retryDelay: 1_000 }),
});

// rails-ops/reference/aave-v4-base.md §1 — confirmed on chain there.
const SPOKE = getAddress("0x17905db0e4a3514467539956c084180616ae7b8d");
const HUB = getAddress("0xa4d5947eb727a052bae69c593ffc84247ec9864e");

const SPOKE_ABI = parseAbi([
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId) view returns ((address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))",
  "function getReserveConfig(uint256 reserveId) view returns ((uint24 collateralRisk, bool paused, bool frozen, bool borrowable, bool receiveSharesEnabled))",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 key) view returns ((uint16 collateralFactor, uint32 maxLiquidationBonus, uint16 liquidationFee))",
  "function getLiquidationConfig() view returns ((uint128 targetHealthFactor, uint64 healthFactorForMaxBonus, uint16 liquidationBonusFactor))",
  "function ORACLE() view returns (address)",
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 reserveId, address user) view returns (uint256)",
  "function getUserReserveStatus(uint256 reserveId, address user) view returns (bool isCollateral, bool hasBorrow)",
]);
const HUB_ABI = parseAbi([
  "function getSpokeConfig(uint256 assetId, address spoke) view returns ((uint40 addCap, uint40 drawCap, uint24 riskPremiumThreshold, bool active, bool halted))",
  "function getSpokeAddedAssets(uint256 assetId, address spoke) view returns (uint256)",
  "function getSpokeTotalOwed(uint256 assetId, address spoke) view returns (uint256)",
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
]);
const ORACLE_ABI = parseAbi([
  "function getReservePrice(uint256 reserveId) view returns (uint256)",
  "function getReserveSource(uint256 reserveId) view returns (address)",
]);

const BPS = 10_000;
const WAD = 1e18;
const RAY = 1e27;
let failures = 0;
let skips = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const skip = (name, reason) => {
  console.log(`SKIP  ${name} — ${reason}`);
  skips++;
};
const rel = (a, b) => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a / b - 1));
const read = (address, abi, fn, args = []) => c.readContract({ address, abi, functionName: fn, args });

// ── API-dependent checks ─────────────────────────────────────────────────────
const apiBase = env.RAILS_API_URL;
const apiHeaders = env.API_BEARER_TOKEN ? { Authorization: `Bearer ${env.API_BEARER_TOKEN}` } : {};
async function apiGet(path) {
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}${path}`, { headers: apiHeaders });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 1. Address graph ─────────────────────────────────────────────────────────
console.log("## 1. Address graph");
const count = Number(await read(SPOKE, SPOKE_ABI, "getReserveCount"));
check("Mag7 spoke is live, getReserveCount > 0", count > 0, `${count} reserves`);
const oracle = await read(SPOKE, SPOKE_ABI, "ORACLE");
const hubCode = await c.getCode({ address: HUB });
check("Equities hub has deployed code", Boolean(hubCode) && hubCode !== "0x");

const ids = Array.from({ length: count }, (_, i) => BigInt(i));
const metas = await Promise.all(ids.map((id) => read(SPOKE, SPOKE_ABI, "getReserve", [id])));
check(
  "every reserve names the Equities hub",
  metas.every((r) => getAddress(r.hub) === HUB),
  `${metas.length} reserves, hubs: ${[...new Set(metas.map((r) => getAddress(r.hub)))].join(", ")}`,
);

const cfgs = await Promise.all(ids.map((id) => read(SPOKE, SPOKE_ABI, "getReserveConfig", [id])));
const dyns = await Promise.all(
  metas.map((r, i) => read(SPOKE, SPOKE_ABI, "getDynamicReserveConfig", [ids[i], r.dynamicConfigKey])),
);
const reserves = ids.map((id, i) => ({ id: Number(id), meta: metas[i], cfg: cfgs[i], dyn: dyns[i] }));

// ── 2. Reserve config ────────────────────────────────────────────────────────
console.log("\n## 2. Reserve config");
check("reserve set non-empty", reserves.length > 0, `${reserves.length} reserves`);
const badCf = reserves.filter((r) => !(r.dyn.collateralFactor >= 0 && r.dyn.collateralFactor <= BPS));
check(
  "every reserve collateralFactor in [0, 100%]",
  badCf.length === 0,
  badCf.length === 0 ? `${reserves.length} reserves` : `${badCf.length} out of range`,
);
const collateralEnabled = reserves.filter((r) => r.dyn.collateralFactor > 0);
check(
  "collateral-enabled reserve set non-empty",
  collateralEnabled.length > 0,
  `${collateralEnabled.length} of ${reserves.length}`,
);
const badLiq = collateralEnabled.filter(
  (r) =>
    !(
      r.dyn.maxLiquidationBonus >= BPS &&
      r.dyn.maxLiquidationBonus < 3 * BPS &&
      r.dyn.liquidationFee >= 0 &&
      r.dyn.liquidationFee < BPS
    ),
);
check(
  "every collateral-enabled reserve: liqBonus∈[100%,300%), liqFee∈[0,100%)",
  badLiq.length === 0,
  badLiq.length === 0
    ? `${collateralEnabled.length} reserves`
    : `e.g. reserve ${badLiq[0].id} liqBonus=${badLiq[0].dyn.maxLiquidationBonus} liqFee=${badLiq[0].dyn.liquidationFee}`,
);
// Aave's announcement: seven stocks are collateral-only, USDC the one
// borrowable asset (rails-ops/reference/aave-v4-base.md §1).
const borrowable = reserves.filter((r) => r.cfg.borrowable);
check(
  "exactly one borrowable reserve (USDC)",
  borrowable.length === 1,
  `${borrowable.length} borrowable: ${borrowable.map((r) => r.id).join(",")}`,
);
if (borrowable.length === 1) {
  check(
    "the borrowable reserve carries 0% collateralFactor",
    borrowable[0].dyn.collateralFactor === 0,
    `cf=${borrowable[0].dyn.collateralFactor}`,
  );
}
check(
  "no reserve paused or frozen at head",
  reserves.every((r) => !r.cfg.paused && !r.cfg.frozen),
  reserves
    .filter((r) => r.cfg.paused || r.cfg.frozen)
    .map((r) => r.id)
    .join(","),
);

// ── 3. Liquidation config vs served ──────────────────────────────────────────
console.log("\n## 3. Liquidation config");
const liq = await read(SPOKE, SPOKE_ABI, "getLiquidationConfig");
check(
  "getLiquidationConfig well-formed: targetHF ≥ 1, HFforMaxBonus < targetHF, bonusFactor ≤ 100%",
  Number(liq.targetHealthFactor) / WAD >= 1 &&
    Number(liq.healthFactorForMaxBonus) / WAD < Number(liq.targetHealthFactor) / WAD &&
    liq.liquidationBonusFactor <= BPS,
  `target ${(Number(liq.targetHealthFactor) / WAD).toFixed(4)}, maxBonusHF ${(Number(liq.healthFactorForMaxBonus) / WAD).toFixed(4)}, bonusFactor ${liq.liquidationBonusFactor / BPS}`,
);
let servedByAddr = null;
const served = await apiGet("/api/aave-v4-base/reserves");
if (!served || !Array.isArray(served.reserves) || !Array.isArray(served.spokes)) {
  skip("liquidation config vs served", "/api/aave-v4-base/reserves unreachable or malformed");
  skip("reserve config vs served", "/api/aave-v4-base/reserves unreachable or malformed");
  skip("hub caps/size vs served", "/api/aave-v4-base/reserves unreachable or malformed");
  skip("oracle vs served", "/api/aave-v4-base/reserves unreachable or malformed");
} else {
  const spokeRow = served.spokes.find((s) => s.spoke === "mag7");
  if (!spokeRow) {
    skip("liquidation config vs served", "served spokes[] carries no mag7 row");
  } else {
    check(
      "chain getLiquidationConfig matches served spoke row",
      rel(Number(liq.targetHealthFactor) / WAD, spokeRow.targetHealthFactor) < 1e-4 &&
        rel(Number(liq.healthFactorForMaxBonus) / WAD, spokeRow.healthFactorForMaxBonus) < 1e-4 &&
        liq.liquidationBonusFactor === spokeRow.liquidationBonusFactorBps,
      `chain target ${Number(liq.targetHealthFactor) / WAD} maxBonusHF ${Number(liq.healthFactorForMaxBonus) / WAD} bonusFactorBps ${liq.liquidationBonusFactor} vs served ${spokeRow.targetHealthFactor} ${spokeRow.healthFactorForMaxBonus} ${spokeRow.liquidationBonusFactorBps}`,
    );
  }

  // ── 2b. Reserve config vs served (address-keyed, chain the anchor) ──
  console.log("\n## 2b. Reserve config vs served");
  servedByAddr = new Map(served.reserves.filter((r) => r.spoke === "mag7").map((r) => [r.underlying.toLowerCase(), r]));
  let mismatches = [];
  for (const r of reserves) {
    const addr = r.meta.underlying.toLowerCase();
    const s = servedByAddr.get(addr);
    if (!s) {
      mismatches.push(`reserve ${r.id} (${addr}) not served`);
      continue;
    }
    const ok =
      s.collateralFactorBps === r.dyn.collateralFactor &&
      s.maxLiquidationBonusBps === r.dyn.maxLiquidationBonus &&
      s.liquidationFeeBps === r.dyn.liquidationFee &&
      s.borrowable === r.cfg.borrowable &&
      s.paused === r.cfg.paused &&
      s.frozen === r.cfg.frozen;
    if (!ok)
      mismatches.push(
        `reserve ${r.id} ${s.symbol}: chain cf=${r.dyn.collateralFactor}/bonus=${r.dyn.maxLiquidationBonus}/fee=${r.dyn.liquidationFee} vs served ${s.collateralFactorBps}/${s.maxLiquidationBonusBps}/${s.liquidationFeeBps}`,
      );
  }
  check(
    "every reserve's config matches served",
    mismatches.length === 0,
    mismatches.length === 0 ? `${reserves.length} reserves` : mismatches.slice(0, 2).join("; "),
  );

  // ── 4. Hub caps/size vs served ──
  console.log("\n## 4. Hub caps and size");
  const spokeCfgs = await Promise.all(
    reserves.map((r) => read(HUB, HUB_ABI, "getSpokeConfig", [BigInt(r.meta.assetId), SPOKE])),
  );
  const added = await Promise.all(
    reserves.map((r) => read(HUB, HUB_ABI, "getSpokeAddedAssets", [BigInt(r.meta.assetId), SPOKE])),
  );
  const owed = await Promise.all(
    reserves.map((r) => read(HUB, HUB_ABI, "getSpokeTotalOwed", [BigInt(r.meta.assetId), SPOKE])),
  );
  let capMismatches = [];
  let sizeMismatches = [];
  reserves.forEach((r, i) => {
    const s = servedByAddr.get(r.meta.underlying.toLowerCase());
    if (!s) return;
    const sc = spokeCfgs[i];
    if (
      Number(sc.addCap) !== Number(s.addCap) ||
      Number(sc.drawCap) !== Number(s.drawCap) ||
      sc.active !== s.spokeActive ||
      sc.halted !== s.spokeHalted
    )
      capMismatches.push(
        `reserve ${r.id} ${s.symbol}: chain addCap=${sc.addCap} drawCap=${sc.drawCap} active=${sc.active} halted=${sc.halted} vs served ${s.addCap}/${s.drawCap}/${s.spokeActive}/${s.spokeHalted}`,
      );
    // Live totals can drift a few wei between this read and the served read —
    // both are live chain reads (rails-ops/reference/aave-v4-base.md §5), not
    // the same snapshot. 0.5% is generous against that drift and still catches
    // a wrong-asset or wrong-unit mistake.
    const addedOk = rel(Number(added[i]), Number(s.addedRaw)) < 0.005 || (added[i] === 0n && s.addedRaw === "0");
    const owedOk = rel(Number(owed[i]), Number(s.owedRaw)) < 0.005 || (owed[i] === 0n && s.owedRaw === "0");
    if (!addedOk || !owedOk)
      sizeMismatches.push(
        `reserve ${r.id} ${s.symbol}: chain added=${added[i]} owed=${owed[i]} vs served ${s.addedRaw}/${s.owedRaw}`,
      );
  });
  check(
    "every reserve's hub caps match served",
    capMismatches.length === 0,
    capMismatches.length === 0 ? `${reserves.length} reserves` : capMismatches.slice(0, 2).join("; "),
  );
  check(
    "every reserve's hub added/owed ≈ served (0.5%)",
    sizeMismatches.length === 0,
    sizeMismatches.length === 0 ? `${reserves.length} reserves` : sizeMismatches.slice(0, 2).join("; "),
  );

  // USDC (the one borrowable reserve) is the only one with a non-zero drawn
  // rate; the hub exposes it directly (unlike Ethereum's hub, where no
  // standalone getter is discoverable — see the header).
  const usdc = reserves.find((r) => r.cfg.borrowable);
  if (usdc) {
    const rate = await read(HUB, HUB_ABI, "getAssetDrawnRate", [BigInt(usdc.meta.assetId)]);
    const s = servedByAddr.get(usdc.meta.underlying.toLowerCase());
    if (s?.drawnRateRay != null) {
      check(
        "USDC's drawn rate matches served drawnRateRay",
        rel(Number(rate), Number(s.drawnRateRay)) < 0.01,
        `chain ${(Number(rate) / RAY).toFixed(6)} vs served ${(Number(s.drawnRateRay) / RAY).toFixed(6)} (ray)`,
      );
    } else skip("USDC drawn rate vs served", "served reserve carries no drawnRateRay");
  }

  // ── 5. Oracle vs served ──
  console.log("\n## 5. Oracle");
  const prices = await Promise.all(reserves.map((r) => read(oracle, ORACLE_ABI, "getReservePrice", [BigInt(r.id)])));
  const sources = await Promise.all(reserves.map((r) => read(oracle, ORACLE_ABI, "getReserveSource", [BigInt(r.id)])));
  let priceMismatches = [];
  reserves.forEach((r, i) => {
    const s = servedByAddr.get(r.meta.underlying.toLowerCase());
    if (!s) return;
    const priceOk = rel(Number(prices[i]), Number(s.priceRaw)) < 0.01;
    const sourceOk = getAddress(sources[i]) === getAddress(s.priceSource);
    if (!priceOk || !sourceOk)
      priceMismatches.push(
        `reserve ${r.id} ${s.symbol}: chain price=${prices[i]} src=${sources[i]} vs served ${s.priceRaw}/${s.priceSource}`,
      );
  });
  check(
    "every reserve's oracle price and source match served",
    priceMismatches.length === 0,
    priceMismatches.length === 0 ? `${reserves.length} reserves` : priceMismatches.slice(0, 2).join("; "),
  );
}

// ── Sample a real position for checks 6–8 ────────────────────────────────────
console.log("\n## 6–8. Sampled position (chain re-derivation)");
const positions = await apiGet(
  "/api/aave-v4-base/spoke-positions?spokes=mag7&hasDebt=true&sortBy=debt&sortOrder=desc&limit=1",
);
const sample = positions?.rows?.[0] ?? null;
if (!sample) {
  skip("position checks 6–8", "/api/aave-v4-base/spoke-positions unreachable or returned no position with debt");
} else {
  const wallet = getAddress(sample.wallet);
  const acct = await read(SPOKE, SPOKE_ABI, "getUserAccountData", [wallet]);
  const [, avgCfRaw, hfRaw, collValRaw, debtRayRaw, , borrowCount] = acct;
  check(`sample ${wallet.slice(0, 10)} has debt on chain`, borrowCount > 0n, `borrowCount ${borrowCount}`);

  const bals = await Promise.all(
    reserves.map(async (r) => {
      const [sup, debt, st] = await Promise.all([
        read(SPOKE, SPOKE_ABI, "getUserSuppliedAssets", [BigInt(r.id), wallet]),
        read(SPOKE, SPOKE_ABI, "getUserTotalDebt", [BigInt(r.id), wallet]),
        read(SPOKE, SPOKE_ABI, "getUserReserveStatus", [BigInt(r.id), wallet]),
      ]);
      return { ...r, sup, debt, isCollateral: st[0] };
    }),
  );
  const touched = bals.filter((b) => b.sup > 0n || b.debt > 0n);

  // ── 6. Health-factor identity + indexed match ──
  const avgCf = Number(avgCfRaw) / WAD;
  const chainHf = (Number(collValRaw) * avgCf) / (Number(debtRayRaw) / RAY);
  const structHf = Number(hfRaw) / WAD;
  check(
    "HF == totalCollateralValue × avgCollateralFactor ÷ totalDebtValue (chain identity)",
    Number.isFinite(chainHf) && rel(chainHf, structHf) < 0.005,
    `recomputed ${chainHf.toFixed(4)} vs struct ${structHf.toFixed(4)}`,
  );
  if (sample.healthFactor != null)
    check(
      "chain HF matches indexed healthFactor",
      rel(structHf, sample.healthFactor) < 0.03,
      `chain ${structHf.toFixed(4)} vs indexed ${sample.healthFactor.toFixed(4)}`,
    );
  else skip("chain HF vs indexed", "indexed healthFactor is null");

  // ── 7. Reserve CF ↔ position: chain-weighted avgCF and reserves[].lt ──
  const collateral = touched.filter((b) => b.isCollateral && b.sup > 0n);
  check("sample has collateral to weight", collateral.length > 0, `${collateral.length} collateral reserves`);
  if (collateral.length > 0) {
    let usdSum = 0;
    let cfWeighted = 0;
    for (const b of collateral) {
      const s = servedByAddr?.get(b.meta.underlying.toLowerCase());
      const p = s?.priceRaw != null ? Number(s.priceRaw) / 10 ** (s.priceDecimals ?? 8) : null;
      if (p == null) continue;
      const usd = (Number(b.sup) / 10 ** b.meta.decimals) * p;
      usdSum += usd;
      cfWeighted += usd * (Number(b.dyn.collateralFactor) / BPS);
    }
    if (usdSum > 0)
      check(
        "collateral-USD-weighted mean cf == getUserAccountData.avgCollateralFactor",
        rel(cfWeighted / usdSum, avgCf) < 0.01,
        `weighted ${(cfWeighted / usdSum).toFixed(6)} vs avgCF ${avgCf.toFixed(6)}`,
      );
    else skip("cf-weighting identity", "no priced collateral reserve (served /reserves unreachable)");
  }
  const idxByAddr = new Map((sample.reserves ?? []).map((r) => [r.address.toLowerCase(), r]));
  const ltPairs = reserves
    .map((r) => ({ r, idx: idxByAddr.get(r.meta.underlying.toLowerCase()) }))
    .filter((p) => p.idx && p.idx.lt != null && p.r.dyn.collateralFactor > 0);
  check(
    "indexed reserves carry an lt to compare",
    ltPairs.length > 0,
    `${ltPairs.length} collateral-enabled reserves with indexed lt`,
  );
  if (ltPairs.length > 0) {
    const bad = ltPairs.filter((p) => Math.abs(p.r.dyn.collateralFactor / BPS - p.idx.lt) > 1e-4);
    check(
      "chain collateralFactor (cf/1e4) == indexed reserves[].lt",
      bad.length === 0,
      bad.length === 0
        ? `${ltPairs.length} reserves match`
        : `${bad.length} differ, e.g. ${bad[0].idx.symbol} chain ${bad[0].r.dyn.collateralFactor / BPS} vs idx ${bad[0].idx.lt}`,
    );
  }

  // ── 8. Oracle valuation vs Σ(balance × oracle price), and vs indexed totals ──
  let collUsd = 0;
  let debtUsd = 0;
  let fullyPriced = true;
  for (const b of touched) {
    const needsPrice = (b.isCollateral && b.sup > 0n) || b.debt > 0n;
    if (!needsPrice) continue;
    const s = servedByAddr?.get(b.meta.underlying.toLowerCase());
    const p = s?.priceRaw != null ? Number(s.priceRaw) / 10 ** (s.priceDecimals ?? 8) : null;
    if (p == null) {
      fullyPriced = false;
      break;
    }
    if (b.isCollateral && b.sup > 0n) collUsd += (Number(b.sup) / 10 ** b.meta.decimals) * p;
    if (b.debt > 0n) debtUsd += (Number(b.debt) / 10 ** b.meta.decimals) * p;
  }
  if (!fullyPriced) {
    skip(
      "oracle valuation reconciliation",
      "served /reserves unreachable, so no independent price for a touched reserve",
    );
  } else if (debtUsd <= 0 || collUsd <= 0) {
    skip("oracle valuation reconciliation", "sampled position has no priced collateral or debt");
  } else {
    const protoRatio = Number(collValRaw) / (Number(debtRayRaw) / RAY);
    const clRatio = collUsd / debtUsd;
    check(
      "protocol coll/debt value ratio == Σ(balance × oracle price) ratio",
      rel(protoRatio, clRatio) < 0.01,
      `protocol ${protoRatio.toFixed(4)} vs oracle prices ${clRatio.toFixed(4)} (${(rel(protoRatio, clRatio) * 100).toFixed(3)}%)`,
    );
    if (sample.totalSupplyUsd != null)
      check(
        "Σ oracle-priced collateral USD ≈ indexed totalSupplyUsd",
        rel(collUsd, sample.totalSupplyUsd) < 0.03,
        `chain $${collUsd.toFixed(2)} vs indexed $${sample.totalSupplyUsd.toFixed(2)}`,
      );
    if (sample.totalDebtUsd != null)
      check(
        "Σ oracle-priced debt USD ≈ indexed totalDebtUsd",
        rel(debtUsd, sample.totalDebtUsd) < 0.03,
        `chain $${debtUsd.toFixed(2)} vs indexed $${sample.totalDebtUsd.toFixed(2)}`,
      );
  }
}

console.log(
  `\n${failures === 0 ? "ALL CHAIN CHECKS PASS" : `${failures} CHECK(S) FAILED`}${skips ? ` (${skips} skipped — stated reason above)` : ""}`,
);
process.exit(failures === 0 ? 0 : 1);
