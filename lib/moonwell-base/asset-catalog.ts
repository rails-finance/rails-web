// Moonwell on Base — the deployment's identity, and deliberately nothing else.
// ----------------------------------------------------------------------------
// Moonwell began on Moonbeam and Base; Ethereum came years later and is the
// protocol's smallest outpost. So the shape here is the opposite of its
// sibling's. `lib/moonwell/asset-catalog.ts` writes down four markets with
// their symbols, decimals and collateral factors, because four is small enough
// to write down and because those market keys are the backend index's own
// tags. Base has twenty-one markets, governance keeps listing more, and no
// index stands behind this explorer — so nothing is written down that the
// Comptroller will state itself:
//
//   • the market roster is `getAllMarkets()`,
//   • the oracle is `oracle()`,
//   • collateral factors, caps and the liquidation constants are the
//     Comptroller's own live parameters,
//   • symbols and decimals come from each market's own underlying ERC20.
//
// Writing any of those down would be a copy that can go stale against the
// contract that enforces it. Only the Comptroller is written down, and that is
// the one address the rest hangs off.
//
// One fact that does NOT survive the copy from Ethereum: a market cannot be
// identified by symbol here. Base lists both the bridged and the native USDC
// markets, and both mTokens answer `symbol()` = "mUSDC" — only the mToken
// address is unique, and the readers key on it.

import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { MoonwellDeployment } from "@/lib/moonwell/asset-catalog";

/** The Comptroller (Unitroller proxy) governing Moonwell's Base markets.
 *  Verified on chain 2026-08-23: 21 listed markets, close factor 0.5,
 *  liquidation incentive 1.10, oracle 0xEC942bE8…a9d0 — and, as on Ethereum,
 *  `borrowRatePerTimestamp()` answers while `borrowRatePerBlock()` reverts, so
 *  the fork's per-second accrual convention holds on both chains. */
export const MOONWELL_BASE_COMPTROLLER = "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c" as const;

/** The chain every address here lives on. */
export const MOONWELL_BASE_CHAIN_ID = BASE_CHAIN_ID;

/** The Comptroller's first block — the floor of a whole-life event sweep, and
 *  what lets the timeline claim COMPLETENESS rather than a horizon: no market
 *  existed before the Comptroller did (the first three were listed at
 *  2,162,514–2,162,567, the rest later), so nothing this deployment has ever
 *  emitted predates it. Resolved by binary search over `eth_getCode`. */
export const MOONWELL_BASE_DEPLOY_BLOCK = 2_162_390;

/** The MultiRewardDistributor — the one contract on this deployment that
 *  indexes the ACCOUNT on every action, and therefore the anchor a whole-life
 *  sweep hangs off. See lib/sources/chain/moonwell-events.ts for why the
 *  mTokens' own events cannot be swept per wallet.
 *
 *  Two facts about it, both read from the chain rather than assumed, and both
 *  load-bearing for the sweep's completeness claim (2026-08-25):
 *    • It is the ONLY distributor the Comptroller has ever had. The whole-chain
 *      census of `NewRewardDistributor` logs has one entry, at block 2,162,597,
 *      setting this address from zero. The reader still reads the live
 *      `rewardDistributor()` on every request and sweeps both, so a governance
 *      swap tomorrow would widen the sweep rather than blind it.
 *    • Every one of the twenty-one markets received its first reward config in
 *      the same block it was listed (eighteen of them) or within ~100 blocks
 *      of launch (the first three, before public use). A market with no
 *      config would emit nothing here, and there has been no such market. */
export const MOONWELL_BASE_REWARD_DISTRIBUTOR = "0xe9005b078701e2a0948d2eac43010d35870ad9d2" as const;

/** The WETH Router — proxies native-ETH mints and repayments on the WETH
 *  market. On a routed mint the Mint log's `minter` is this contract and the
 *  owner is the recipient of the same-transaction router-leg Transfer, exactly
 *  the resolution the Ethereum index does (mig 098). Measured 2026-08-25: 588
 *  of 16,717 mints over 200k blocks were routed, so the resolution is not a
 *  corner case here. */
export const MOONWELL_BASE_WETH_ROUTER = "0x70778cfcfc475c7ea0f24cc625baf6eae475d0c9" as const;

/** What the shared Moonwell chain readers take to read Base instead of
 *  Ethereum. `fixed: null` is the whole difference: resolve the roster and the
 *  oracle from the Comptroller on every read rather than trusting a list. */
export const MOONWELL_BASE_DEPLOYMENT: MoonwellDeployment = {
  chainId: BASE_CHAIN_ID,
  comptroller: MOONWELL_BASE_COMPTROLLER,
  fixed: null,
};
