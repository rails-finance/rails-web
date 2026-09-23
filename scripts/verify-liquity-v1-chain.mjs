// Verify the Liquity V1 chain-lane facts before the uplift wires them live —
// the Spark-uplift precedent (verify-spark-fork-deltas.mjs): every address,
// getter and formula the position reader will rely on is checked against the
// chain itself, so the reader never encodes an unverified assumption.
//
// Checks:
//   1. Address graph — TroveManager's own getters name the PriceFeed,
//      SortedTroves, BorrowerOperations and LUSD addresses we catalog.
//   2. Constants — MCR / CCR public constant getters (1.1e18 / 1.5e18).
//   3. Price — PriceFeed.fetchPrice() simulated via eth_call vs lastGoodPrice.
//   4. MultiTroveGetter — a head/tail sample agrees with SortedTroves order and
//      TroveManager.Troves per-owner state.
//   5. ICR math — getCurrentICR == entireColl × price ÷ entireDebt (the entire-
//      state including pending redistribution rewards, NOT the recorded Troves
//      struct — the reader must use getEntireDebtAndColl for ratio narration).
//   6. System state — TCR, recovery-mode flag, borrowing/redemption rates.
//   7. Debt-in-front — the tail trove (lowest NICR, first redeemed) has zero
//      debt in front; a mid-list sample's figure equals the sum of the debts
//      after it.
//
// Run: node scripts/verify-liquity-v1-chain.mjs

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const rpc = env
  .match(/^ALCHEMY_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
const c = createPublicClient({ chain: mainnet, transport: http(rpc) });

// The catalog the app will ship (lib/liquity-v1/asset-catalog.ts).
const CATALOG = {
  TROVE_MANAGER: "0xa39739ef8b0231dbfa0dcda07d7e29faabcf4bb2",
  BORROWER_OPERATIONS: "0x24179cd81c9e782a4096035f7ec97fb8b783e007",
  PRICE_FEED: "0x4c517d4e2c851ca76d7ec94b805269df0f2201de",
  SORTED_TROVES: "0x8fdd3fbfeb32b28fb73555518f8b361bcea741a6",
  MULTI_TROVE_GETTER: "0xfc92d0e9fa35df17e3a6d9f40716ca2ce749922b",
  LUSD: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
};

const TM = getAddress(CATALOG.TROVE_MANAGER);
const TM_ABI = parseAbi([
  "function priceFeed() view returns (address)",
  "function sortedTroves() view returns (address)",
  "function borrowerOperationsAddress() view returns (address)",
  "function lusdToken() view returns (address)",
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function Troves(address) view returns (uint256 debt, uint256 coll, uint256 stake, uint8 status, uint128 arrayIndex)",
  "function getEntireDebtAndColl(address) view returns (uint256 debt, uint256 coll, uint256 pendingLUSDDebtReward, uint256 pendingETHReward)",
  "function getCurrentICR(address, uint256 price) view returns (uint256)",
  "function getNominalICR(address) view returns (uint256)",
  "function getTCR(uint256 price) view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
  "function getBorrowingRateWithDecay() view returns (uint256)",
  "function getRedemptionRateWithDecay() view returns (uint256)",
  "function baseRate() view returns (uint256)",
  "function getTroveOwnersCount() view returns (uint256)",
]);
const PF_ABI = parseAbi([
  "function lastGoodPrice() view returns (uint256)",
  // fetchPrice mutates lastGoodPrice on-chain, but an eth_call simulation
  // returns the exact price the protocol would use in the same block.
  "function fetchPrice() view returns (uint256)",
]);
const ST_ABI = parseAbi([
  "function getSize() view returns (uint256)",
  "function getFirst() view returns (address)",
  "function getLast() view returns (address)",
  "function getPrev(address) view returns (address)",
]);
const MTG_ABI = parseAbi([
  "function getMultipleSortedTroves(int256 startIdx, uint256 count) view returns ((address owner, uint256 debt, uint256 coll, uint256 stake, uint256 snapshotETH, uint256 snapshotLUSDDebt)[])",
]);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const E18 = 10n ** 18n;
const f = (x, d = 4) => (Number(x) / 1e18).toFixed(d);

// ── 1. Address graph ─────────────────────────────────────────────────────────
const [priceFeed, sortedTroves, borrowerOps, lusd] = await Promise.all([
  c.readContract({ address: TM, abi: TM_ABI, functionName: "priceFeed" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "sortedTroves" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "borrowerOperationsAddress" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "lusdToken" }),
]);
check("priceFeed address", priceFeed.toLowerCase() === CATALOG.PRICE_FEED, priceFeed);
check("sortedTroves address", sortedTroves.toLowerCase() === CATALOG.SORTED_TROVES, sortedTroves);
check("borrowerOperations address", borrowerOps.toLowerCase() === CATALOG.BORROWER_OPERATIONS, borrowerOps);
check("lusdToken address", lusd.toLowerCase() === CATALOG.LUSD, lusd);

// ── 2. Constants ─────────────────────────────────────────────────────────────
const [mcr, ccr] = await Promise.all([
  c.readContract({ address: TM, abi: TM_ABI, functionName: "MCR" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "CCR" }),
]);
check("MCR = 110%", mcr === (11n * E18) / 10n, f(mcr, 2));
check("CCR = 150%", ccr === (15n * E18) / 10n, f(ccr, 2));

// ── 3. Price ─────────────────────────────────────────────────────────────────
const PF = getAddress(CATALOG.PRICE_FEED);
const [lastGood, fetched] = await Promise.all([
  c.readContract({ address: PF, abi: PF_ABI, functionName: "lastGoodPrice" }),
  c.readContract({ address: PF, abi: PF_ABI, functionName: "fetchPrice" }).catch(() => null),
]);
console.log(`      lastGoodPrice $${f(lastGood, 2)}  fetchPrice ${fetched == null ? "(revert)" : `$${f(fetched, 2)}`}`);
check("fetchPrice simulates", fetched != null && fetched > 0n);
if (fetched != null) {
  const drift = Math.abs(Number(fetched - lastGood)) / Number(fetched);
  check("price drift lastGood vs fetch < 5%", drift < 0.05, `${(drift * 100).toFixed(3)}%`);
}
const price = fetched ?? lastGood;

// ── 4. Sorted list + MultiTroveGetter agreement ──────────────────────────────
const ST = getAddress(CATALOG.SORTED_TROVES);
const MTG = getAddress(CATALOG.MULTI_TROVE_GETTER);
const [size, first, last, ownersCount] = await Promise.all([
  c.readContract({ address: ST, abi: ST_ABI, functionName: "getSize" }),
  c.readContract({ address: ST, abi: ST_ABI, functionName: "getFirst" }),
  c.readContract({ address: ST, abi: ST_ABI, functionName: "getLast" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getTroveOwnersCount" }),
]);
console.log(`      open troves: sortedTroves.getSize=${size} troveOwnersCount=${ownersCount}`);
check("sorted size == owners count", size === ownersCount);

const head3 = await c.readContract({
  address: MTG,
  abi: MTG_ABI,
  functionName: "getMultipleSortedTroves",
  args: [0n, 3n],
});
const tail3 = await c.readContract({
  address: MTG,
  abi: MTG_ABI,
  functionName: "getMultipleSortedTroves",
  args: [-1n, 3n],
});
check("MTG head matches getFirst", head3[0].owner.toLowerCase() === first.toLowerCase());
check("MTG tail matches getLast", tail3[0].owner.toLowerCase() === last.toLowerCase());

const sample = head3[0];
const trove = await c.readContract({ address: TM, abi: TM_ABI, functionName: "Troves", args: [sample.owner] });
check(
  "MTG debt/coll == Troves struct",
  trove[0] === sample.debt && trove[1] === sample.coll,
  `debt ${f(sample.debt, 0)} coll ${f(sample.coll, 2)}`,
);

// ── 5. ICR math (entire state incl. pending redistribution rewards) ─────────
const [entire, icr, nicr] = await Promise.all([
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getEntireDebtAndColl", args: [sample.owner] }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getCurrentICR", args: [sample.owner, price] }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getNominalICR", args: [sample.owner] }),
]);
const manualIcr = (entire[1] * price) / entire[0];
const icrDiff = icr > manualIcr ? icr - manualIcr : manualIcr - icr;
check(
  "getCurrentICR == entireColl×price÷entireDebt",
  icrDiff <= 10n ** 6n,
  `ICR ${f(icr, 4)} manual ${f(manualIcr, 4)}`,
);
check(
  "entire == recorded + pending",
  entire[0] === trove[0] + entire[2] && entire[1] === trove[1] + entire[3],
  `pending LUSD ${f(entire[2], 4)} pending ETH ${f(entire[3], 6)}`,
);
console.log(`      sample ${sample.owner} NICR ${f(nicr, 4)}`);

// ── 6. System state ──────────────────────────────────────────────────────────
const [tcr, recovery, borrowRate, redemptionRate, base] = await Promise.all([
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getTCR", args: [price] }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "checkRecoveryMode", args: [price] }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getBorrowingRateWithDecay" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "getRedemptionRateWithDecay" }),
  c.readContract({ address: TM, abi: TM_ABI, functionName: "baseRate" }),
]);
console.log(
  `      TCR ${f(tcr, 4)}  recovery=${recovery}  borrowRate ${f(borrowRate, 6)}  redemptionRate ${f(redemptionRate, 6)}  baseRate ${f(base, 8)}`,
);
check("TCR sane (1 < TCR < 100)", tcr > E18 && tcr < 100n * E18);
check("recovery mode consistent with TCR vs CCR", recovery === tcr < ccr);
check("borrow rate in [0.5%, 5%]", borrowRate >= E18 / 200n && borrowRate <= E18 / 20n);

