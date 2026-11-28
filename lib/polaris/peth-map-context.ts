// The deployment's names the Polaris map's fill reads (ui-jobs 873), from the
// asset catalog, the link to an address's timeline filtered to one edge, and
// the explanation drawer's links.

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
import type { PethMapExplainContext } from "@/lib/polaris/peth-map-explanation";
import {
  pethCdpPlaceProv,
  pethCdpTotalProv,
  pethHeadProv,
  pethLoanPlaceProv,
  pethLoanTotalProv,
  pethLpProv,
  pethLpTotalProv,
  pethSpPlaceProv,
  pethSpTotalProv,
} from "@/lib/polaris/peth-provenance";
import type { PolarisVenueKey } from "@/lib/polaris/asset-catalog";

/** The head read behind each balance the address's box states. */
const HELD = {
  peth: "pethHeld",
  fpeth: "fpethHeld",
  vpeth: "vpethHeld",
  svpeth: "svpethHeld",
  svpethVpeth: "svpethVpeth",
} as const;

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
    // The places section's receipts (C24·polaris), so a figure both sections
    // show reads the same in each.
    receipts: {
      held: (what, block) => pethHeadProv(HELD[what], block),
      cdpTotal: pethCdpTotalProv,
      cdp: pethCdpPlaceProv,
      spTotal: pethSpTotalProv,
      sp: pethSpPlaceProv,
      loanTotal: pethLoanTotalProv,
      loan: pethLoanPlaceProv,
      lpTotal: pethLpTotalProv,
      lp: (venue, block) => pethLpProv(venue as PolarisVenueKey, block),
    },
    timelineHref: (edgeId) =>
      `${polarisPethAccountHref(address)}?${MAP_EDGE_PARAM}=${encodeURIComponent(edgeId)}#peth-timeline`,
  };
}

/** The explanation drawer's links: an event on the timeline (its `?at=`
 *  landing) and the timeline filtered to several arrows. */
export function pethMapExplainContext(address: string): PethMapExplainContext {
  const base = polarisPethAccountHref(address);
  return {
    eventHref: (eventId) => `${base}?at=${encodeURIComponent(eventId)}`,
    edgesHref: (edgeIds) => `${base}?${MAP_EDGE_PARAM}=${edgeIds.map(encodeURIComponent).join(",")}#peth-timeline`,
    marketOrder: POLARIS_MARKETS.map((m) => POLARIS_MARKET_CONFIG[m].stable.symbol),
  };
}
