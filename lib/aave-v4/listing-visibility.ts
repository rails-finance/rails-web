// Visibility resolution for the Aave V4 listing — the lifecycle-status axis.
//
// TWO-AXIS MODEL (see rails-ops/reference/events-and-liquidations-across-protocols.md).
// Aave liquidations are PARTIAL and repeatable — a position survives them — so
// "liquidated" is not a lifecycle state a position is *in*; it's something that
// *happened to* it. We therefore split what the old single axis conflated:
//
//   • Status (this file) — a purely STRUCTURAL bucket: open | closed. "Closed"
//     means "no live balance", regardless of how it got there.
//   • Liquidations — an ORTHOGONAL flag ("Liquidated before", the History toggle
//     in list-filter-dimensions) that spans open AND closed. This is the analog
//     of Liquity's Redemptions filter; Aave V4 mirrors Aave V3's model here.
//
// The wire status (AaveV4SpokePositionStatus) still carries a third value,
// 'liquidated', but that is the TERMINAL CAUSE of a closed position (closed *by
// liquidation* vs wound down by the owner) — a refinement the card renders, not a
// filter bucket. `bucketsToWireStatuses` maps the structural "closed" bucket onto
// both wire statuses that mean "no live balance" ('closed' + 'liquidated').
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder (address or ENS) shows every status.
// The argument for it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
// This lane rested on "show everything" in both contexts until the sweep; the open-only resting
// scope is what changed, and the relax-on-holder half is what it previously got for free.
//
// `statuses` on the filter object carries RAW user intent:
//   - undefined / []  → "no opinion": resolve to the contextual default
//   - a concrete set  → an explicit choice
//
// The default is never written into the filter object; it's applied here at read time, so a
// cleared selection always resolves back to whatever the current context rests on, and typing an
// address relaxes the view without the reader touching the Status facet. Because the default is
// contextual rather than a selection it draws NO chip and NO Reset link (the shared driver hides
// a dimension sitting on its `defaultValues`) and the bare directory URL stays clean.

import type { AaveV4SpokePositionStatus } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { namesIdentity } from "@/lib/aave-v4/search";

/** The lifecycle Status filter buckets — the two-value STRUCTURAL axis (does the
 *  position hold a live balance). Deliberately NARROWER than the wire status
 *  (AaveV4SpokePositionStatus), which additionally carries the terminal cause;
 *  liquidation lives on the orthogonal History axis, not here. */
export type AaveV4StatusBucket = "open" | "closed";

/** The two display buckets the Status filter exposes. */
export const ALL_STATUS_BUCKETS: AaveV4StatusBucket[] = ["open", "closed"];

export function isStatusBucket(v: string): v is AaveV4StatusBucket {
  return (ALL_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): AaveV4StatusBucket[] {
  const set = new Set(values.filter(isStatusBucket));
  return ALL_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: AaveV4StatusBucket[], b: AaveV4StatusBucket[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's AaveV4ListFilters
 *  satisfies it without an import cycle. */
export interface AaveV4VisibilityInput {
  statuses?: AaveV4StatusBucket[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no holder, every
 *  status once it does. A default is never a selection, so the canonical URL carries no
 *  `status=` param either way — but the FETCH always sends one, because an absent `status`
 *  on the V4 index means the open set rather than no restriction (see the status line in
 *  aaveV4FiltersToFetchParams). */
export function defaultStatuses(f: AaveV4VisibilityInput): AaveV4StatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_STATUS_BUCKETS] : ["open"];
}

/** The selection actually in effect: an explicit non-empty choice wins; an empty
 *  or absent selection resolves to the default (you can never view zero buckets —
 *  clearing returns to the default). */
export function effectiveStatuses(f: AaveV4VisibilityInput): AaveV4StatusBucket[] {
  const sel = canonicalStatuses(f.statuses ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}

/** Map the structural display buckets to the wire statuses the API filters on.
 *  The 'closed' bucket admits BOTH server statuses that mean "no live balance":
 *  'closed' (owner wound it down) and 'liquidated' (terminal event was a
 *  liquidation) — the terminal-cause distinction is a card refinement, not a
 *  filter, so both belong under structural "Closed". 'open' maps to itself. */
export function bucketsToWireStatuses(buckets: AaveV4StatusBucket[]): AaveV4SpokePositionStatus[] {
  const out: AaveV4SpokePositionStatus[] = [];
  for (const b of buckets) {
    if (b === "open") out.push("open");
    else if (b === "closed") out.push("closed", "liquidated");
  }
  return out;
}
