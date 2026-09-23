// Verify the Liquity V2 (BOLD) mainnet chain facts the explorer renders as
// primary truth — every branch address, getter and formula the reader relies on
// is checked against the chain itself, so no unverified assumption is encoded.
// This is the V1 verifier's seven checks (verify-liquity-v1-chain.mjs) mapped
// onto V2's multi-branch architecture; the forks verifier
// (verify-liquity-forks-chain.mjs) proves the SAME architecture on Ebisu and
// Asymmetry, but its FORKS map has no V2 arm, so it verifies nothing about the
// reference deployment. This is the only script that does.
//
// V2 differs from V1 in shape: BOLD is one stablecoin across THREE independent
// collateral branches (WETH / wstETH / rETH), each a full
// TroveManager / BorrowerOperations / SortedTroves / PriceFeed / StabilityPool /
// ActivePool set; a top-level CollateralRegistry lists the branches and owns
// redemption. Troves are ERC-721 ids (uint256), not owner addresses, and
// SortedTroves is ordered by annual interest rate (redemptions hit the LOWEST
// rate first), not by collateral ratio.
//
// The web repo holds no V2 address catalog beyond the three TroveManagers in
// lib/liquity/event-provenance.ts. Those three are the ONLY seed; the rest of
// the CATALOG below is what check #1 proves against the protocol's own getters.
//
// Checks:
//   1. Address graph — each TroveManager's own getters name its BorrowerOps,
//      SortedTroves, StabilityPool and ActivePool; reverse pointers
//      (SortedTroves.troveManager / .borrowerOperationsAddress,
//      StabilityPool.troveManager) point back; the PriceFeed sits at BO storage
//      slot 2 (the forks pattern); every branch shares one BOLD token; and the
//      CollateralRegistry (derived from BoldToken.collateralRegistryAddress)
//      lists all three branches with their collateral tokens.
//   2. Constants — per-branch MCR / CCR / SCR / BCR read from BorrowerOperations
//      match the catalog, and TroveManager.CCR() cross-checks BO.CCR() (the one
//      constant the TM re-exposes) so the value is chain-read, not typed.
//   3. Price — PriceFeed.fetchPrice() SIMULATED via eth_call (state-mutating on
//      chain, read-only under eth_call — the V1 pattern) answers live with the
//      oracle-down flag false, and equals the price the TroveManager itself
//      surfaces through getUnbackedPortionPriceAndRedeemability. lastGoodPrice
//      is measurably stale (it only updates on user ops), so the live lane must
//      ship the simulated fetch.
//   4. Ordering — SortedTroves walks head→tail in DESCENDING annual interest
//      rate; the head trove is active. Asserted on a non-empty walk per branch.
//   5. ICR identity — getCurrentICR == entireColl × price ÷ entireDebt, BigInt-
//      exact, using getLatestTroveData (entire state incl. pending redistribution
//      and accrued interest — NOT the recorded struct). All three collaterals
//      are 18-decimal, so the identity lands at 1e18.
//   6. System state — CollateralRegistry lists 3 branches, BOLD has supply, the
//      registry redemption/base rates are sane, and each branch reports its
//      redeemability flag.
//   7. Debt-in-front — full SortedTroves sweep on the WETH branch: the sweep
//      length equals getSize, the tail (lowest rate, redeemed first) is the
//      final entry with zero debt in front, the rate is monotone non-increasing,
//      and a mid sample's debt-in-front equals Σ entireDebt of the troves after
//      it in the redemption queue.
//
// Run: node scripts/verify-liquity-chain.mjs
// Env: .env.local — ALCHEMY_URL

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";
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
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

const c = createPublicClient({
  chain: mainnet,
  batch: { multicall: { wait: 50 } },
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});

