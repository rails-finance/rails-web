// Visibility resolution for the f(x) Protocol listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder or a single position shows every
// status. The argument for it is written once, on the pilot —
// lib/liquity-v2/listing-visibility.ts.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. /api/fx/positions has no row status: `open` and `closed` are facets of
// the settled sweep, and `liquidated` is the ever-liquidated fact, OR-joined with them
// (rails-server api/src/routes/fx.ts). So Closed sends `closed` alone. "Closed by liquidation"
// (`ended`) narrows Closed as on the other families: the API's `ended=liquidated`, ANDed with
// `status` (the position's last action was a liquidation; rails-server mig 508). "Liquidated
// before" (`liq`) is asked as `liquidated` and stands only with All: choosing it moves Status to
// All, and choosing Open or Closed turns it off.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice. The default is never written into the filter
// object, so an identity search relaxes the view without the reader touching Status, and the
// bare directory URL stays clean.

import { namesIdentity } from "@/lib/fx/search";
import { ENDED_BY_LIQUIDATION, readStatusParam, statusNoun, type StatusChoice } from "@/lib/shared/status-choice";

/** The "Liquidated before" switch's one value, in the filters and in the URL (`?liq=liquidated`). */
export const FX_LIQUIDATED_BEFORE = "liquidated";

/** Just the filter fields visibility depends on — structural, so the page's FxListFilters
 *  satisfies it without an import cycle. */
export interface FxVisibilityInput {
  status?: string[];
  liquidations?: string[];
  ended?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatusChoice(f: FxVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** A `status` param's values as the choice, and whether they turn on "Liquidated before". The
 *  old list's `liquidated` was the ever-liquidated fact: alone it is All with the switch on, and
 *  beside another status it is All. */
export function readFxStatusParam(values: string[]): { choice: StatusChoice | null; liquidatedBefore: boolean } {
  const v = values.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (v.includes("liquidated") && !v.includes("all")) {
    const alone = v.every((s) => s === "liquidated");
    return { choice: "all", liquidatedBefore: alone };
  }
  return { choice: readStatusParam(v).choice, liquidatedBefore: false };
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: FxVisibilityInput): StatusChoice {
  return readFxStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** "Liquidated before", in effect only with All. */
export function liquidatedBefore(f: FxVisibilityInput): boolean {
  return statusChoice(f) === "all" && (f.liquidations ?? []).includes(FX_LIQUIDATED_BEFORE);
}

/** "Closed by liquidation", in effect only with Closed. */
export function endedByLiquidation(f: FxVisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The API's `ended` value, or undefined: the route answers an empty `ended` with a 400. */
export function fxEndedParam(f: FxVisibilityInput): typeof ENDED_BY_LIQUIDATION | undefined {
  return endedByLiquidation(f) ? ENDED_BY_LIQUIDATION : undefined;
}

/** The status facets the API is asked for; undefined for no status filter. */
export function fxStatusFacets(f: FxVisibilityInput): ("open" | "closed" | "liquidated")[] | undefined {
  const choice = statusChoice(f);
  if (choice === "open") return ["open"];
  if (choice === "closed") return ["closed"];
  return liquidatedBefore(f) ? ["liquidated"] : undefined;
}

/** The count line's noun names what is shown ("open positions", "closed positions", "positions" for All). */
export function fxCountLine(f: FxVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
