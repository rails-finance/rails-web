// The sBOLD vault read at one head block, behind /ethereum/liquity-v2/sbold
// (rails-ops ui-jobs 749). SERVER-ONLY.
// ----------------------------------------------------------------------------
// One Multicall3 round at the block the page states: the vault's totalAssets(),
// totalSupply(), convertToAssets(10 ** 18), asset(), name(), symbol() and
// decimals(), paused(), calcFragments(), and each Liquity V2 Stability Pool's
// getCompoundedBoldDeposit(sBOLD), getDepositorYieldGainWithPending(sBOLD),
// getDepositorCollGain(sBOLD) and stashedColl(sBOLD), BOLD.balanceOf(sBOLD),
// and each branch collateral token's balanceOf(sBOLD) (ui-jobs 765).
//
// RULE: a figure is the getter's answer. A getter that fails states no figure
// (lib/liquity-v2/sp-chain-read.ts); a failed getter never becomes a zero.
// Amounts in the vault's asset are stated where asset() answers BOLD; the
// share count where decimals() answers; the share price where decimals()
// answers 18, so that 10 ** 18 is one whole share.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { RawAmount } from "./morpho-base-vault";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { SBOLD_ASSET, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import { LIQUITY_V2_SP_POOLS } from "@/lib/liquity-v2/sp-catalog";
import { SP_BRANCHES, type SpBranch } from "@/lib/liquity-v2/sp-routes";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";

const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function asset() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function paused() view returns (bool)",
  "function calcFragments() view returns (uint256, uint256, uint256, uint256)",
]);
const SP_ABI = parseAbi([
  "function getCompoundedBoldDeposit(address) view returns (uint256)",
  "function getDepositorYieldGainWithPending(address) view returns (uint256)",
  "function getDepositorCollGain(address) view returns (uint256)",
  "function stashedColl(address) view returns (uint256)",
]);
const SP_CALLS = [
  "getCompoundedBoldDeposit",
  "getDepositorYieldGainWithPending",
  "getDepositorCollGain",
  "stashedColl",
] as const;
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

type Call = { status: string; result?: unknown };
const ok = <T>(r: Call | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface SboldDeposit {
  branch: SpBranch;
  /** The branch's Stability Pool, lowercased. */
  pool: string;
  /** `getCompoundedBoldDeposit(sBOLD)` in BOLD; null where the getter failed. */
  compounded: RawAmount | null;
  /** `getDepositorYieldGainWithPending(sBOLD)` in BOLD; null where it failed. */
  yieldPending: RawAmount | null;
  /** The branch's collateral token. */
  coll: { symbol: string; address: string; decimals: number };
  /** `getDepositorCollGain(sBOLD)`, `stashedColl(sBOLD)` and the collateral
   *  token's `balanceOf(sBOLD)`, raw in the collateral; null where one failed. */
  collGainRaw: string | null;
  stashedCollRaw: string | null;
  collHeldRaw: string | null;
}

export interface SboldVaultResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read. */
  head?: PositionHeadStamp;
  /** True when the round failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  vault: {
    address: string;
    name: string | null;
    symbol: string | null;
    /** `decimals()`; null where it failed. */
    shareDecimals: number | null;
    /** `asset()`, lowercased; null where it failed. */
    asset: string | null;
    totalAssets: RawAmount | null;
    totalSupply: RawAmount | null;
    /** `convertToAssets(10 ** 18)` in BOLD. Zero is a reading. */
    sharePrice: RawAmount | null;
    /** `paused()` (ui-jobs 765); null where it failed. */
    paused: boolean | null;
    /** `calcFragments()`'s four answers, raw: totalBold, boldAmount,
     *  collValue, collInBold; null where it failed. */
    fragments: { totalRaw: string; boldRaw: string; collValueRaw: string; collInBoldRaw: string } | null;
  };
  /** One per branch, in SP_BRANCHES order. */
  deposits: SboldDeposit[];
  /** `BOLD.balanceOf(sBOLD)`; null where the getter failed. */
  idle: RawAmount | null;
}

const VAULT_CALLS = [
  "totalAssets",
  "totalSupply",
  "asset",
  "name",
  "symbol",
  "decimals",
  "convertToAssets",
  "paused",
  "calcFragments",
] as const;

const EMPTY_VAULT: SboldVaultResponse["vault"] = {
  address: SBOLD_VAULT,
  name: null,
  symbol: null,
  shareDecimals: null,
  asset: null,
  totalAssets: null,
  totalSupply: null,
  sharePrice: null,
  paused: null,
  fragments: null,
};

