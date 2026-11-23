// Visibility resolution for the Compound V3 listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder shows every status. The argument for
// it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. The index's `closed` leaves out the liquidated rows, so Closed asks for
// closed and liquidated together, and the "Closed by liquidation" switch (`ended`) narrows Closed
// to the liquidated ones. (Liquidated before is the orthogonal History switch.)
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice. The default is never written into the filter
// object, so an identity search relaxes the view without the reader touching Status, and the
// bare directory URL stays clean.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/compound-status-choice.test.mjs).

import { namesIdentity } from "./search";
import {
  ENDED_BY_LIQUIDATION,
  readStatusParam,
  statusBuckets,
  statusNoun,
  type StatusChoice,
} from "../shared/status-choice";

/** Just the filter fields visibility depends on — structural, so the page's CompoundListFilters
 *  satisfies it without an import cycle. */
export interface CompoundVisibilityInput {
  status?: string[];
  ended?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatusChoice(f: CompoundVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: CompoundVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The "Closed by liquidation" switch, which narrows Closed alone. */
export function endedByLiquidation(f: CompoundVisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The lifecycle buckets the API is asked for; undefined for no status filter. */
export function compoundStatusBuckets(f: CompoundVisibilityInput): string[] | undefined {
  return statusBuckets(statusChoice(f), endedByLiquidation(f));
}

/** The count line's noun names what is shown ("open accounts", "closed accounts",
 *  "accounts" for All). */
export function compoundCountLine(f: CompoundVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "accounts") };
}
