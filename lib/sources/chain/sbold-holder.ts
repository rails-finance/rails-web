// One address's sBOLD holding at one block (rails-ops ui-jobs 765). SERVER-ONLY.
// ----------------------------------------------------------------------------
// Two Multicall3 rounds pinned to one block: the vault's balanceOf(holder),
// totalAssets(), totalSupply() and decimals(); then convertToAssets(balance).
//
// RULE: a figure is the getter's answer; a failed getter states no figure and
// never becomes a zero. No history and no PnL are read here.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { SBOLD_ASSET, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";

const ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function symbol() view returns (string)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

type Call = { status: string; result?: unknown };
const ok = <T>(r: Call | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

export interface SboldHolding {
  blockNumber: number;
  head?: PositionHeadStamp;
  chainStale: boolean;
  holder: string;
  symbol: string | null;
  shareDecimals: number | null;
  /** Raw integers, as the getters answer; null where one failed. */
  sharesRaw: string | null;
  totalAssetsRaw: string | null;
  totalSupplyRaw: string | null;
  /** `convertToAssets(balanceOf(holder))`, raw BOLD; null where it failed. */
  claimRaw: string | null;
}

export async function loadSboldHolding(holder: string): Promise<SboldHolding> {
  const empty = {
    holder,
    symbol: null,
    shareDecimals: null,
    sharesRaw: null,
    totalAssetsRaw: null,
    totalSupplyRaw: null,
    claimRaw: null,
  };
  try {
    const client = vaultHeadClient(MAINNET_CHAIN_ID);
    const blockNumber = await client.getBlockNumber();
    const vault = SBOLD_VAULT as `0x${string}`;
    const first: ContractFunctionParameters[] = [
      { address: vault, abi: ABI, functionName: "balanceOf", args: [holder as `0x${string}`] },
      { address: vault, abi: ABI, functionName: "totalAssets" },
      { address: vault, abi: ABI, functionName: "totalSupply" },
      { address: vault, abi: ABI, functionName: "decimals" },
      { address: vault, abi: ABI, functionName: "asset" },
      { address: vault, abi: ABI, functionName: "symbol" },
    ];
    const r = (await client.multicall({ contracts: first, allowFailure: true, blockNumber })) as Call[];
    const shares = ok<bigint>(r[0]);
    const inBold = ok<string>(r[4])?.toLowerCase() === SBOLD_ASSET.address;
    const decimals = ok<number>(r[3]);
    let claim: bigint | null = null;
    if (shares != null && inBold) {
      const c = (await client.multicall({
        contracts: [{ address: vault, abi: ABI, functionName: "convertToAssets", args: [shares] }],
        allowFailure: true,
        blockNumber,
      })) as Call[];
      claim = ok<bigint>(c[0]);
    }
    return {
      blockNumber: Number(blockNumber),
      head: serverHeadStampAt(MAINNET_CHAIN_ID, blockNumber),
      chainStale: false,
      holder,
      symbol: ok<string>(r[5]),
      shareDecimals: decimals == null ? null : Number(decimals),
      sharesRaw: shares?.toString() ?? null,
      totalAssetsRaw: inBold ? (ok<bigint>(r[1])?.toString() ?? null) : null,
      totalSupplyRaw: ok<bigint>(r[2])?.toString() ?? null,
      claimRaw: claim?.toString() ?? null,
    };
  } catch (error) {
    console.error("sBOLD holder chain read failed:", error);
    return { blockNumber: 0, chainStale: true, ...empty };
  }
}
