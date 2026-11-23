// Visibility resolution for the Liquity V1 deposit and LQTY stake listings
// (sp-listing.ts, staking-listing.ts).
//
// Status is one choice of three (ui-jobs 805; lib/shared/status-choice.ts):
// Open, Closed or All, one `status` URL value. A deposit or a stake is open or
// closed, and the routes take `status=open` or `status=closed`; All sends no
// status. The bare listing rests on Open, and a search naming a wallet (an
// address or an ENS name) rests on All.
//
// `status` on the filter object carries the reader's choice: [] resolves here
// to the resting one.
//
// Relative imports of modules with no imports of their own, so the unit test
// reads this file (scripts/test/liquity-v1-sp-staking-status-choice.test.mjs).

import { parseListingSearch } from "../shared/listing-search";
import { readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

export interface LiquityV1SpStakingVisibilityInput {
  status?: string[];
  q?: string;
}

/** True when the query names a wallet (an address or an ENS name). */
export function namesWallet(q: string | undefined): boolean {
  const s = parseListingSearch(q ?? "", false);
  return s.kind === "address" || s.kind === "ens";
}

/** Open while browsing, All once the search names a wallet. */
export function defaultStatusChoice(f: LiquityV1SpStakingVisibilityInput): StatusChoice {
  return namesWallet(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the resting one. */
export function statusChoice(f: LiquityV1SpStakingVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The route's `status` param; undefined for All. */
export function statusParam(f: LiquityV1SpStakingVisibilityInput): "open" | "closed" | undefined {
  const choice = statusChoice(f);
  return choice === "all" ? undefined : choice;
}

/** The deposit listing's count line ("open deposits", "deposits" for All). */
export function spCountLine(f: LiquityV1SpStakingVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "deposits") };
}

/** The stake listing's count line ("open LQTY stakes", "LQTY stakes" for All). */
export function stakingCountLine(f: LiquityV1SpStakingVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "LQTY stakes") };
}
