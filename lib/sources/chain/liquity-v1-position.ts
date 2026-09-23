// Live Liquity V1 Trove state — the chain detail reader. One ETH-collateral
// Trove per address on the fixed singleton mainnet contracts (no market axis),
// so the read is: the TroveManager's entire debt/coll (pending redistribution
// rewards included), the protocol's own PriceFeed price, the collateral ratio
// the TroveManager itself computes, system state (TCR / recovery mode / fee
// rates), and this Trove's place in the redemption queue from one
// MultiTroveGetter sweep of the sorted list (80-odd open troves — a single
// paged walk). Every address, getter and formula here is chain-verified by
// scripts/verify-liquity-v1-chain.mjs.
//
// SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { LIQUITY_V1_ADDRESSES, LIQUITY_V1_MCR, LIQUITY_V1_CCR } from "@/lib/liquity-v1/asset-catalog";
import type { LiquityV1PositionChainResponse, LiquityV1TroveChainStatus } from "@/lib/api/fetch-liquity-v1-position";

const TROVE_MANAGER = getAddress(LIQUITY_V1_ADDRESSES.TROVE_MANAGER);
const PRICE_FEED = getAddress(LIQUITY_V1_ADDRESSES.PRICE_FEED);
const SORTED_TROVES = getAddress(LIQUITY_V1_ADDRESSES.SORTED_TROVES);
const MULTI_TROVE_GETTER = getAddress(LIQUITY_V1_ADDRESSES.MULTI_TROVE_GETTER);

const TM_ABI = parseAbi([
  "function Troves(address) view returns (uint256 debt, uint256 coll, uint256 stake, uint8 status, uint128 arrayIndex)",
  "function getEntireDebtAndColl(address) view returns (uint256 debt, uint256 coll, uint256 pendingLUSDDebtReward, uint256 pendingETHReward)",
  "function getCurrentICR(address, uint256 price) view returns (uint256)",
  "function getTCR(uint256 price) view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
  "function getBorrowingRateWithDecay() view returns (uint256)",
  "function getRedemptionRateWithDecay() view returns (uint256)",
  "function getTroveOwnersCount() view returns (uint256)",
]);
const PF_ABI = parseAbi([
  "function lastGoodPrice() view returns (uint256)",
  // fetchPrice mutates lastGoodPrice when SENT as a tx; an eth_call simulation
  // is read-only and returns the exact price the protocol would use this block.
  "function fetchPrice() view returns (uint256)",
]);
const ST_ABI = parseAbi(["function getSize() view returns (uint256)"]);
const MTG_ABI = parseAbi([
  "function getMultipleSortedTroves(int256 startIdx, uint256 count) view returns ((address owner, uint256 debt, uint256 coll, uint256 stake, uint256 snapshotETH, uint256 snapshotLUSDDebt)[])",
]);

const E18 = 1e18;
const ZERO = BigInt(0);
// getCurrentICR returns 2^256−1 for a zero-debt Trove — treat anything absurd
// as "no ratio" rather than a number.
const ICR_CEILING = BigInt("0xffffffffffffffffffffffffffffffff"); // 2^128−1, far past any real ratio
// Sweep page size — the list is ~80 troves today; paging keeps the call safe
// if the roster ever grows back toward its thousands-of-troves peak.
const SWEEP_PAGE = BigInt(500);

const STATUS: LiquityV1TroveChainStatus[] = [
  "nonExistent",
  "active",
  "closedByOwner",
  "closedByLiquidation",
  "closedByRedemption",
];

function stub(wallet: string): LiquityV1PositionChainResponse {
  return {
    wallet,
    blockNumber: 0,
    troveStatus: "nonExistent",
    coll: 0,
    debt: 0,
    recordedColl: 0,
    recordedDebt: 0,
    pendingEthReward: 0,
    pendingLusdReward: 0,
    price: 0,
    icr: null,
    mcr: LIQUITY_V1_MCR,
    ccr: LIQUITY_V1_CCR,
    tcr: 0,
    recoveryMode: false,
    borrowingRate: 0,
    redemptionRate: 0,
    trovesCount: 0,
    debtInFront: null,
    trovesAhead: null,
    queueDebtTotal: null,
    chainStale: true,
  };
}

/**
 * Read a wallet's live Liquity V1 Trove straight from chain. Returns a
 * `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers.
 */
