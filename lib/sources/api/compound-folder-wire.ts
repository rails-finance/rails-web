// SERVER-ONLY — a Compound folder, renamed into the page's vocabulary.
// ----------------------------------------------------------------------------
// rails-server keys the Compound family's folder legs, flows and cells as the
// opening balance keys the same asset (rails-server
// `api/src/services/compound-timeline-folders.ts`): a Compound V2 market by its
// KEY ('usdc', 'wbtc2'), a Compound V3 base leg by the Comet slug and a V3
// collateral leg by its token address. `toServedFolder` resolves a token
// address and keeps any other key as it came, which is right for the flows
// (the two economics reducers merge by market key) and wrong for a header
// leg, whose `symbol` is the name the rows file the asset under. So each
// `/timeline` and `/timeline/folder` proxy passes its folders through here:
// the catalog the rows resolve through names every key, and a market-keyed
// leg takes the market's symbol.
//
// ONE V2 LEG IS IN cTOKENS. "Seized" sums the borrower's `seize_out` legs in
// the collateral market's cToken, the denomination the single seize card and
// the client run spec draw (`lib/compound-v2/timeline-runs.tsx`). It is keyed
// by the market like every V2 leg, so its verb is what says so: it scales at
// cToken decimals and draws the cToken's symbol, filed under the market's for
// the asset filter.

import { COMPOUND_V2_MARKET_BY_KEY, CTOKEN_DECIMALS } from "@/lib/compound-v2/asset-catalog";
import { COMPOUND_MARKETS } from "@/lib/compound/asset-catalog";
import type { Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { toServedFolder, type FolderAssetResolver, type UpstreamFolder } from "@/lib/sources/api/timeline-folder-wire";

/** The V2 header verb whose amount is the collateral market's cTokens. */
const V2_CTOKEN_VERB = "Seized";

const V2_RESOLVER: FolderAssetResolver = {
  symbol: (key) => COMPOUND_V2_MARKET_BY_KEY[key]?.symbol,
  decimals: (key) => COMPOUND_V2_MARKET_BY_KEY[key]?.decimals,
};

/** A Compound V2 folder as the page reads it. Every key is a market key and
 *  the fixed catalog names them all, so no chain read is needed. */
export function compoundV2ServedFolder(folder: UpstreamFolder): ServedFolder {
  const served = toServedFolder(folder, V2_RESOLVER);
  return {
    ...served,
    legs: served.legs.map((leg) => {
      const m = COMPOUND_V2_MARKET_BY_KEY[leg.asset];
      if (!m) return { ...leg, symbol: null };
      return leg.verb === V2_CTOKEN_VERB
        ? { ...leg, symbol: m.symbol, displaySymbol: m.cSymbol, decimals: CTOKEN_DECIMALS }
        : { ...leg, symbol: m.symbol, decimals: m.decimals };
    }),
  };
}

const isTokenAddress = (key: string) => /^0x[0-9a-f]{40}$/i.test(key);

/** Every token address a Compound V3 answer's folders name, for the one ERC20
 *  read the route already makes for its rows. Comet slugs are not addresses
 *  and never enter it. */
export function compoundFolderTokenAddresses(folders: UpstreamFolder[]): string[] {
  const out = new Set<string>();
  for (const f of folders) {
    for (const leg of f.legs) if (leg.assetKeyKind === "tokenAddress" && leg.asset) out.add(leg.asset.toLowerCase());
    for (const b of f.flows ?? []) if (b.keyKind === "tokenAddress" && b.key) out.add(b.key.toLowerCase());
    for (const c of f.cells ?? []) for (const a of c.assets) if (isTokenAddress(a)) out.add(a.toLowerCase());
  }
  return [...out];
}

/** A Compound V3 folder as the page reads it: a Comet slug takes the market's
 *  base symbol and decimals, a token address its ERC20 read. A token whose
 *  decimals did not load leaves its pair undrawn (decimals null). */
export function compoundServedFolder(folder: UpstreamFolder, metas: Map<string, Erc20Meta>): ServedFolder {
  const resolver: FolderAssetResolver = {
    symbol: (key) => (isTokenAddress(key) ? metas.get(key.toLowerCase())?.symbol : COMPOUND_MARKETS[key]?.baseSymbol),
    decimals: (key) =>
      isTokenAddress(key)
        ? metas.get(key.toLowerCase())?.unresolved
          ? undefined
          : metas.get(key.toLowerCase())?.decimals
        : COMPOUND_MARKETS[key]?.baseDecimals,
  };
  const served = toServedFolder(folder, resolver);
  return {
    ...served,
    legs: served.legs.map((leg) =>
      leg.assetKeyKind === "marketKey" ? { ...leg, symbol: COMPOUND_MARKETS[leg.asset]?.baseSymbol ?? null } : leg,
    ),
  };
}
