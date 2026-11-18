// Liquity V2's three branches against their critical ratio, read live
// (rails-ops TO-DO-ui-jobs 747): one multicall at the head block, per branch
// TroveManager.getEntireBranchColl / getEntireBranchDebt, the PriceFeed's
// fetchPrice (simulated, lastGoodPrice where it fails) and BorrowerOperations'
// CCR / SCR / MCR / hasBeenShutDown. Settled in lib/liquity-v2/branch-ccr.ts.
// The head read is kept 30 s; a read at a named block is kept by block
// (lib/liquity-v2/block-keyed-cache.ts); one read in flight per key.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { blockKeyedCache } from "@/lib/liquity-v2/block-keyed-cache";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import {
  ccrPinBlock,
  LIQUITY_V2_CCR_BRANCHES,
  type LiquityV2BranchCcrRead,
  type LiquityV2BranchCcrResponse,
  type LiquityV2CcrBranch,
} from "@/lib/liquity-v2/branch-ccr";

const TM_ABI = parseAbi([
  "function getEntireBranchColl() view returns (uint256)",
  "function getEntireBranchDebt() view returns (uint256)",
]);
// fetchPrice mutates on chain; declared view so eth_call simulates it.
const PF_ABI = parseAbi([
  "function fetchPrice() view returns (uint256, bool)",
  "function lastGoodPrice() view returns (uint256)",
]);
const BO_ABI = parseAbi([
  "function CCR() view returns (uint256)",
  "function SCR() view returns (uint256)",
  "function MCR() view returns (uint256)",
  "function hasBeenShutDown() view returns (bool)",
]);
const CALLS_PER_BRANCH = 8;

const TTL_MS = 30_000;
let cached: { at: number; value: LiquityV2BranchCcrResponse } | null = null;
let inflight: Promise<LiquityV2BranchCcrResponse> | null = null;
/** Reads at a named block, the last 8 blocks kept, one read per block in flight. */
const atBlockRead = blockKeyedCache(
  8,
  (block: number) => read(block),
  (v) => v.blockNumber > 0,
);

const emptyBranches = () =>
  Object.fromEntries(LIQUITY_V2_CCR_BRANCHES.map((b) => [b, null])) as Record<
    LiquityV2CcrBranch,
    LiquityV2BranchCcrRead | null
  >;

/** The block LIQUITY_V2_CCR_AT_BLOCK pins the reads to on a development
 *  server, so a past Safety Mode can be drawn; null in production. The literal
 *  NODE_ENV test lets a production build drop the branch. */
export function liquityV2CcrDevPin(): number | null {
  return process.env.NODE_ENV === "development"
    ? ccrPinBlock(process.env.NODE_ENV, process.env.LIQUITY_V2_CCR_AT_BLOCK)
    : null;
}

/** Every branch at the head, or at `atBlock` where a server page names the
 *  block of a read it shows beside this one (the branches page's roster). A
 *  branch whose reads failed is null; a failed read of the block leaves every
 *  branch null at block 0. The route passes no block. */
export async function loadLiquityV2BranchCcr(atBlock?: number): Promise<LiquityV2BranchCcrResponse> {
  if (atBlock != null && atBlock > 0) return atBlockRead(atBlock);
  const pin = liquityV2CcrDevPin();
  if (pin != null) return atBlockRead(pin);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!inflight) {
    inflight = read()
      .then((value) => {
        if (value.blockNumber > 0) cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function read(atBlock?: number): Promise<LiquityV2BranchCcrResponse> {
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const block = await client.getBlock(atBlock != null ? { blockNumber: BigInt(atBlock) } : {});
    const branches = LIQUITY_V2_CCR_BRANCHES.map((sym) => {
      const c = LIQUITY_V2_BRANCHES[sym.toLowerCase()];
      return {
        sym,
        tm: getAddress(c.troveManager),
        bo: getAddress(c.borrowerOperations),
        pf: getAddress(c.priceFeed),
      };
    });
    const res = await client.multicall({
      allowFailure: true,
      blockNumber: block.number,
      contracts: branches.flatMap(({ tm, bo, pf }) => [
        { address: tm, abi: TM_ABI, functionName: "getEntireBranchColl" } as const,
        { address: tm, abi: TM_ABI, functionName: "getEntireBranchDebt" } as const,
        { address: pf, abi: PF_ABI, functionName: "fetchPrice" } as const,
        { address: pf, abi: PF_ABI, functionName: "lastGoodPrice" } as const,
        { address: bo, abi: BO_ABI, functionName: "CCR" } as const,
        { address: bo, abi: BO_ABI, functionName: "SCR" } as const,
        { address: bo, abi: BO_ABI, functionName: "MCR" } as const,
        { address: bo, abi: BO_ABI, functionName: "hasBeenShutDown" } as const,
      ]),
    });
    const out = emptyBranches();
    branches.forEach(({ sym, tm, bo, pf }, i) => {
      const r = (k: number): unknown => {
        const a = res[i * CALLS_PER_BRANCH + k];
        return a.status === "success" ? a.result : null;
      };
      const coll = r(0) as bigint | null;
      const debt = r(1) as bigint | null;
      const fetched = r(2) as readonly [bigint, boolean] | null;
      const lastGood = r(3) as bigint | null;
      const ccr = r(4) as bigint | null;
      const scr = r(5) as bigint | null;
      const mcr = r(6) as bigint | null;
      const shut = r(7) as boolean | null;
      const fetchedOk = fetched != null && fetched[0] > BigInt(0);
      const price = fetchedOk ? fetched[0] : lastGood;
      if (coll == null || debt == null || price == null || ccr == null || scr == null || mcr == null) return;
      out[sym] = {
        branch: sym,
        troveManager: tm,
        borrowerOperations: bo,
        priceFeed: pf,
        collRaw: coll.toString(),
        debtRaw: debt.toString(),
        priceRaw: price.toString(),
        priceCall: fetchedOk ? "fetchPrice" : "lastGoodPrice",
        ccrRaw: ccr.toString(),
        scrRaw: scr.toString(),
        mcrRaw: mcr.toString(),
        shutDown: shut,
      };
    });
    return { blockNumber: Number(block.number), blockTimestamp: Number(block.timestamp), branches: out };
  } catch (err) {
    console.error("Liquity V2 branch CCR read failed:", err);
    return { blockNumber: 0, blockTimestamp: 0, branches: emptyBranches() };
  }
}
