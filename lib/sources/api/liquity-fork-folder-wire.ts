// SERVER-ONLY — a Liquity V2 fork folder, named in the page's vocabulary.
// ----------------------------------------------------------------------------
// rails-server keys a fork folder's legs and flows by the side of the Trove
// they move, as the opening balance keys the same flows
// (`api/src/services/liquity-fork-timeline-folders.ts`): `collateral` in the
// branch's own units, `debt` in the fork's 18-decimal stable. `toServedFolder`
// keeps a key that is not a token address as it came, which is right for the
// flows (the economics reducers merge by leg name) and wrong for a header leg,
// which draws the branch's or the stable's symbol. So each fork's `/timeline` and
// `/timeline/folder` proxies pass their folders through here with the branch
// and the stable they read their rows with.

import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { toServedFolder, type FolderAssetResolver, type UpstreamFolder } from "@/lib/sources/api/timeline-folder-wire";

export interface ForkFolderDenominations {
  /** Absent where the branch did not resolve: its pairs are then undrawn. */
  collateral?: { symbol: string; decimals: number };
  debt: { symbol: string; decimals: number };
}

export function liquityForkServedFolder(folder: UpstreamFolder, d: ForkFolderDenominations): ServedFolder {
  const side = (key: string) => (key === "collateral" ? d.collateral : key === "debt" ? d.debt : undefined);
  const resolver: FolderAssetResolver = {
    symbol: (key) => side(key)?.symbol,
    decimals: (key) => side(key)?.decimals,
  };
  const served = toServedFolder(folder, resolver);
  return {
    ...served,
    legs: served.legs.map((leg) => {
      const s = side(leg.asset);
      // Drawn under the side's symbol and filed under none: a Trove has no
      // asset axis (`getEventAssetKeys` answers nothing for a fork event), so
      // a leg that named one would put an asset filter on the page whose
      // every choice hides the rows.
      return s ? { ...leg, symbol: null, displaySymbol: s.symbol, decimals: s.decimals } : { ...leg, symbol: null };
    }),
  };
}
