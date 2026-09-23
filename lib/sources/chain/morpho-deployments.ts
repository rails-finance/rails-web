// Which Morpho Blue a reader is reading — server-only.
// ----------------------------------------------------------------------------
// Blue is the same singleton at the same address on both chains, so a
// deployment is not really "which contract" — it is WHICH ROSTER, and the
// rosters are the one thing that cannot be read at request time. Blue exposes
// no enumeration: `idToMarketParams(id)` answers for an id you already have and
// there is no `marketsLength()`, so the only complete list of markets is the
// `CreateMarket` log. That is censused offline and shipped as data
// (scripts/census-morpho-markets.mjs), one generated module per chain.
//
// This file exists rather than putting the descriptors in the asset catalogs
// because those are imported by CLIENT components, and the two catalogs are
// 344 KB and 873 KB. A descriptor that names one drags it into the browser
// bundle; a descriptor that lives here, next to the readers that use it, does
// not.
//
// SERVER-ONLY.

import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { MORPHO_ADDRESSES } from "@/lib/morpho/asset-catalog";
import { MORPHO_BASE_BLUE } from "@/lib/morpho-base/asset-catalog";
import {
  MORPHO_MARKETS as L1_MARKETS,
  MORPHO_MARKET_CENSUS_BLOCK as L1_CENSUS_BLOCK,
  type MorphoMarketCatalogEntry,
} from "@/lib/morpho/market-catalog";
import {
  MORPHO_MARKETS as BASE_MARKETS,
  MORPHO_MARKET_CENSUS_BLOCK as BASE_CENSUS_BLOCK,
} from "@/lib/morpho-base/market-catalog";

export interface MorphoDeployment {
  chainId: ChainId;
  /** The Blue singleton. Identical on both chains, and named per-deployment
   *  anyway so a reader can never be pointed at a roster from one chain and a
   *  contract from another. */
  blue: string;
  /** Every market this deployment has ever created, in creation order.
   *  COMPLETE as of `censusBlock`, not a floor — createMarket() is the
   *  singleton's only market-making entry point and it always emits. */
  markets: readonly MorphoMarketCatalogEntry[];
  /** The block the roster was censused at. Markets created after it are absent
   *  until the census is re-run, and every surface states this block rather
   *  than implying the roster is live. */
  censusBlock: number;
}

/** Morpho Blue on Ethereum — 1,648 markets. */
export const MORPHO_DEPLOYMENT: MorphoDeployment = {
  chainId: MAINNET_CHAIN_ID,
  blue: MORPHO_ADDRESSES.MORPHO_BLUE,
  markets: L1_MARKETS,
  censusBlock: L1_CENSUS_BLOCK,
};

/** Morpho Blue on Base — 4,306 markets, two and a half times Ethereum's, and
 *  the same nine distinct LLTVs. */
export const MORPHO_BASE_DEPLOYMENT: MorphoDeployment = {
  chainId: BASE_CHAIN_ID,
  blue: MORPHO_BASE_BLUE,
  markets: BASE_MARKETS,
  censusBlock: BASE_CENSUS_BLOCK,
};