// ── 7. Debt-in-front semantics ───────────────────────────────────────────────
// Full sweep in pages (descending NICR: head = safest). Redemptions hit the
// LOWEST collateral ratio first, so debt in front of trove i = Σ debt of
// troves BELOW it in the list (higher index).
const PAGE = 500n;
const all = [];
for (let start = 0n; start < size; start += PAGE) {
  const page = await c.readContract({
    address: MTG,
    abi: MTG_ABI,
    functionName: "getMultipleSortedTroves",
    args: [start, size - start > PAGE ? PAGE : size - start],
  });
  all.push(...page);
}
check("full sweep length == size", BigInt(all.length) === size, `${all.length} troves`);
const tailOwner = last.toLowerCase();
const tailIdx = all.findIndex((t) => t.owner.toLowerCase() === tailOwner);
check("tail trove is final sweep entry", tailIdx === all.length - 1);
const midIdx = Math.floor(all.length / 2);
const mid = all[midIdx];
const debtInFrontMid = all.slice(midIdx + 1).reduce((s, t) => s + t.debt, 0n);
console.log(
  `      mid sample ${mid.owner}: ${all.length - 1 - midIdx} troves ahead, ${f(debtInFrontMid, 0)} LUSD in front`,
);
// Ordering spot-check: NICR is monotonically non-increasing along the sweep.
const nicrOf = (t) => (t.debt === 0n ? Infinity : Number((t.coll * 10n ** 20n) / t.debt));
let ordered = true;
for (let i = 1; i < all.length; i++) if (nicrOf(all[i]) > nicrOf(all[i - 1]) * 1.000001) ordered = false;
check("sweep NICR monotone non-increasing", ordered);

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
