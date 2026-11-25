// The presence checks (rails-ops decision 0073 point 2; lib/wallet/presence.ts): one entry per
// visit module and per liquidity source. Each check asks, in the calls one multicall can carry,
// whether the wallet holds anything the read behind it would draw.

import { parseAbi } from "viem";
import { AAVE_V3_OPTIMISM_CONTRACTS } from "@/lib/aave-v3-optimism/types";
import { COMPOUND_OPTIMISM_DEPLOYMENT } from "@/lib/compound-v3-optimism/asset-catalog";
import { FLUID_BASE_CONTRACTS } from "@/lib/fluid-base/types";
import { STETH, WITHDRAWAL_QUEUE, WSTETH } from "@/lib/lido/types";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import { positive, type Presence } from "@/lib/wallet/presence";
import { UNI_DEPLOYMENTS, type UniDeployment } from "@/lib/uniswap/deployments";

const UI_POOL_ABI = parseAbi([
  "struct UserReserveData { address underlyingAsset; uint256 scaledATokenBalance; bool usageAsCollateralEnabledOnUser; uint256 scaledVariableDebt; }",
  "function getUserReservesData(address provider, address user) view returns (UserReserveData[], uint8)",
]);
const COMET_ABI = parseAbi([
  "function userBasic(address account) view returns (int104 principal, uint64 baseTrackingIndex, uint64 baseTrackingAccrued, uint16 assetsIn, uint8 _reserved)",
]);
const BALANCE_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** Aave V3 on Optimism: the UiPoolDataProvider's reserves for the wallet, one call. A balance in
 *  any reserve is a position, the explorer's own test (lib/wallet/families/optimism.ts). */
export const AAVE_V3_OPTIMISM_PRESENCE: Presence = {
  kind: "check",
  chainId: OPTIMISM_CHAIN_ID,
  calls: (owner) => [
    {
      address: AAVE_V3_OPTIMISM_CONTRACTS.uiPoolDataProvider,
      abi: UI_POOL_ABI,
      functionName: "getUserReservesData",
      args: [AAVE_V3_OPTIMISM_CONTRACTS.addressesProvider, owner],
    },
  ],
  held: ([r]) => {
    const [reserves] = r as readonly [readonly { scaledATokenBalance: bigint; scaledVariableDebt: bigint }[], number];
    return reserves.some((x) => positive(x.scaledATokenBalance) || positive(x.scaledVariableDebt));
  },
};

/** Compound V3 on Optimism: each Comet's `userBasic`, one call per Comet. A principal other than
 *  zero is a supply or a borrow of the base asset; `assetsIn` flags each collateral held. */
export const COMPOUND_V3_OPTIMISM_PRESENCE: Presence = {
  kind: "check",
  chainId: OPTIMISM_CHAIN_ID,
  calls: (owner) =>
    COMPOUND_OPTIMISM_DEPLOYMENT.markets.map((m) => ({
      address: m.comet as `0x${string}`,
      abi: COMET_ABI,
      functionName: "userBasic",
      args: [owner],
    })),
  held: (results) =>
    results.some((r) => {
      const [principal, , , assetsIn] = r as readonly [bigint, bigint, bigint, number, number];
      return principal !== BigInt(0) || Number(assetsIn) !== 0;
    }),
};

/** Morpho Blue answers a position one market at a time, so no call answers for the wallet. */
export const MORPHO_BLUE_PRESENCE: Presence = {
  kind: "none",
  why: "Morpho Blue states a position one market at a time; no call answers for every market",
};

/** Lido on Ethereum: stETH, wstETH and the withdrawal
 *  queue's NFTs, three balanceOf calls. */
export const LIDO_PRESENCE: Presence = {
  kind: "check",
  chainId: MAINNET_CHAIN_ID,
  calls: (owner) =>
    [STETH, WSTETH, WITHDRAWAL_QUEUE].map((address) => ({
      address: address as `0x${string}`,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [owner],
    })),
  held: (results) => results.some(positive),
};

/** Fluid on Base: its positions are the VaultFactory's NFTs, so one balanceOf call. An NFT
 *  counts whatever it holds; the read behind it skips an empty one. */
export const FLUID_BASE_PRESENCE: Presence = {
  kind: "check",
  chainId: BASE_CHAIN_ID,
  calls: (owner) => [
    {
      address: FLUID_BASE_CONTRACTS.vaultFactory as `0x${string}`,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [owner],
    },
  ],
  held: ([n]) => positive(n),
};

/** Uniswap V3 and V4, or PancakeSwap V3, on one chain: balanceOf(owner) on the V3 position
 *  manager, on the V4 one where the chain has V4, and on PancakeSwap's MasterChefV3, which holds
 *  a farmed position's NFT and counts it for its staker. A position NFT counts whatever its
 *  liquidity; the read behind it decides what it draws. */
function uniPresence(d: UniDeployment): Presence {
  const managers = [d.v3Npm, d.v4PositionManager, d.masterChef].filter((a): a is string => a != null);
  return {
    kind: "check",
    chainId: d.chainId,
    calls: (owner) =>
      managers.map((address) => ({
        address: address as `0x${string}`,
        abi: BALANCE_ABI,
        functionName: "balanceOf",
        args: [owner],
      })),
    held: (results) => results.some(positive),
  };
}

const uni = (protocol: UniDeployment["protocol"], chainId: UniDeployment["chainId"]): Presence => {
  const d = UNI_DEPLOYMENTS.find((x) => x.protocol === protocol && x.chainId === chainId);
  if (!d) throw new Error(`no ${protocol} deployment on chain ${chainId}`);
  return uniPresence(d);
};

/** Slipstream (Aerodrome, Velodrome): a staked position's NFT sits in its pool's gauge, which
 *  names its staker only to a call on that gauge, so no call answers for every pool. */
const SLIPSTREAM_NONE: Presence = {
  kind: "none",
  why: "a staked Slipstream position sits in its pool's gauge; no one call answers for every gauge",
};

const BALANCER_NONE: Presence = {
  kind: "none",
  why: "Balancer V3 pool shares are each pool's own token; no one call answers for every pool",
};

/** One entry per LIQUIDITY_SOURCES key (lib/wallet/liquidity/sources.ts). */
export const LIQUIDITY_PRESENCE: Record<string, Presence> = {
  "uniswap:1": uni("uniswap", 1),
  "uniswap:8453": uni("uniswap", 8453),
  "uniswap:42161": uni("uniswap", 42161),
  "uniswap:10": uni("uniswap", 10),
  "uniswap:5042": uni("uniswap", 5042),
  "pancakeswap:8453": uni("pancakeswap", 8453),
  "pancakeswap:42161": uni("pancakeswap", 42161),
  "aerodrome:8453": SLIPSTREAM_NONE,
  "velodrome:10": SLIPSTREAM_NONE,
  "balancer:1": BALANCER_NONE,
  "balancer:42161": BALANCER_NONE,
};
