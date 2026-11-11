// Compound V3 on Optimism: the three Comets (rails-ops ui-jobs 578). Comet
// enumerates nothing, so the roster is compound-finance/comet
// deployments/optimism/{usdc,usdt,weth}/roots.json (f766f515; three directories
// on 11 Nov 2026), each checked on Optimism on 11 Nov 2026: code at the proxy,
// and the Configurator 0x84E9…2713 (the same roots.json) answers
// getConfiguration(comet) with the Comet's baseToken and base feed. The base
// feeds' description() is "USDC / USD", "USDT / USD" and "Constant price feed",
// so the WETH Comet quotes in ETH. Everything inside a Comet (its collateral,
// factors, caps, rates and prices) is read when a page opens, by rails-server's
// /api/at-block/compound-v3-optimism routes. Client-safe.

import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import type { CometDeployment, CometMarket } from "@/lib/compound/asset-catalog";

const OPTIMISM_MARKETS: CometMarket[] = [
  {
    key: "usdc",
    label: "cUSDCv3",
    comet: "0x2e44e174f7d53f0212823acc11c01a11d58c5bcb",
    baseSymbol: "USDC",
    baseToken: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
  {
    key: "usdt",
    label: "cUSDTv3",
    comet: "0x995e394b8b2437ac8ce61ee0bc610d617962b214",
    baseSymbol: "USDT",
    baseToken: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
  {
    key: "weth",
    label: "cWETHv3",
    comet: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    baseSymbol: "WETH",
    baseToken: "0x4200000000000000000000000000000000000006",
    baseDecimals: 18,
    quoteUnit: "ETH",
  },
];

export const COMPOUND_OPTIMISM_DEPLOYMENT: CometDeployment = {
  chainId: OPTIMISM_CHAIN_ID,
  markets: OPTIMISM_MARKETS,
};

/** The Comet a route's segment names, by roster key in any case; null for a key the roster lacks. */
export function compoundOptimismMarketOf(key: string): CometMarket | null {
  const k = key.toLowerCase();
  return OPTIMISM_MARKETS.find((m) => m.key === k) ?? null;
}

/** The Configurator and CometRewards the three Comets share (roots.json). */
export const COMPOUND_OPTIMISM_CONFIGURATOR = "0x84E93EC6170ED630f5ebD89A1AAE72d4F63f2713";
export const COMPOUND_OPTIMISM_REWARDS = "0x443EA0340cb75a160F31A440722dec7b5bc3C2E9";
