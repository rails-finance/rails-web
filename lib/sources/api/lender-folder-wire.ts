// SERVER-ONLY — a MakerDAO, Morpho or Maple folder, renamed into the page's
// vocabulary.
// ----------------------------------------------------------------------------
// rails-server keys these families' folder legs on the position's own sides
// (rails-server `api/src/services/makerdao-timeline-folders.ts`,
// `morpho-timeline-folders.ts`, `maple-timeline-folders.ts`):
//
//   MakerDAO — `collateral` (ink, wad) and `debtDai` (|dart| × the Vat rate at
//              the row's block, a rad: 45 decimals), named from the vault's ilk;
//   Morpho   — `collateral` and `loan`, named from the market params the rows
//              resolve through;
//   Maple    — the pool key, filed under the pool's funds asset (USDC, USDT),
//              which is the key `getEventAssetKeys` gives the same event.
//
// `toServedFolder` keeps a key that is not a token address as it came, which
// is right for the flows (each economics reducer merges them by the summary's
// own keys) and wrong for a header leg, whose `symbol` is the name the rows
// file the asset under. So each `/timeline` and `/timeline/folder` proxy passes
// its folders through here.

import { ilkDebtMeta, ilkToCollateralSymbol } from "@/lib/makerdao/asset-catalog";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import type { Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { toServedFolder, type FolderAssetResolver, type UpstreamFolder } from "@/lib/sources/api/timeline-folder-wire";

/** Ink is a wad; the DAI a frob moved is a rad (wad × ray). */
const INK_DECIMALS = 18;
const RAD_DECIMALS = 45;

function withLegs(folder: UpstreamFolder, resolve: FolderAssetResolver): ServedFolder {
  const served = toServedFolder(folder, resolve);
  return {
    ...served,
    legs: served.legs.map((leg) => ({
      ...leg,
      symbol: resolve.symbol(leg.asset) ?? null,
      decimals: resolve.decimals(leg.asset) ?? null,
    })),
  };
}

/** A MakerDAO folder as the page reads it, named from the vault's ilk. */
export function makerServedFolder(folder: UpstreamFolder, ilk: string | null): ServedFolder {
  const resolve: FolderAssetResolver = {
    symbol: (key) =>
      !ilk
        ? undefined
        : key === "collateral"
          ? ilkToCollateralSymbol(ilk)
          : key === "debtDai"
            ? ilkDebtMeta(ilk).symbol
            : undefined,
    decimals: (key) => (key === "collateral" ? INK_DECIMALS : key === "debtDai" ? RAD_DECIMALS : undefined),
  };
  return withLegs(folder, resolve);
}

/** A Morpho folder as the page reads it. A token whose decimals did not load
 *  leaves its pair undrawn (decimals null), as its rows say "not read". */
export function morphoServedFolder(
  folder: UpstreamFolder,
  meta: { loan: Erc20Meta; collateral: Erc20Meta | null } | null,
): ServedFolder {
  // `loan` keys a header leg and `debt` a flow bucket (the summary's key);
  // both are the loan token.
  const side = (key: string): Erc20Meta | null | undefined =>
    key === "loan" || key === "debt" ? meta?.loan : key === "collateral" ? meta?.collateral : undefined;
  const resolve: FolderAssetResolver = {
    symbol: (key) => side(key)?.symbol,
    decimals: (key) => {
      const m = side(key);
      return m && !m.unresolved ? m.decimals : undefined;
    },
  };
  return withLegs(folder, resolve);
}

/** A Maple folder as the page reads it: a pool key is filed under its funds
 *  asset, at the asset's decimals. */
export function mapleServedFolder(folder: UpstreamFolder): ServedFolder {
  const resolve: FolderAssetResolver = {
    symbol: (key) => maplePoolOf(key).assetSymbol,
    decimals: (key) => maplePoolOf(key).decimals,
  };
  return withLegs(folder, resolve);
}
