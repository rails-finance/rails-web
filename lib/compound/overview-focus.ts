// What names a Comet card on a Compound V3 wallet overview under Focus
// (ui-jobs 557): the Comet's base token and the collateral the wallet holds in
// it (lib/shared/focus-row-keys.ts reads the addresses). A plain module, so the
// server page and the client cards read one shape.

import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";

export function overviewCardFocusSource(market: CometMarket | undefined, live: CompoundMarketChainResponse | null) {
  return { baseToken: market?.baseToken ?? null, held: live?.collateral.map((c) => c.address) ?? [] };
}
