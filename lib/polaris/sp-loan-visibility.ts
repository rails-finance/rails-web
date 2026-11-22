// Visibility resolution for the Polaris Stability Pool deposit and reserve loan
// listings (sp-loan-listing.ts).
//
// Status is one choice of three (ui-jobs 805; lib/shared/status-choice.ts):
// Open, Closed or All, one `status` URL value. A deposit or a loan is open or
// closed, and the routes take `status=open` or `status=closed`; All sends no
// status. The bare listing rests on Open, and a search naming a holder or a
// number rests on All, as the CDP listing does (listing-visibility.ts).
//
// `status` on the filter object carries the reader's choice: [] resolves here
// to the resting one.

import { namesIdentity } from "./search";
import { readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

export interface PolarisSpLoanVisibilityInput {
  status?: string[];
  q?: string;
}

/** Open while browsing, All once the search names a holder or a number. */
export function defaultStatusChoice(f: PolarisSpLoanVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the resting one. */
export function statusChoice(f: PolarisSpLoanVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The route's `status` param; undefined for All. */
export function statusParam(f: PolarisSpLoanVisibilityInput): "open" | "closed" | undefined {
  const choice = statusChoice(f);
  return choice === "all" ? undefined : choice;
}

/** The deposit listing's count line ("open deposits", "deposits" for All). */
export function depositCountLine(f: PolarisSpLoanVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "deposits") };
}

/** The loan listing's count line ("open loans", "loans" for All). */
export function loanCountLine(f: PolarisSpLoanVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "loans") };
}
