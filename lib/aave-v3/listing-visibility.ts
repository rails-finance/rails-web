// Visibility resolution for the Aave V3 listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder shows every status. The argument for
// it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is a MULTI-SELECT over the lifecycle vocabulary mv_aave_v3_wallets answers with — open
// / closed / liquidated — serialized as one comma-separated `status` URL param.
// (Ever-liquidated is the orthogonal History facet; this axis is the lifecycle.)
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, a concrete set is an explicit choice. The default is never written into the
// filter object, so clearing a selection returns to whatever the current context rests on, and
// an identity search relaxes the view without the reader touching the Status facet. Because the
// default is contextual rather than a selection it draws NO chip and NO Reset link (the shared
// driver hides a dimension sitting on its `defaultValues`) and the bare directory URL stays
// clean.

import { namesIdentity } from "@/lib/aave-v3/search";

/** The lifecycle buckets the Status facet exposes. */
export type AaveV3StatusBucket = "open" | "closed" | "liquidated";

/** Canonical order — used for stable URL/chip serialization and set compares. */
export const ALL_AAVE_V3_STATUS_BUCKETS: AaveV3StatusBucket[] = ["open", "closed", "liquidated"];

export function isAaveV3StatusBucket(v: string): v is AaveV3StatusBucket {
  return (ALL_AAVE_V3_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): AaveV3StatusBucket[] {
  const set = new Set(values.filter(isAaveV3StatusBucket));
  return ALL_AAVE_V3_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: AaveV3StatusBucket[], b: AaveV3StatusBucket[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's AaveV3ListFilters
 *  satisfies it without an import cycle. */
export interface AaveV3VisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatuses(f: AaveV3VisibilityInput): AaveV3StatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_AAVE_V3_STATUS_BUCKETS] : ["open"];
}

/** The selection actually in effect: an explicit non-empty choice wins; an empty selection
 *  resolves to the contextual default (zero buckets is not a view). */
export function effectiveStatuses(f: AaveV3VisibilityInput): AaveV3StatusBucket[] {
  const sel = canonicalStatuses(f.status ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}

/** True when the effective selection is the full set — "show everything", which maps to NO
 *  server-side status filter. */
export function isAllStatuses(f: AaveV3VisibilityInput): boolean {
  return effectiveStatuses(f).length === ALL_AAVE_V3_STATUS_BUCKETS.length;
}
