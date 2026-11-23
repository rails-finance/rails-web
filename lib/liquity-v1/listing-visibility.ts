// Visibility resolution for the Liquity V1 Trove listing.
//
// The bare listing shows the open Troves; a search naming a wallet shows every status, since
// most of a wallet's Troves are closed.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. The API's `closed` leaves out the liquidated Troves, so Closed asks for
// closed and liquidated together, and the "Closed by liquidation" switch (`ended`) narrows Closed
// to the liquidated ones. A redeemed Trove ends as closed. Liquidated before and Redeemed before
// are the History switches, over a Trove's whole life (a Trove can be reopened).
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/liquity-v1-status-choice.test.mjs).

import {
  ENDED_BY_LIQUIDATION,
  readStatusParam,
  statusBuckets,
  statusNoun,
  type StatusChoice,
} from "../shared/status-choice";

const WALLET = /^0x[0-9a-fA-F]{40}$/;

/** Just the filter fields visibility depends on — structural, so the page's
 *  LiquityV1ListFilters satisfies it without an import cycle. */
export interface LiquityV1VisibilityInput {
  status?: string[];
  ended?: string[];
  q?: string;
}

/** The contextual default: the open Troves while the search names no wallet, every status
 *  once it does. */
export function defaultStatusChoice(f: LiquityV1VisibilityInput): StatusChoice {
  return WALLET.test((f.q ?? "").trim()) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: LiquityV1VisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The "Closed by liquidation" switch, which narrows Closed alone. */
export function endedByLiquidation(f: LiquityV1VisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The lifecycle buckets the API is asked for; undefined for no status filter. */
export function liquityV1StatusBuckets(f: LiquityV1VisibilityInput): string[] | undefined {
  return statusBuckets(statusChoice(f), endedByLiquidation(f));
}

/** The count line's noun names what is shown ("open Troves", "closed Troves", "Troves" for
 *  All). */
export function liquityV1CountLine(f: LiquityV1VisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "Troves") };
}
