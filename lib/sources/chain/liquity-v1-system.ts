// Live Liquity V1 SYSTEM state — the protocol-level companion to
// liquity-v1-position.ts. Where the position lane answers "where does THIS
// Trove stand", this answers what only the whole system can: how the one ETH
// market stands against recovery mode, what the Stability Pool can absorb, and
// what the redemption queue looks like from its front.
//
// V1 is NOT the V2 shape, and the differences are the point of this view:
//   • ONE market. No branches, no per-branch oracle or MCR — a single ETH
//     Trove per address against a single LUSD debt, so there is nothing to
//     compare side by side. The system IS the market.
//   • NO user-set rates. V2 (and its forks) order redemptions by the rate the
//     borrower chose; V1 has no such rate to choose. Redemptions take the
//     LOWEST COLLATERAL RATIO first, so a Trove's queue position is its ICR —
//     an outcome of the price and its own collateral, not a decision. The only
//     rate-like quantities are protocol-wide: the shared base rate, and the
//     redemption / borrowing fees that decay from it. A borrower cannot buy a
//     later place in this queue; they can only add collateral or repay.
//   • The Stability Pool is the liquidation backstop, and its depth against
//     system debt is a system fact no Trove page shows.
//
// One read at one head block: the protocol's own fetchPrice (SIMULATED via
// eth_call — state-mutating on-chain, read-only under eth_call), the
// TroveManager's own getTCR / checkRecoveryMode / fee getters, the Stability
// Pool's own deposit total, and one MultiTroveGetter sweep of SortedTroves
// (~80 Troves) whose order IS the redemption order. Every ICR is the
// TroveManager's own getCurrentICR, not client arithmetic.
//
// Every address and getter here is chain-verified by
// scripts/verify-liquity-v1-chain.mjs. SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { LIQUITY_V1_ADDRESSES, LIQUITY_V1_MCR, LIQUITY_V1_CCR } from "@/lib/liquity-v1/asset-catalog";

const TROVE_MANAGER = getAddress(LIQUITY_V1_ADDRESSES.TROVE_MANAGER);
const PRICE_FEED = getAddress(LIQUITY_V1_ADDRESSES.PRICE_FEED);
const SORTED_TROVES = getAddress(LIQUITY_V1_ADDRESSES.SORTED_TROVES);
const MULTI_TROVE_GETTER = getAddress(LIQUITY_V1_ADDRESSES.MULTI_TROVE_GETTER);
const STABILITY_POOL = getAddress(LIQUITY_V1_ADDRESSES.STABILITY_POOL);