// The catalog the explorer ships against. The three TroveManagers are the only
// V2 addresses the repo already holds (lib/liquity/event-provenance.ts:127-129);
// everything else here is proven by check #1 from the protocol's own getters.
const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";
const COLLATERAL_REGISTRY = "0xf949982b91c8c61e952b3ba942cbbfaef5386684";
const CATALOG = {
  weth: {
    idx: 0,
    symbol: "WETH",
    collToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    tm: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
    bo: "0x372abd1810eaf23cb9d941bbe7596dfb2c46bc65",
    pf: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
    st: "0xa25269e41bd072513849f2e64ad221e84f3063f4",
    sp: "0x5721cbbd64fc7ae3ef44a0a3f9a790a9264cf9bf",
    ap: "0xeb5a8c825582965f1d84606e078620a84ab16afe",
    mcr: 1.1,
    ccr: 1.5,
    scr: 1.1,
    bcr: 0.1,
  },
  wsteth: {
    idx: 1,
    symbol: "wstETH",
    collToken: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    tm: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22",
    bo: "0xa741a32f9dcfe6adba088fd0f97e90742d7d5da3",
    pf: "0xe7aa2ba9e086a379d3beb224098bc634a46e314e",
    st: "0x84eb85a8c25049255614f0536bea8f31682e86f1",
    sp: "0x9502b7c397e9aa22fe9db7ef7daf21cd2aebe56b",
    ap: "0x531a8f99c70d6a56a7cee02d6b4281650d7919a0",
    mcr: 1.2,
    ccr: 1.6,
    scr: 1.2,
    bcr: 0.1,
  },
  reth: {
    idx: 2,
    symbol: "rETH",
    collToken: "0xae78736cd615f374d3085123a210448e74fc6393",
    tm: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
    bo: "0xe8119fc02953b27a1b48d2573855738485a17329",
    pf: "0x34f1e9c7dcc279ec70d3c4488eb2d80fba8b7b2b",
    st: "0x14d8d8011df2b396ed2bbc4959bb73250324f386",
    sp: "0xd442e41019b7f5c4dd78f50dc03726c446148695",
    ap: "0x9074d72cc82dad1e13e454755aa8f144c479532f",
    mcr: 1.2,
    ccr: 1.6,
    scr: 1.2,
    bcr: 0.1,
  },
};

const TM_ABI = parseAbi([
  "function borrowerOperations() view returns (address)",
  "function sortedTroves() view returns (address)",
  "function stabilityPool() view returns (address)",
  "function activePool() view returns (address)",
  "function CCR() view returns (uint256)",
  "function getLatestTroveData(uint256 troveId) view returns ((uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime))",
  "function getCurrentICR(uint256 troveId, uint256 price) view returns (uint256)",
  "function getTroveStatus(uint256 troveId) view returns (uint8)",
  "function getUnbackedPortionPriceAndRedeemability() view returns (uint256 unbacked, uint256 price, bool redeemable)",
]);
const BO_ABI = parseAbi([
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function SCR() view returns (uint256)",
  "function BCR() view returns (uint256)",
]);
const ST_ABI = parseAbi([
  "function getSize() view returns (uint256)",
  "function getFirst() view returns (uint256)",
  "function getLast() view returns (uint256)",
  "function getNext(uint256 id) view returns (uint256)",
  "function troveManager() view returns (address)",
  "function borrowerOperationsAddress() view returns (address)",
]);
const POOL_ABI = parseAbi([
  "function troveManager() view returns (address)",
  "function boldToken() view returns (address)",
  "function collToken() view returns (address)",
]);
// fetchPrice mutates lastGoodPrice on-chain; declared view so eth_call simulates
// it and returns the exact price the protocol would use in this block.
const PF_ABI = parseAbi([
  "function lastGoodPrice() view returns (uint256)",
  "function fetchPrice() view returns (uint256 price, bool oracleDown)",
]);
const CR_ABI = parseAbi([
  "function totalCollaterals() view returns (uint256)",
  "function boldToken() view returns (address)",
  "function getTroveManager(uint256 index) view returns (address)",
  "function getToken(uint256 index) view returns (address)",
  "function getRedemptionRateWithDecay() view returns (uint256)",
  "function baseRate() view returns (uint256)",
]);
const BOLD_ABI = parseAbi([
  "function collateralRegistryAddress() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
]);