export async function loadSboldVault(): Promise<SboldVaultResponse> {
  const pools = SP_BRANCHES.map((branch) => {
    const b = LIQUITY_V2_BRANCHES[branch.toLowerCase()];
    return {
      branch,
      pool: LIQUITY_V2_SP_POOLS[branch].toLowerCase(),
      coll: { symbol: b.symbol, address: b.collateralAddr.toLowerCase(), decimals: b.decimals },
    };
  });
  const unread = { yieldPending: null, collGainRaw: null, stashedCollRaw: null, collHeldRaw: null };
  try {
    const client = vaultHeadClient(MAINNET_CHAIN_ID);
    const blockNumber = await client.getBlockNumber();
    const vault = SBOLD_VAULT as `0x${string}`;
    const contracts: ContractFunctionParameters[] = [
      ...VAULT_CALLS.map((functionName) =>
        functionName === "convertToAssets"
          ? { address: vault, abi: VAULT_ABI, functionName, args: [BigInt(10) ** BigInt(18)] }
          : { address: vault, abi: VAULT_ABI, functionName },
      ),
      ...pools.flatMap(({ pool }) =>
        SP_CALLS.map((functionName) => ({ address: pool as `0x${string}`, abi: SP_ABI, functionName, args: [vault] })),
      ),
      { address: SBOLD_ASSET.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [vault] },
      ...pools.map(({ coll }) => ({
        address: coll.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [vault],
      })),
    ];
    const SP_AT = VAULT_CALLS.length;
    const IDLE_AT = SP_AT + pools.length * SP_CALLS.length;
    const reads = (await client.multicall({ contracts, allowFailure: true, blockNumber })) as Call[];
    const at = <T>(name: (typeof VAULT_CALLS)[number]) => ok<T>(reads[VAULT_CALLS.indexOf(name)]);

    const asset = at<string>("asset")?.toLowerCase() ?? null;
    const inBold = asset === SBOLD_ASSET.address;
    const decimalsRead = at<number>("decimals");
    const shareDecimals = decimalsRead == null ? null : Number(decimalsRead);
    const d = SBOLD_ASSET.decimals;
    const totalAssets = at<bigint>("totalAssets");
    const totalSupply = at<bigint>("totalSupply");
    const sharePrice = at<bigint>("convertToAssets");
    const idleRaw = ok<bigint>(reads[IDLE_AT]);
    const frag = at<readonly [bigint, bigint, bigint, bigint]>("calcFragments");
    const rawAt = (i: number) => ok<bigint>(reads[i])?.toString() ?? null;

    return {
      blockNumber: Number(blockNumber),
      head: serverHeadStampAt(MAINNET_CHAIN_ID, blockNumber),
      chainStale: false,
      vault: {
        address: SBOLD_VAULT,
        name: at<string>("name"),
        symbol: at<string>("symbol"),
        shareDecimals,
        asset,
        totalAssets: inBold && totalAssets != null ? amount(totalAssets, d) : null,
        totalSupply: shareDecimals != null && totalSupply != null ? amount(totalSupply, shareDecimals) : null,
        sharePrice: inBold && shareDecimals === 18 && sharePrice != null ? amount(sharePrice, d) : null,
        paused: at<boolean>("paused"),
        fragments:
          inBold && frag
            ? {
                totalRaw: frag[0].toString(),
                boldRaw: frag[1].toString(),
                collValueRaw: frag[2].toString(),
                collInBoldRaw: frag[3].toString(),
              }
            : null,
      },
      deposits: pools.map(({ branch, pool, coll }, i) => {
        const base = SP_AT + i * SP_CALLS.length;
        const raw = ok<bigint>(reads[base]);
        const y = ok<bigint>(reads[base + 1]);
        return {
          branch,
          pool,
          coll,
          compounded: raw == null ? null : amount(raw, d),
          yieldPending: y == null ? null : amount(y, d),
          collGainRaw: rawAt(base + 2),
          stashedCollRaw: rawAt(base + 3),
          collHeldRaw: rawAt(IDLE_AT + 1 + i),
        };
      }),
      idle: idleRaw == null ? null : amount(idleRaw, d),
    };
  } catch (error) {
    console.error("sBOLD vault chain read failed:", error);
    return {
      blockNumber: 0,
      chainStale: true,
      vault: EMPTY_VAULT,
      deposits: pools.map(({ branch, pool, coll }) => ({ branch, pool, coll, compounded: null, ...unread })),
      idle: null,
    };
  }
}
