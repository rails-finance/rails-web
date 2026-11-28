// The deployment's names the Polaris map's fill reads (ui-jobs 873), from the
// asset catalog, and the link to an address's timeline filtered to one edge.

import { MAP_EDGE_PARAM } from "@/lib/shared/protocol-map/types";
import {
  FPETH,
  PETH,
  POLAR,
  POLARIS_MARKET_CONFIG,
  POLARIS_MARKETS,
  POLARIS_VENUES,
  POLARIS_WETH,
  SVPETH,
  VPETH,
} from "@/lib/polaris/asset-catalog";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import type { PethMapContext } from "@/lib/polaris/peth-map-fill";

export function pethMapContext(address: string): PethMapContext {
  const stables = POLARIS_MARKETS.map((m) => POLARIS_MARKET_CONFIG[m].stable);
  return {
    chain: "sepolia",
    peth: PETH,
    fpeth: FPETH,
    vpeth: VPETH,
    svpeth: SVPETH,
    weth: POLARIS_WETH,
    others: Object.fromEntries([...stables, POLAR].map((t) => [t.address.toLowerCase(), t])),
    marketSymbol: Object.fromEntries(POLARIS_MARKETS.map((m) => [m, POLARIS_MARKET_CONFIG[m].stable.symbol])),
    // The map's boxes are narrow: each venue by its short name.
    venueLabel: {
      venue_curve_tripool: "Curve pool",
      venue_univ2_polar_peth: "pETH/POLAR pair",
      venue_univ2_peth_weth: "pETH/WETH pair",
    } satisfies Record<keyof typeof POLARIS_VENUES, string>,
    timelineHref: (edgeId) =>
      `${polarisPethAccountHref(address)}?${MAP_EDGE_PARAM}=${encodeURIComponent(edgeId)}#timeline`,
  };
}