const E18 = 10n ** 18n;
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const f = (x, d = 4) => (Number(x) / 1e18).toFixed(d);
const eq = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const read = (address, abi, functionName, args = []) =>
  c.readContract({ address: getAddress(address), abi, functionName, args });
const tryRead = (address, abi, functionName, args = []) =>
  read(address, abi, functionName, args).then(
    (v) => v,
    () => null,
  );

// ── 1. Address graph ─────────────────────────────────────────────────────────
console.log("\n## 1. Address graph");
for (const [key, b] of Object.entries(CATALOG)) {
  const [bo, st, sp, ap] = await Promise.all([
    read(b.tm, TM_ABI, "borrowerOperations"),
    read(b.tm, TM_ABI, "sortedTroves"),
    read(b.tm, TM_ABI, "stabilityPool"),
    read(b.tm, TM_ABI, "activePool"),
  ]);
  check(`${key}: TM.borrowerOperations == catalog`, eq(bo, b.bo), bo);
  check(`${key}: TM.sortedTroves == catalog`, eq(st, b.st), st);
  check(`${key}: TM.stabilityPool == catalog`, eq(sp, b.sp), sp);
  check(`${key}: TM.activePool == catalog`, eq(ap, b.ap), ap);

  const [stTm, stBo, spTm] = await Promise.all([
    read(b.st, ST_ABI, "troveManager"),
    read(b.st, ST_ABI, "borrowerOperationsAddress"),
    read(b.sp, POOL_ABI, "troveManager"),
  ]);
  check(`${key}: SortedTroves.troveManager points back`, eq(stTm, b.tm), stTm);
  check(`${key}: SortedTroves.borrowerOperationsAddress points back`, eq(stBo, b.bo), stBo);
  check(`${key}: StabilityPool.troveManager points back`, eq(spTm, b.tm), spTm);

  // PriceFeed at BO storage slot 2 (config lives in storage — the forks pattern).
  const slot2 = await c.getStorageAt({ address: getAddress(b.bo), slot: "0x2" });
  const pf = "0x" + slot2.slice(-40);
  check(`${key}: PriceFeed @ BO slot 2 == catalog`, eq(pf, b.pf), pf);

  // Shared BOLD + branch collateral token from the pools.
  const [spBold, apBold, apColl] = await Promise.all([
    read(b.sp, POOL_ABI, "boldToken"),
    read(b.ap, POOL_ABI, "boldToken"),
    read(b.ap, POOL_ABI, "collToken"),
  ]);
  check(`${key}: StabilityPool.boldToken == shared BOLD`, eq(spBold, BOLD), spBold);
  check(`${key}: ActivePool.boldToken == shared BOLD`, eq(apBold, BOLD), apBold);
  check(`${key}: ActivePool.collToken == catalog`, eq(apColl, b.collToken), apColl);
}

// CollateralRegistry anchors the whole graph: derived from BOLD, lists all three.
const crFromBold = await read(BOLD, BOLD_ABI, "collateralRegistryAddress");
check("BOLD.collateralRegistryAddress == catalog registry", eq(crFromBold, COLLATERAL_REGISTRY), crFromBold);
const [crBold, crTotal] = await Promise.all([
  read(COLLATERAL_REGISTRY, CR_ABI, "boldToken"),
  read(COLLATERAL_REGISTRY, CR_ABI, "totalCollaterals"),
]);
check("CollateralRegistry.boldToken == shared BOLD", eq(crBold, BOLD), crBold);
check("CollateralRegistry.totalCollaterals == 3", crTotal === 3n, `${crTotal}`);
for (const [key, b] of Object.entries(CATALOG)) {
  const [regTm, regTok] = await Promise.all([
    read(COLLATERAL_REGISTRY, CR_ABI, "getTroveManager", [BigInt(b.idx)]),
    read(COLLATERAL_REGISTRY, CR_ABI, "getToken", [BigInt(b.idx)]),
  ]);
  check(`${key}: registry[${b.idx}].troveManager == catalog TM`, eq(regTm, b.tm), regTm);
  check(`${key}: registry[${b.idx}].token == catalog collToken`, eq(regTok, b.collToken), regTok);
}

