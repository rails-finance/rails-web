// Visibility resolution for the Sky Savings listing.
//
// The resting view is the open positions while browsing and every status once the search
// names a wallet, so a holder that has left still answers a lookup.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open, Closed or All,
// one `status` URL value. The positions route takes `status` as open, closed or all, and an
// absent one means open, so every choice is sent.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, one value is an explicit choice.
//
// Relative imports of modules with no imports of their own, so the unit test reads this file
// (scripts/test/sky-savings-status-choice.test.mjs).

import { readStatusParam, statusNoun, type StatusChoice } from "../shared/status-choice";

/** An address or an ENS name in the search box. Anything else filters nothing. */
export function parseSkySearch(q: string): { address?: string; ens?: string } {
  const v = q.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { address: v.toLowerCase() };
  if (v.toLowerCase().endsWith(".eth")) return { ens: v };
  return {};
}

function namesWallet(q: string | undefined): boolean {
  const s = parseSkySearch(q ?? "");
  return Boolean(s.address ?? s.ens);
}

/** Just the filter fields visibility depends on. */
export interface SkyVisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no wallet, every
 *  status once it does. */
export function defaultStatusChoice(f: SkyVisibilityInput): StatusChoice {
  return namesWallet(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. It is
 *  also the route's `status` value. */
export function statusChoice(f: SkyVisibilityInput): StatusChoice {
  return readStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The count line's noun names what is shown ("open positions", "closed positions",
 *  "positions" for All). */
export function skyCountLine(f: SkyVisibilityInput): { noun: string } {
  return { noun: statusNoun(statusChoice(f), "positions") };
}
