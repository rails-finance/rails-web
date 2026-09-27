// SERVER-ONLY — a Basedollar folder, named through the branch catalog its rows use.
// The shared half is lib/sources/api/liquity-fork-folder-wire.ts.

import type { ServedFolder } from "@/lib/shared/timeline-folder";
import type { UpstreamFolder } from "@/lib/sources/api/timeline-folder-wire";
import { liquityForkServedFolder } from "@/lib/sources/api/liquity-fork-folder-wire";
import { resolveBranch, DEBT_SYMBOL, DEBT_DECIMALS } from "@/lib/basedollar/asset-catalog";

/** A Basedollar folder as the page reads it. A branch the catalog does not know
 *  leaves the collateral pairs undrawn rather than scaled at a guess. */
export function basedollarServedFolder(folder: UpstreamFolder, collateralType: string): ServedFolder {
  const branch = resolveBranch(collateralType);
  return liquityForkServedFolder(folder, {
    collateral: branch ? { symbol: branch.symbol, decimals: branch.decimals } : undefined,
    debt: { symbol: DEBT_SYMBOL, decimals: DEBT_DECIMALS },
  });
}
