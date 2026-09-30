// Visibility resolution for the PWN listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the loans not yet settled; a search naming a holder or a single position shows every
// status. The argument for it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is a MULTI-SELECT over four loan states (lib/pwn/economics.ts `pwnLoanState`): open
// (running, before its deadline), unclaimed (past its deadline, defaulted, waiting for the
// lender's claim), repaid, defaulted (claimed) — serialized as one comma-separated `status` URL
// param. The resting view is the first two: the loans whose collateral is still in escrow.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, a concrete set is an explicit choice, and ["none"] is every box unticked. The
// default is never written into the filter object, so clearing a selection returns to whatever
// the current context rests on, and an identity search relaxes the view without the reader
// touching the Status facet. The default draws no removable chip and no Reset link (the shared
// driver treats a dimension sitting on its `defaultValues` as inactive); the bare directory
// names it in a fixed chip instead ("Status: in escrow", `defaultChip` in
// list-filter-dimensions.tsx), and its URL stays clean.

import { namesIdentity } from "@/lib/pwn/search";

/** The lifecycle buckets the Status facet exposes. */
export type PwnStatusBucket = "open" | "unclaimed" | "repaid" | "defaulted";

/** Canonical order — used for stable URL/chip serialization and set compares. */
export const ALL_PWN_STATUS_BUCKETS: PwnStatusBucket[] = ["open", "unclaimed", "repaid", "defaulted"];

/** The loans not yet settled: running, or defaulted and waiting for the claim. */
export const UNSETTLED_PWN_STATUS_BUCKETS: PwnStatusBucket[] = ["open", "unclaimed"];

export function isPwnStatusBucket(v: string): v is PwnStatusBucket {
  return (ALL_PWN_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): PwnStatusBucket[] {
  const set = new Set(values.filter(isPwnStatusBucket));
  return ALL_PWN_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's PwnListFilters
 *  satisfies it without an import cycle. */
export interface PwnVisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default: the unsettled loans while the search box names no identity, every
 *  status once it does. */
export function defaultStatuses(f: PwnVisibilityInput): PwnStatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_PWN_STATUS_BUCKETS] : [...UNSETTLED_PWN_STATUS_BUCKETS];
}

/** The explicit empty selection: every box unticked. Written as `status=none` so that
 *  unticking the last box leaves them all unticked and lists no loans, where an empty
 *  selection would snap back to the default and tick two boxes the reader never touched. */
export const NO_PWN_STATUS = "none";

/** The selection in effect: an explicit choice wins (`none` among it, nothing);
 *  an empty selection resolves to the contextual default. */
export function effectiveStatuses(f: PwnVisibilityInput): string[] {
  if ((f.status ?? []).includes(NO_PWN_STATUS)) return [NO_PWN_STATUS];
  const sel = canonicalStatuses(f.status ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}
