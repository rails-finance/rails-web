// Visibility resolution for the Maple listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder shows every status. The argument for
// it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. mv_maple_wallets answers with open / closed, so Open and Closed send
// their own token and All sends none.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice. The default is never written into the filter
// object, so an identity search relaxes the view without the reader touching Status, and the
// bare directory URL stays clean.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/maple-status-choice.test.mjs).

import { namesIdentity } from "./search";
import { readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

/** Just the filter fields visibility depends on — structural, so the page's MapleListFilters
 *  satisfies it without an import cycle. */
export interface MapleVisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatusChoice(f: MapleVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: MapleVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The lifecycle buckets the API is asked for; undefined for no status filter. */
export function mapleStatusBuckets(f: MapleVisibilityInput): ("open" | "closed")[] | undefined {
  const choice = statusChoice(f);
  return choice === "all" ? undefined : [choice];
}

/** The count line's noun names what is shown ("open positions", "closed positions",
 *  "positions" for All). */
export function mapleCountLine(f: MapleVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