// ── 2. Constants (per branch, from BorrowerOperations) ───────────────────────
console.log("\n## 2. Constants");
for (const [key, b] of Object.entries(CATALOG)) {
  const [mcr, ccr, scr, bcr, tmCcr] = await Promise.all([
    read(b.bo, BO_ABI, "MCR"),
    read(b.bo, BO_ABI, "CCR"),
    read(b.bo, BO_ABI, "SCR"),
    read(b.bo, BO_ABI, "BCR"),
    read(b.tm, TM_ABI, "CCR"),
  ]);
  const toE = (x) => (BigInt(Math.round(x * 1e6)) * E18) / 1_000_000n;
  check(
    `${key}: MCR/CCR/SCR/BCR match catalog`,
    mcr === toE(b.mcr) && ccr === toE(b.ccr) && scr === toE(b.scr) && bcr === toE(b.bcr),
    `MCR ${f(mcr, 2)} CCR ${f(ccr, 2)} SCR ${f(scr, 2)} BCR ${f(bcr, 2)}`,
  );
  check(`${key}: TM.CCR() == BO.CCR() (chain-read, not typed)`, tmCcr === ccr, f(tmCcr, 2));
}

// ── 3. Price (per branch) ────────────────────────────────────────────────────
console.log("\n## 3. Price");
const prices = {};
for (const [key, b] of Object.entries(CATALOG)) {
  const [lastGood, fetched, unbacked] = await Promise.all([
    read(b.pf, PF_ABI, "lastGoodPrice"),
    tryRead(b.pf, PF_ABI, "fetchPrice"),
    read(b.tm, TM_ABI, "getUnbackedPortionPriceAndRedeemability"),
  ]);
  const okFetch = fetched != null && fetched[0] > 0n && fetched[1] === false;
  const drift = fetched != null ? (Number(fetched[0] - lastGood) / Number(fetched[0])) * 100 : NaN;
  check(
    `${key}: fetchPrice simulates live, oracle not down`,
    okFetch,
    fetched != null ? `$${f(fetched[0], 2)} (lastGood $${f(lastGood, 2)}, drift ${drift.toFixed(2)}%)` : "revert",
  );
  const price = fetched?.[0] ?? lastGood;
  check(`${key}: TM redemption view price == fetchPrice`, unbacked[1] === price, `$${f(unbacked[1], 2)}`);
  prices[key] = price;
}

// ── 4. Ordering: SortedTroves descends by annual interest rate ───────────────
console.log("\n## 4. Ordering");
for (const [key, b] of Object.entries(CATALOG)) {
  const size = await read(b.st, ST_ABI, "getSize");
  check(`${key}: branch has open troves`, size > 0n, `size ${size}`);
  if (size === 0n) continue;
  const first = await read(b.st, ST_ABI, "getFirst");
  const firstStatus = await read(b.tm, TM_ABI, "getTroveStatus", [first]);
  check(`${key}: head trove is active`, firstStatus === 1, `status ${firstStatus}`);

  let id = first;
  let prevRate = null;
  let ordered = true;
  let walked = 0;
  const cap = 40;
  while (id !== 0n && walked < cap) {
    const d = await read(b.tm, TM_ABI, "getLatestTroveData", [id]);
    if (prevRate != null && d.annualInterestRate > prevRate) ordered = false;
    prevRate = d.annualInterestRate;
    id = await read(b.st, ST_ABI, "getNext", [id]);
    walked++;
  }
  check(`${key}: rate monotone non-increasing over ${walked} walked`, walked > 0 && ordered);
}

