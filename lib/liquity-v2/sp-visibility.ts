// Visibility resolution for the Liquity V2 Stability Pool deposit listing and
// each fork's (sp-listing.ts).
//
// Status is one choice of three (ui-jobs 805; lib/shared/status-choice.ts):
// Open, Closed or All, one `status` URL value. A deposit is open or closed, and
// the route takes `status=open` or `status=closed`; All sends no status. The
// bare listing rests on Open, and a search naming a depositor (an address or an
// ENS name) rests on All.
//
// `status` on the filter object carries the reader's choice: [] resolves here
// to the resting one.
//
// Relative imports of modules with no imports of their own, so the unit test
// reads this file (scripts/test/liquity-v2-sp-status-choice.test.mjs).

import { parseTroveSearch } from "./search";
import { readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

export interface LiquityV2SpVisibilityInput {
  status?: string[];
  q?: string;
}

/** True when the query names a depositor (an address or an ENS name). */
export function namesDepositor(q: string | undefined): boolean {
  const { ownerAddress, ownerEns } = parseTroveSearch(q ?? "");
  return Boolean(ownerAddress ?? ownerEns);
}

/** Open while browsing, All once the search names a depositor. */
export function defaultStatusChoice(f: LiquityV2SpVisibilityInput): StatusChoice {
  return namesDepositor(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the resting one. */
export function statusChoice(f: LiquityV2SpVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The route's `status` param; undefined for All. */
export function statusParam(f: LiquityV2SpVisibilityInput): "open" | "closed" | undefined {
  const choice = statusChoice(f);
  return choice === "all" ? undefined : choice;
}

/** The count line names the choice ("open deposits", "deposits" for All). */
export function spCountLine(f: LiquityV2SpVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "deposits") };
}
