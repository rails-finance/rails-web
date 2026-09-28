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
import type { ReplayGroupedFields } from "@/lib/api/fetch-replay-segment";
import type { MorphoSweptPosition as ServerPosition } from "@/lib/sources/chain/morpho-blue-events";
import { fetchChainTimeline, type ChainTimelineCoverage } from "./fetch-chain-timeline";

/** One position as the sweep replayed it — the server shape, re-exported so
 *  client code names the API module rather than the server reader. */
export type MorphoSweptPosition = ServerPosition & { events: BaseActivityEvent[] };

export interface MorphoChainTimelineResponse extends ReplayGroupedFields {
  wallet: string;
  positions: MorphoSweptPosition[];
  totalEvents: number;
  coverage: ChainTimelineCoverage;
  /** On a grouped answer (`?group=1&market=`), the one position whose events
   *  it carries, as ROWS: its `events` are the ungrouped ones and `rowPlan`
   *  puts the folders back between them (lib/morpho-base/timeline-folders.ts).
   *  Every other position carries its summary and no events. */
  market?: string;
}

const ROUTE = "/api/chain/morpho-base/timeline";

/** `market` asks for that position as ROWS; absent, the wallet's history
 *  flat. */
export function fetchMorphoBaseTimeline(wallet: string, market?: string): Promise<MorphoChainTimelineResponse> {
  return fetchChainTimeline<MorphoChainTimelineResponse>({
    wallet,
    route: ROUTE,
    mark: "morpho-base-timeline",
    params: market ? { group: "1", market } : undefined,
  });
}
