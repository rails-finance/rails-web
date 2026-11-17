// Live reads for one Polaris stability-pool deposit and one reserve loan.
// SERVER-ONLY: imported by the two /api/chain/polaris routes.
//
// Every getter was probed against Sepolia on 17 Nov 2026 (rails-ops
// TO-DO-stability-pool-deposits.md §2, TO-DO-polaris-scoping.md §8b; the
// pools and the loans manager are unverified contracts). Each page is one
// head block and one multicall at it:
//
//   • deposit: the pool's getCompoundedStableTokenDeposit, deposits,
//     depositSnapshots (S, P, B, scale), getDepositorStableTokenGainWithPending
//     (the gain a touch pays), getDepositorBcTokenGain (pETH since the last
//     touch; stashedBcTokens holds what earlier touches left unclaimed),
//     stashedBcTokens, ownerOf (reverts once burned), P(); and the market's
//     priceFeed.previewPrice() for the pending pETH in the stablecoin.
//   • loan: the manager's loans(id) (fpCollateral, shares), getLoanDebt(id),
//     debtPerShare(); the loan NFT's ownerOf; the bonding curve's floorPrice().

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { POLARIS_CHAIN_ID, POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import type { PolarisDepositChain, PolarisLoanChain } from "@/lib/api/fetch-polaris-sp-loans-chain";

const POOL_ABI = parseAbi([
  "function getCompoundedStableTokenDeposit(uint256) view returns (uint256)",
  "function deposits(uint256) view returns (uint256)",
  "function depositSnapshots(uint256) view returns (uint256, uint256, uint256, uint256)",
  "function getDepositorStableTokenGainWithPending(uint256) view returns (uint256)",
  "function getDepositorBcTokenGain(uint256) view returns (uint256)",
  "function stashedBcTokens(uint256) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function P() view returns (uint256)",
]);
const FEED_ABI = parseAbi(["function previewPrice() view returns (uint256)"]);
const MANAGER_ABI = parseAbi([
  "function loans(uint256) view returns (uint256, uint256)",
  "function getLoanDebt(uint256) view returns (uint256)",
  "function debtPerShare() view returns (uint256)",
]);
const NFT_ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const CURVE_ABI = parseAbi(["function floorPrice() view returns (uint256)"]);

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);
const s = (v: bigint | null): string => (v == null ? "0" : v.toString());

export async function loadPolarisDepositFromChain(
  market: PolarisMarket,
  tokenId: string,
): Promise<PolarisDepositChain> {
  const cfg = POLARIS_MARKET_CONFIG[market];
  const pool = getAddress(cfg.stabilityPool);
  const id = BigInt(tokenId);
  const stub: PolarisDepositChain = {
    market,
    tokenId,
    blockNumber: 0,
    blockTimestamp: 0,
    compoundedRaw: "0",
    recordedRaw: "0",
    snapshotP: "0",
    stableGainRaw: "0",
    bcGainRaw: "0",
    stashedRaw: "0",
    owner: null,
    p: "0",
    pethInStableRaw: null,
    chainStale: true,
  };
  try {
    const client = chainClient(POLARIS_CHAIN_ID);
    const head = await client.getBlock();
    const perToken = [
      "getCompoundedStableTokenDeposit",
      "deposits",
      "depositSnapshots",
      "getDepositorStableTokenGainWithPending",
      "getDepositorBcTokenGain",
      "stashedBcTokens",
      "ownerOf",
    ] as const;
    const res = (await client.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        ...perToken.map((functionName) => ({ address: pool, abi: POOL_ABI, functionName, args: [id] })),
        { address: pool, abi: POOL_ABI, functionName: "P" },
        { address: getAddress(cfg.priceFeed), abi: FEED_ABI, functionName: "previewPrice" },
      ] as const,
    })) as Res[];
    const compounded = ok<bigint>(res[0]);
    if (compounded == null) return stub;
    const snaps = ok<readonly bigint[]>(res[2]);
    const price = ok<bigint>(res[8]);
    return {
      market,
      tokenId,
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      compoundedRaw: s(compounded),
      recordedRaw: s(ok<bigint>(res[1])),
      snapshotP: snaps ? snaps[1].toString() : "0",
      stableGainRaw: s(ok<bigint>(res[3])),
      bcGainRaw: s(ok<bigint>(res[4])),
      stashedRaw: s(ok<bigint>(res[5])),
      owner: ok<string>(res[6])?.toLowerCase() ?? null,
      p: s(ok<bigint>(res[7])),
      pethInStableRaw: price == null ? null : price.toString(),
    };
  } catch (err) {
    console.error("Polaris deposit chain read failed:", err);
    return stub;
  }
}

export async function loadPolarisLoanFromChain(loanId: string): Promise<PolarisLoanChain> {
  const manager = getAddress(POLARIS_CORE.reserveLoansManager);
  const id = BigInt(loanId);
  const stub: PolarisLoanChain = {
    loanId,
    blockNumber: 0,
    blockTimestamp: 0,
    collRaw: "0",
    sharesRaw: "0",
    debtRaw: "0",
    debtPerShareRaw: "0",
    floorPriceRaw: "0",
    owner: null,
    chainStale: true,
  };
  try {
    const client = chainClient(POLARIS_CHAIN_ID);
    const head = await client.getBlock();
    const res = (await client.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        { address: manager, abi: MANAGER_ABI, functionName: "loans", args: [id] },
        { address: manager, abi: MANAGER_ABI, functionName: "getLoanDebt", args: [id] },
        { address: manager, abi: MANAGER_ABI, functionName: "debtPerShare" },
        { address: getAddress(POLARIS_CORE.reserveLoansNft), abi: NFT_ABI, functionName: "ownerOf", args: [id] },
        { address: getAddress(POLARIS_CORE.bondingCurve), abi: CURVE_ABI, functionName: "floorPrice" },
      ] as const,
    })) as Res[];
    const loan = ok<readonly bigint[]>(res[0]);
    if (loan == null) return stub;
    return {
      loanId,
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      collRaw: loan[0].toString(),
      sharesRaw: loan[1].toString(),
      debtRaw: s(ok<bigint>(res[1])),
      debtPerShareRaw: s(ok<bigint>(res[2])),
      floorPriceRaw: s(ok<bigint>(res[4])),
      owner: ok<string>(res[3])?.toLowerCase() ?? null,
    };
  } catch (err) {
    console.error("Polaris loan chain read failed:", err);
    return stub;
  }
}
