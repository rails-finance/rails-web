// Polaris's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component and its share-card route. The shape
// and the failure rules live in lib/shared/position-tail-page-data.ts.
//
// Two independent lanes, only one of them here. The CHAIN lane — the CDP's
// own getters at head — is the page's primary truth and stays a client-side
// read; the INDEX lane carries the history and the replayed summary, and is
// the tail this loader seeds. A failed index read (the index not yet serving
// this explorer, or not knowing this CDP) leaves those surfaces in their
// explicit PENDING state — the loader returning nothing puts the client back
// exactly where it was.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchPolarisPositionSummary } from "@/lib/api/fetch-polaris-positions";
import { fetchPolarisTimeline, PolarisTimelineHttpError } from "@/lib/api/fetch-polaris-timeline";
import { loadPolarisPositionFromChain } from "@/lib/sources/chain/polaris-position";
import type { PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisSummaryFromEvents } from "@/lib/polaris/summary-from-events";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";

/**
 * Whether a CDP with this number was ever minted on this market — the page's
 * 404 test, and the reason this loader is more than a call to the shared one.
 *
 * THE INDEX IS THE ONLY LANE THAT CAN SAY "NEVER MINTED", and it says it in
 * two places at once: `/positions?market=&id=` answers 200 with an empty
 * `data`, and `/timeline?market=&id=` answers 404. The chain cannot say it at
 * all — a never-minted id and a burned one are byte-identical at head
 * (ownerOf reverts, isOpen false, every figure zero), which is why the page
 * used to render a CLOSED card with dashes for a number nobody ever minted.
 *
 * But the index alone would 404 a REAL CDP for the few minutes between its
 * mint and the indexer catching up, and this roster grows every few blocks.
 * So the chain is asked to confirm the weaker half of the claim: the CDP is
 * not open at head and holds nothing. A CDP minted seconds ago IS open, so it
 * survives the test on the chain's answer while the index catches up.
 *
 * Both halves must be answers, not failures:
 *   • the timeline's 404 (the typed error's status), never a 500 — the shared
 *     loader flattens any thrown timeline into the same empty tail a backend
 *     outage produces, so the status is caught here, before it gets there;
 *   • `fetchPolarisPositionSummary` returning null, which it does only for an
 *     answered-and-empty roster (it THROWS on a failed read);
 *   • a chain read that is not `chainStale` — the RPC stub sets that flag, and
 *     a stub's zeros must never read as "no such CDP".
 *
 * Cost: ONE Sepolia multicall, on requests whose index answer was empty.
 * An ordinary page pays nothing. An enumerating bot pays one chain read per
 * fabricated id; if that ever matters, memoise the verdict per (market, id)
 * the way the market board is memoised in lib/sources/chain/polaris-position.
 */
async function neverMinted(market: PolarisMarket, cdpId: string): Promise<boolean> {
  try {
    const chain = await loadPolarisPositionFromChain(market, cdpId);
    if (chain.chainStale) return false;
    return !chain.isOpen && chain.entireColl === 0 && chain.entireDebt === 0 && chain.owner == null;
  } catch {
    // A chain read that failed proves nothing, and a 404 is the one verdict
    // this page cannot take back.
    return false;
  }
}

export const loadPolarisPositionTail = cache(async (market: PolarisMarket, cdpId: string) => {
  // The shared loader cannot distinguish the index's 404 from its 500 — both
  // reject, and both become the empty tail. So the 404 is caught HERE and
  // recorded, and an empty history is handed on in its place; every other
  // failure still throws through to the tail's own PENDING shape.
  let timelineMissing = false;
  const tail = await loadPositionTail<PolarisPositionSummary | null>({
    label: "polaris",
    readPositions: (baseUrl, headers) => fetchPolarisPositionSummary(market, cdpId, baseUrl, headers),
    readTimeline: async (baseUrl, headers) => {
      try {
        return await fetchPolarisTimeline(market, cdpId, { baseUrl, headers });
      } catch (err) {
        if (err instanceof PolarisTimelineHttpError && err.status === 404) {
          timelineMissing = true;
          return { events: [] };
        }
        throw err;
      }
    },
  });
  if (timelineMissing) {
    const missing = tail.positions == null && (await neverMinted(market, cdpId));
    // Not a 404, so this is a real CDP the index has not caught up with — a
    // mint from the last few minutes. Hand back the UNSEEDED tail the page
    // received for it before this rule existed: `events: null` is what puts
    // the client's index surfaces into their stated PENDING state and makes
    // it fetch for itself. Seeding an EMPTY history here would state "no
    // events" about a live CDP as a settled fact, with nothing to correct it.
    return { positions: null, events: null, cutoffBlock: null, opening: null, position: null, missing };
  }
  // The listing row when the route named this CDP; the timeline's own
  // reduction otherwise (see summary-from-events.ts for why both exist).
  const position = tail.positions ?? (tail.events ? polarisSummaryFromEvents(market, cdpId, tail.events) : null);
  return { ...tail, position, missing: false };
});