const TM_ABI = parseAbi([
  "function getCurrentICR(address, uint256 price) view returns (uint256)",
  "function getTCR(uint256 price) view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
  "function getEntireSystemColl() view returns (uint256)",
  "function getEntireSystemDebt() view returns (uint256)",
  "function getBorrowingRateWithDecay() view returns (uint256)",
  "function getRedemptionRateWithDecay() view returns (uint256)",
  "function baseRate() view returns (uint256)",
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
const SP_ABI = parseAbi(["function getTotalLUSDDeposits() view returns (uint256)"]);

const E18 = 1e18;
const ZERO = BigInt(0);
// getCurrentICR returns 2^256−1 for a zero-debt Trove — treat anything absurd
// as "no ratio" rather than a number.
const ICR_CEILING = BigInt("0xffffffffffffffffffffffffffffffff");
const SWEEP_PAGE = BigInt(500);

/** One Trove's place in the redemption queue, in redemption order. */
export interface LiquityV1QueueEntry {
  owner: string;
  /** The TroveManager's OWN getCurrentICR at the protocol's own price. Null
   *  only if the contract returned its zero-debt sentinel. */
  icr: number | null;
  /** Recorded debt / collateral from the sweep. NOT the entire figures:
   *  pending redistribution rewards are not applied to swept entries (they
   *  land on a Trove's next touch), which the provenance states. */
  debt: number;
  coll: number;
  /** Σ recorded debt of everything ahead of this Trove in the queue. */
  debtInFront: number;
  /** True while this Trove sits below the 110% minimum at the current price —
   *  the contract's own comparison, not a judgement: it is liquidatable now. */
  liquidatable: boolean;
}

export interface LiquityV1SystemChainResponse {
  blockNumber: number;
  /** The protocol's own ETH:USD price (fetchPrice simulated at head). */
  price: number;
  /** True when the simulation reverted and the lagging lastGoodPrice is shown. */
  priceStale: boolean;
  /** System aggregates at the same block. */
  systemColl: number;
  systemDebt: number;
  systemCollUsd: number;
  /** The TroveManager's own total collateral ratio, and its own recovery-mode
   *  verdict at the same price. */
  tcr: number | null;
  recoveryMode: boolean;
  mcr: number;
  ccr: number;
  /** Protocol-wide rate state. V1 has no per-Trove rate: the shared base rate
   *  rises with redemption volume and decays with time, and both fees derive
   *  from it. */
  baseRate: number;
  redemptionRate: number;
  borrowingRate: number;
  /** Open Troves — the TroveManager's own count, and the sorted list's size
   *  (the same set; both are read so a divergence would be visible). */
  trovesCount: number;
  listSize: number;
  /** The Stability Pool's LUSD — the first line against liquidations. */
  spDeposits: number;
  /** SP deposits ÷ system debt: how much of the outstanding debt the pool
   *  could absorb before liquidations start redistributing to other Troves. */
  spCoverage: number | null;
  /** The queue, front (redeemed first — lowest collateral ratio) → back. */
  queue: LiquityV1QueueEntry[];
  /** Σ recorded debt across the whole listed queue — what the in-front
   *  figures are a share of. */
  queueDebtTotal: number;
  /** True when the read failed and the page must say so rather than show an
   *  empty protocol. */
  chainStale: boolean;
}

function stub(): LiquityV1SystemChainResponse {
  return {
    blockNumber: 0,
    price: 0,
    priceStale: false,
    systemColl: 0,
    systemDebt: 0,
    systemCollUsd: 0,
    tcr: null,
    recoveryMode: false,
    mcr: LIQUITY_V1_MCR,
    ccr: LIQUITY_V1_CCR,
    baseRate: 0,
    redemptionRate: 0,
    borrowingRate: 0,
    trovesCount: 0,
    listSize: 0,
    spDeposits: 0,
    spCoverage: null,
    queue: [],
    queueDebtTotal: 0,
    chainStale: true,
  };
}

interface SweepEntry {
  owner: string;
  debt: bigint;
  coll: bigint;
}

/**
 * Read Liquity V1's whole system state live from its own contracts. Returns a
 * `chainStale` stub on RPC failure so the page states that rather than
 * rendering an empty protocol.
 */
export async function loadLiquityV1SystemFromChain(): Promise<LiquityV1SystemChainResponse> {
  try {
    const client = alchemyClient();

    // Phase 1 — everything that doesn't need the price.
    const [
      blockNumber,
      priceFetched,
      priceLastGood,
      systemColl,
      systemDebt,
      baseRate,
      redemptionRate,
      borrowingRate,
      trovesCount,
      listSize,
      spDeposits,
    ] = await Promise.all([
      client.getBlockNumber().then(Number),
      client
        .readContract({ address: PRICE_FEED, abi: PF_ABI, functionName: "fetchPrice" })
        .catch(() => null as bigint | null),
      client.readContract({ address: PRICE_FEED, abi: PF_ABI, functionName: "lastGoodPrice" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getEntireSystemColl" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getEntireSystemDebt" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "baseRate" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getRedemptionRateWithDecay" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getBorrowingRateWithDecay" }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getTroveOwnersCount" }),
      client.readContract({ address: SORTED_TROVES, abi: ST_ABI, functionName: "getSize" }),
      client.readContract({ address: STABILITY_POOL, abi: SP_ABI, functionName: "getTotalLUSDDeposits" }),
    ]);

    const priceRaw = priceFetched != null && priceFetched > ZERO ? priceFetched : priceLastGood;
    const priceStale = !(priceFetched != null && priceFetched > ZERO);

    // Phase 2 — the price-dependent verdicts and the queue sweep. The sorted
    // list is descending nominal ICR and redemptions take the LOWEST first, so
    // the queue's front is the sweep's tail.
    const [tcrRaw, recoveryMode, sweep] = await Promise.all([
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "getTCR", args: [priceRaw] }),
      client.readContract({ address: TROVE_MANAGER, abi: TM_ABI, functionName: "checkRecoveryMode", args: [priceRaw] }),
      sweepSortedTroves(client, listSize),
    ]);

    // Phase 3 — every listed Trove's ICR from the CONTRACT's own getCurrentICR
    // at the same price, in one batch. Ordering by ICR is the protocol's, not
    // ours: the list already carries it, and these figures state it.
    const ordered = sweep ? [...sweep].reverse() : []; // tail (lowest ICR) first
    const icrs =
      ordered.length > 0
        ? ((await client.multicall({
            allowFailure: true,
            contracts: ordered.map((t) => ({
              address: TROVE_MANAGER,
              abi: TM_ABI,
              functionName: "getCurrentICR",
              args: [getAddress(t.owner), priceRaw],
            })),
          })) as { status: string; result?: bigint }[])
        : [];

    const mcr = LIQUITY_V1_MCR;
    let running = ZERO;
    const queue: LiquityV1QueueEntry[] = ordered.map((t, i) => {
      const raw = icrs[i]?.status === "success" ? (icrs[i].result as bigint) : null;
      const icr = raw != null && raw > ZERO && raw < ICR_CEILING ? Number(raw) / E18 : null;
      const entry: LiquityV1QueueEntry = {
        owner: t.owner.toLowerCase(),
        icr,
        debt: Number(t.debt) / E18,
        coll: Number(t.coll) / E18,
        debtInFront: Number(running) / E18,
        liquidatable: icr != null && icr < mcr,
      };
      running += t.debt;
      return entry;
    });

    const systemDebtNum = Number(systemDebt) / E18;
    const price = Number(priceRaw) / E18;
    const spDepositsNum = Number(spDeposits) / E18;

    return {
      blockNumber,
      price,
      priceStale,
      systemColl: Number(systemColl) / E18,
      systemDebt: systemDebtNum,
      systemCollUsd: (Number(systemColl) / E18) * price,
      tcr: tcrRaw > ZERO && tcrRaw < ICR_CEILING ? Number(tcrRaw) / E18 : null,
      recoveryMode,
      mcr,
      ccr: LIQUITY_V1_CCR,
      baseRate: Number(baseRate) / E18,
      redemptionRate: Number(redemptionRate) / E18,
      borrowingRate: Number(borrowingRate) / E18,
      trovesCount: Number(trovesCount),
      listSize: Number(listSize),
      spDeposits: spDepositsNum,
      spCoverage: systemDebtNum > 0 ? spDepositsNum / systemDebtNum : null,
      queue,
      queueDebtTotal: Number(running) / E18,
      chainStale: false,
    };
  } catch {
    return stub();
  }
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
      for (const t of page) all.push({ owner: t.owner, debt: t.debt, coll: t.coll });
    }
    return all;
  } catch {
    return null; // the queue section stays off; the system read still stands
  }
}