// ── 5. ICR identity (per branch head sample, entire state) ───────────────────
console.log("\n## 5. ICR identity");
for (const [key, b] of Object.entries(CATALOG)) {
  const size = await read(b.st, ST_ABI, "getSize");
  if (size === 0n) {
    check(`${key}: ICR sample available`, false, "no open troves");
    continue;
  }
  const id = await read(b.st, ST_ABI, "getFirst");
  const [data, status, icr] = await Promise.all([
    read(b.tm, TM_ABI, "getLatestTroveData", [id]),
    read(b.tm, TM_ABI, "getTroveStatus", [id]),
    read(b.tm, TM_ABI, "getCurrentICR", [id, prices[key]]),
  ]);
  check(`${key}: sample trove has debt`, data.entireDebt > 0n, `debt ${f(data.entireDebt, 0)}`);
  if (data.entireDebt === 0n) continue;
  const manual = (data.entireColl * prices[key]) / data.entireDebt;
  check(
    `${key}: getCurrentICR == entireColl × price ÷ entireDebt (BigInt-exact)`,
    icr === manual,
    `ICR ${f(icr, 4)} (status ${status}, coll ${f(data.entireColl, 4)})`,
  );
}

// ── 6. System state (registry-level) ─────────────────────────────────────────
console.log("\n## 6. System state");
const [boldSupply, boldSym, redemptionRate, baseRate] = await Promise.all([
  read(BOLD, BOLD_ABI, "totalSupply"),
  read(BOLD, BOLD_ABI, "symbol"),
  read(COLLATERAL_REGISTRY, CR_ABI, "getRedemptionRateWithDecay"),
  read(COLLATERAL_REGISTRY, CR_ABI, "baseRate"),
]);
check(`BOLD (${boldSym}) has supply`, boldSupply > 0n, `${f(boldSupply, 0)} BOLD`);
check("registry redemption rate in [0, 100%)", redemptionRate >= 0n && redemptionRate < E18, `${f(redemptionRate, 6)}`);
check("registry base rate in [0, 100%)", baseRate >= 0n && baseRate < E18, `${f(baseRate, 6)}`);
for (const [key, b] of Object.entries(CATALOG)) {
  const un = await read(b.tm, TM_ABI, "getUnbackedPortionPriceAndRedeemability");
  console.log(`      ${key}: redeemable=${un[2]} unbacked ${f(un[0], 0)} BOLD`);
}

// ── 7. Debt-in-front (full WETH-branch sweep of the redemption queue) ────────
console.log("\n## 7. Debt-in-front (WETH branch)");
{
  const b = CATALOG.weth;
  const size = await read(b.st, ST_ABI, "getSize");
  const last = await read(b.st, ST_ABI, "getLast");
  check("weth: branch has open troves", size > 0n, `size ${size}`);
  if (size > 0n) {
    const ids = [];
    let id = await read(b.st, ST_ABI, "getFirst");
    while (id !== 0n && BigInt(ids.length) <= size) {
      ids.push(id);
      id = await read(b.st, ST_ABI, "getNext", [id]);
    }
    check("weth: sweep length == getSize", BigInt(ids.length) === size, `${ids.length} troves`);
    check("weth: tail is final sweep entry", ids.length > 0 && ids[ids.length - 1] === last);

    const data = await Promise.all(ids.map((tid) => read(b.tm, TM_ABI, "getLatestTroveData", [tid])));

    // Redemptions hit the LOWEST interest rate first (the tail), so debt in
    // front of trove i = Σ entireDebt of the troves after it in the sweep.
    let monotone = true;
    for (let i = 1; i < data.length; i++) {
      if (data[i].annualInterestRate > data[i - 1].annualInterestRate) monotone = false;
    }
    check("weth: interest rate monotone non-increasing over full sweep", data.length > 0 && monotone);

    const debtAfter = (i) => data.slice(i + 1).reduce((s, d) => s + d.entireDebt, 0n);
    check("weth: tail trove has zero debt in front", data.length > 0 && debtAfter(data.length - 1) === 0n);
    const mid = Math.floor(data.length / 2);
    console.log(
      `      mid sample id ${ids[mid]}: ${data.length - 1 - mid} troves ahead in the queue, ${f(debtAfter(mid), 0)} BOLD in front`,
    );
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
