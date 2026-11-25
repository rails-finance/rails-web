// The presence checks (rails-ops decision 0073 point 2; lib/wallet/presence.ts): one entry per
// visit module and per liquidity source. Each check asks, in the calls one multicall can carry,
// whether the wallet holds anything the read behind it would draw.

import { parseAbi } from "viem";
import { AAVE_V3_OPTIMISM_CONTRACTS } from "@/lib/aave-v3-optimism/types";
import { COMPOUND_OPTIMISM_DEPLOYMENT } from "@/lib/compound-v3-optimism/asset-catalog";
import { STETH, WITHDRAWAL_QUEUE, WSTETH } from "@/lib/lido/types";
import { MAINNET_CHAIN_ID, OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import { positive, type Presence } from "@/lib/wallet/presence";

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

/** Lido on Ethereum, for its module (ui-jobs 852 step 3): stETH, wstETH and the withdrawal
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

/** A liquidity source whose check the uniswap session writes (decision 0073, Consequences):
 *  until it lands, the source reads as before. */
const UNISWAP_SESSION_SLOT = (what: string): Presence => ({
  kind: "none",
  why: `${what}: the check is the uniswap session's to add`,
});

/** One entry per LIQUIDITY_SOURCES key (lib/wallet/liquidity/sources.ts).
 *  THE UNISWAP SESSION'S SLOTS: each `UNISWAP_SESSION_SLOT` is replaced by a `kind: "check"`
 *  entry, for example `balanceOf(owner)` on the chain's position-manager NFTs (Uniswap V3 and V4,
 *  PancakeSwap V3, Slipstream's), every call for one chain in the same multicall. */
export const LIQUIDITY_PRESENCE: Record<string, Presence> = {
  "uniswap:1": UNISWAP_SESSION_SLOT("Uniswap V3 and V4 on Ethereum"),
  "uniswap:8453": UNISWAP_SESSION_SLOT("Uniswap V3 on Base"),
  "uniswap:42161": UNISWAP_SESSION_SLOT("Uniswap V3 and V4 on Arbitrum"),
  "uniswap:10": UNISWAP_SESSION_SLOT("Uniswap V3 and V4 on Optimism"),
  "uniswap:5042": UNISWAP_SESSION_SLOT("Uniswap V3 and V4 on Arc"),
  "pancakeswap:8453": UNISWAP_SESSION_SLOT("PancakeSwap V3 on Base"),
  "pancakeswap:42161": UNISWAP_SESSION_SLOT("PancakeSwap V3 on Arbitrum"),
  "aerodrome:8453": UNISWAP_SESSION_SLOT("Aerodrome's Slipstream on Base"),
  "velodrome:10": UNISWAP_SESSION_SLOT("Velodrome's Slipstream on Optimism"),
  "balancer:1": {
    kind: "none",
    why: "Balancer V3 pool shares are each pool's own token; no one call answers for every pool",
  },
  "balancer:42161": {
    kind: "none",
    why: "Balancer V3 pool shares are each pool's own token; no one call answers for every pool",
  },
};