export async function loadLiquityV1PositionFromChain(walletRaw: string): Promise<LiquityV1PositionChainResponse> {
  const wallet = getAddress(walletRaw);

  try {
    const client = alchemyClient();

    // Phase 1 — everything that doesn't need the price, in parallel. The
    // protocol's own price comes from fetchPrice simulated at head (the exact
    // value a liquidation/redemption would use this block); lastGoodPrice is
    // the fallback when the simulation reverts.
    const [blockNumber, trove, entire, priceFetched, priceLastGood, borrowingRate, redemptionRate, trovesCount, size] =
      await Promise.all([
        client.getBlockNumber().then(Number),
        client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "Troves", args: [wallet] }),
        client.readContract({
          address: TROVE_MANAGER,
          abi: TM_ABI,
          functionName: "getEntireDebtAndColl",
          args: [wallet],
        }),
        client
          .readContract({ address: PRICE_FEED, abi: PF_ABI, functionName: "fetchPrice" })
          .catch(() => null as bigint | null),
        client.readContract({ address: PRICE_FEED, abi: PF_ABI, functionName: "lastGoodPrice" }),
        client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getBorrowingRateWithDecay" }),
        client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getRedemptionRateWithDecay" }),
        client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getTroveOwnersCount" }),
        client.readContract({ address: SORTED_TROVES, abi: ST_ABI, functionName: "getSize" }),
      ]);

    const priceRaw = priceFetched != null && priceFetched > ZERO ? priceFetched : priceLastGood;
    const [recordedDebtRaw, recordedCollRaw, , statusRaw] = trove;
    const [entireDebtRaw, entireCollRaw, pendingLusdRaw, pendingEthRaw] = entire;
    const troveStatus = STATUS[Number(statusRaw)] ?? "nonExistent";
    const isActive = troveStatus === "active";

    // Phase 2 — price-dependent reads, plus the redemption-queue sweep for an
    // active Trove. Redemptions hit the LOWEST collateral ratio first; the
    // sorted list is descending nominal ICR, so debt in front = Σ debt of the
    // troves after this one in the sweep.
    const [icrRaw, tcrRaw, recoveryMode, sweep] = await Promise.all([
      isActive
        ? client.readContract({
            address: TROVE_MANAGER,
            abi: TM_ABI,
            functionName: "getCurrentICR",
            args: [wallet, priceRaw],
          })
        : Promise.resolve(ZERO),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getTCR", args: [priceRaw] }),
      client.readContract({
        address: TROVE_MANAGER,
        abi: TM_ABI,
        functionName: "checkRecoveryMode",
        args: [priceRaw],
      }),
      isActive ? sweepSortedTroves(client, size) : Promise.resolve(null),
    ]);

    let debtInFront: number | null = null;
    let trovesAhead: number | null = null;
    let queueDebtTotal: number | null = null;
    if (sweep) {
      const idx = sweep.findIndex((t) => t.owner.toLowerCase() === wallet.toLowerCase());
      if (idx >= 0) {
        let sum = ZERO;
        for (let i = idx + 1; i < sweep.length; i++) sum += sweep[i].debt;
        debtInFront = Number(sum) / E18;
        trovesAhead = sweep.length - 1 - idx;
        // The runway denominator: the whole queue's recorded debt, from the
        // SAME sweep the in-front figure came from — one consistent snapshot.
        let total = ZERO;
        for (const t of sweep) total += t.debt;
        queueDebtTotal = Number(total) / E18;
      }
    }

    return {
      wallet: wallet.toLowerCase(),
      blockNumber,
      troveStatus,
      coll: Number(entireCollRaw) / E18,
      debt: Number(entireDebtRaw) / E18,
      recordedColl: Number(recordedCollRaw) / E18,
      recordedDebt: Number(recordedDebtRaw) / E18,
      pendingEthReward: Number(pendingEthRaw) / E18,
      pendingLusdReward: Number(pendingLusdRaw) / E18,
      price: Number(priceRaw) / E18,
      icr: isActive && entireDebtRaw > ZERO && icrRaw > ZERO && icrRaw < ICR_CEILING ? Number(icrRaw) / E18 : null,
      mcr: LIQUITY_V1_MCR,
      ccr: LIQUITY_V1_CCR,
      tcr: Number(tcrRaw) / E18,
      recoveryMode,
      borrowingRate: Number(borrowingRate) / E18,
      redemptionRate: Number(redemptionRate) / E18,
      trovesCount: Number(trovesCount),
      debtInFront,
      trovesAhead,
      queueDebtTotal,
      chainStale: false,
    };
  } catch {
    return stub(walletRaw.toLowerCase());
  }
}

interface SweepEntry {
  owner: string;
  debt: bigint;
}

/** Walk the whole sorted list (descending nominal ICR) in pages. */
async function sweepSortedTroves(client: ReturnType<typeof alchemyClient>, size: bigint): Promise<SweepEntry[] | null> {
  try {
    const all: SweepEntry[] = [];
    for (let start = ZERO; start < size; start += SWEEP_PAGE) {
      const count = size - start > SWEEP_PAGE ? SWEEP_PAGE : size - start;
      const page = await client.readContract({
        address: MULTI_TROVE_GETTER,
        abi: MTG_ABI,
        functionName: "getMultipleSortedTroves",
        args: [start, count],
      });
      for (const t of page) all.push({ owner: t.owner, debt: t.debt });
    }
    return all;
  } catch {
    return null; // the queue surface just stays off; the rest of the read stands
  }
}
