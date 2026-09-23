// ============================================================================
// FETCH MORPHO BASE TIMELINE — a wallet's whole life, swept from the singleton
// ============================================================================
//
// The Morpho-shaped twin of the Aave V3 response behind fetch-chain-timeline:
// the same `coverage` (one sweep, one statement of what it read), but the
// events and the lifetime sums are grouped PER POSITION, because a Morpho
// position is a (market, wallet) pair and the page renders one card, one tower
// and one timeline per market the wallet has ever touched — the Ethereum
// position page, once per market.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { MorphoSweptPosition as ServerPosition } from "@/lib/sources/chain/morpho-blue-events";
import { fetchChainTimeline, type ChainTimelineCoverage } from "./fetch-chain-timeline";

/** One position as the sweep replayed it — the server shape, re-exported so
 *  client code names the API module rather than the server reader. */
export type MorphoSweptPosition = ServerPosition & { events: BaseActivityEvent[] };

export interface MorphoChainTimelineResponse {
  wallet: string;
  positions: MorphoSweptPosition[];
  totalEvents: number;
  coverage: ChainTimelineCoverage;
}

const ROUTE = "/api/chain/morpho-base/timeline";

export function fetchMorphoBaseTimeline(wallet: string): Promise<MorphoChainTimelineResponse> {
  return fetchChainTimeline<MorphoChainTimelineResponse>({ wallet, route: ROUTE, mark: "morpho-base-timeline" });
}
