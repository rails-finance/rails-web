// Visibility resolution for the SparkLend listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the accounts still open; a search naming a holder shows every status. The argument for
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
// (scripts/test/spark-status-choice.test.mjs).

import { namesIdentity } from "./search";
import {
  ENDED_BY_LIQUIDATION,
  readStatusParam,
  statusBuckets,
  statusNoun,
  type StatusChoice,
} from "../shared/status-choice";

/** Just the filter fields visibility depends on — structural, so the page's SparkListFilters
 *  satisfies it without an import cycle. */
export interface SparkVisibilityInput {
  status?: string[];
  ended?: string[];
  q?: string;
}

/** The contextual default: the open accounts while the search box names no identity, every
 *  status once it does. */
export function defaultStatusChoice(f: SparkVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: SparkVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The "Closed by liquidation" switch, which narrows Closed alone. */
export function endedByLiquidation(f: SparkVisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The lifecycle buckets the API is asked for; undefined for no status filter. */
export function sparkStatusBuckets(f: SparkVisibilityInput): string[] | undefined {
  return statusBuckets(statusChoice(f), endedByLiquidation(f));
}

/** The count line's noun names what is shown ("open positions", "closed positions",
 *  "positions" for All). */
export function sparkCountLine(f: SparkVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
