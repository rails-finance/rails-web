// A Polaris market's keys under Focus (ui-jobs 557): its stablecoin and pETH,
// the collateral both markets share.

import { assetKey } from "@/lib/shared/asset-family";
import { PETH, POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";

export const polarisMarketKeys = (m: PolarisMarket): string[] => [
  assetKey(POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG[m].stable.address),
  assetKey(POLARIS_CHAIN_ID, PETH.address),
];
