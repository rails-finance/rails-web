// Visibility resolution for the Frankencoin listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder shows every status. The argument for
// it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. The API's lifecycle is open / closed / denied, a denied position being
// one vetoed in its init window. Closed asks for closed and denied together, and the "Denied"
// switch (`ended=denied`) narrows Closed to the denied ones.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/frankencoin-status-choice.test.mjs).

import { namesIdentity } from "./search";
import { statusNoun, type StatusChoice } from "../shared/status-choice";

/** The Denied switch's value, in the filters and in the URL (`?ended=denied`). */
export const ENDED_DENIED = "denied";

/** Just the filter fields visibility depends on — structural, so the page's
 *  FrankencoinListFilters satisfies it without an import cycle. */
export interface FrankencoinVisibilityInput {
  status?: string[];
  ended?: string[];
  q?: string;
}

export interface FrankencoinStatusRead {
  /** Null where the param names no status: the listing's resting choice. */
  choice: StatusChoice | null;
  /** The old list named denied positions alone. */
  denied: boolean;
}

/** A `status` param's values as the choice. One of the three values is that choice. An old
 *  list of the API's buckets (open, closed, denied) maps to the choice that shows at least
 *  what it showed: open with either ended bucket is All, closed is Closed, and denied alone is
 *  Closed with the Denied switch on. A token that is none of these is ignored. */
export function readFrankencoinStatusParam(values: string[]): FrankencoinStatusRead {
  const v = new Set(values.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (v.has("all")) return { choice: "all", denied: false };
  const open = v.has("open");
  const closed = v.has("closed");
  const denied = v.has(ENDED_DENIED);
  if (open && (closed || denied)) return { choice: "all", denied: false };
  if (open) return { choice: "open", denied: false };
  if (closed) return { choice: "closed", denied: false };
  if (denied) return { choice: "closed", denied: true };
  return { choice: null, denied: false };
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatusChoice(f: FrankencoinVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: FrankencoinVisibilityInput): StatusChoice {
  return readFrankencoinStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The Denied switch, which narrows Closed alone. */
export function endedDenied(f: FrankencoinVisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_DENIED);
}

/** The lifecycle buckets the API is asked for; undefined for no status filter. */
export function frankencoinStatusBuckets(f: FrankencoinVisibilityInput): ("open" | "closed" | "denied")[] | undefined {
  const choice = statusChoice(f);
  if (choice === "all") return undefined;
  if (choice === "open") return ["open"];
  return endedDenied(f) ? ["denied"] : ["closed", "denied"];
}

/** The count line's noun names what is shown ("open positions", "closed positions",
 *  "positions" for All). */
export function frankencoinCountLine(f: FrankencoinVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
