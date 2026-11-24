// Visibility resolution for the Aave V4 listing — the lifecycle-status axis.
//
// TWO-AXIS MODEL (see rails-ops/reference/events-and-liquidations-across-protocols.md).
// Aave liquidations are PARTIAL and repeatable — a position survives them — so
// "liquidated" is not a lifecycle state a position is *in*; it's something that
// *happened to* it. We therefore split what the old single axis conflated:
//
//   • Status (this file) — a purely STRUCTURAL choice: Open, Closed or All
//     (ui-jobs 805; lib/shared/status-choice.ts), one `status` URL value.
//     "Closed" means "no live balance", regardless of how it got there.
//   • Liquidations — an ORTHOGONAL flag ("Liquidated before", the History toggle
//     in list-filter-dimensions) that spans open AND closed. This is the analog
//     of Liquity's Redemptions filter; Aave V4 mirrors Aave V3's model here.
//
// The wire status (AaveV4SpokePositionStatus) still carries a third value,
// 'liquidated', but that names whether a closed position was EVER liquidated
// (Miles 2026-09-28, rails-ops TO-DO-ui-jobs.md item 97) — a refinement the
// card renders as its Outcome word. Closed asks for both wire statuses that mean
// "no live balance" ('closed' + 'liquidated'), and the "Closed by liquidation"
// switch (`ended`) narrows Closed to 'liquidated'.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder (address or ENS) shows every status.
// The argument for it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// `statuses` on the filter object carries RAW user intent: undefined / [] is "no opinion" and
// resolves here at read time, one value is an explicit choice. The default is never written into
// the filter object, so typing an address relaxes the view without the reader touching Status,
// and the bare directory URL stays clean.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/aave-v4-status-choice.test.mjs).

import { namesIdentity } from "./search";
import { ENDED_BY_LIQUIDATION, readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

/** The wire statuses the spoke-positions index filters on. */
type AaveV4WireStatus = "open" | "closed" | "liquidated";

/** Just the filter fields visibility depends on — structural, so the page's AaveV4ListFilters
 *  satisfies it without an import cycle. */
export interface AaveV4VisibilityInput {
  statuses?: string[];
  ended?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no holder, every
 *  status once it does. */
export function defaultStatusChoice(f: AaveV4VisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: AaveV4VisibilityInput): StatusChoice {
  return readStatusParam(f.statuses ?? []).choice ?? defaultStatusChoice(f);
}

/** The "Closed by liquidation" switch, which narrows Closed alone. */
export function endedByLiquidation(f: AaveV4VisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The wire statuses the API is asked for, sent for every choice. An absent `status` on the
 *  Ethereum index rests an unscoped listing on open, and the Base index splits `all` as a
 *  status token, so All names the three wire statuses. */
export function aaveV4StatusBuckets(f: AaveV4VisibilityInput): AaveV4WireStatus[] {
  const choice = statusChoice(f);
  if (choice === "open") return ["open"];
  if (choice === "closed") return endedByLiquidation(f) ? ["liquidated"] : ["closed", "liquidated"];
  return ["open", "closed", "liquidated"];
}

/** The count line's noun names what is shown ("open positions", "closed positions",
 *  "positions" for All). */
export function aaveV4CountLine(f: AaveV4VisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
