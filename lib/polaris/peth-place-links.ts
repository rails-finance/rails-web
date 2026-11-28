// Where a pETH account row's place opens (ui-jobs 872): a CDP, a reserve loan
// and a Stability Pool deposit open their pages in the explorer; a venue,
// the svpETH vault, the splitter, the bonding curve, Morpho Blue and the zap
// router have no page here and open on Sepolia's block explorer. The place's names are the
// deployment catalog's (lib/polaris/peth-ledger.ts states the words).

import {
  POLARIS_MARKET_CONFIG,
  POLARIS_MARKETS,
  POLARIS_VENUES,
  type PolarisMarket,
} from "@/lib/polaris/asset-catalog";
import { polarisDepositHref, polarisLoanHref, polarisPositionHref } from "@/lib/polaris/routes";
import { explorerUrl, SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";
import type { PethPlaceNames } from "@/lib/polaris/peth-ledger";
import type { PethPlace } from "@/lib/sources/api/polaris-peth";

export const PETH_PLACE_NAMES: PethPlaceNames = {
  stable: Object.fromEntries(POLARIS_MARKETS.map((m) => [m, POLARIS_MARKET_CONFIG[m].stable.symbol])),
  venues: POLARIS_VENUES,
};

const isMarket = (m: string | undefined): m is PolarisMarket => m === "usdp" || m === "goldp";

/** The place's page, and whether it is outside Rails; null where the place
 *  lacks what its page needs. */
export function pethPlaceHref(p: PethPlace): { href: string; external: boolean } | null {
  if (p.kind === "cdp")
    return isMarket(p.market) && p.id ? { href: polarisPositionHref(p.market, p.id), external: false } : null;
  if (p.kind === "sp_deposit")
    return isMarket(p.market) && p.id ? { href: polarisDepositHref(p.market, p.id), external: false } : null;
  if (p.kind === "loan") return p.id ? { href: polarisLoanHref(p.id), external: false } : null;
  return p.address ? { href: explorerUrl(SEPOLIA_CHAIN_ID, "address", p.address), external: true } : null;
}
