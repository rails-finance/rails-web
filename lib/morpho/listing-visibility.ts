// Visibility resolution for the Morpho Blue listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, the roster rule): the bare directory
// shows the positions still open; a search naming a holder shows every status. The argument for
// it is written once, on the pilot — lib/liquity-v2/listing-visibility.ts.
//
// Status is a MULTI-SELECT over open / closed / liquidated, serialized as one comma-separated
// `status` URL param.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and resolves here
// at read time, a concrete set is an explicit choice. The default is never written into the
// filter object, so clearing a selection returns to whatever the current context rests on, and
// an identity search relaxes the view without the reader touching the Status facet. Because the
// default is contextual rather than a selection it draws NO chip and NO Reset link (the shared
// driver hides a dimension sitting on its `defaultValues`) and the bare directory URL stays
// clean.

import { namesIdentity } from "@/lib/morpho/search";

/** The lifecycle buckets the Status facet exposes. */
export type MorphoStatusBucket = "open" | "closed" | "liquidated";

/** Canonical order — used for stable URL/chip serialization and set compares. */
export const ALL_MORPHO_STATUS_BUCKETS: MorphoStatusBucket[] = ["open", "closed", "liquidated"];

export function isMorphoStatusBucket(v: string): v is MorphoStatusBucket {
  return (ALL_MORPHO_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): MorphoStatusBucket[] {
  const set = new Set(values.filter(isMorphoStatusBucket));
  return ALL_MORPHO_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: MorphoStatusBucket[], b: MorphoStatusBucket[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's MorphoListFilters
 *  satisfies it without an import cycle. */
export interface MorphoVisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default: the open positions while the search box names no identity, every
 *  status once it does. */
export function defaultStatuses(f: MorphoVisibilityInput): MorphoStatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_MORPHO_STATUS_BUCKETS] : ["open"];
}

/** The selection actually in effect: an explicit non-empty choice wins; an empty selection
 *  resolves to the contextual default (zero buckets is not a view). */
export function effectiveStatuses(f: MorphoVisibilityInput): MorphoStatusBucket[] {
  const sel = canonicalStatuses(f.status ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}

/** True when the effective selection is the full set — "show everything", which maps to NO
 *  server-side status filter. */
export function isAllStatuses(f: MorphoVisibilityInput): boolean {
  return effectiveStatuses(f).length === ALL_MORPHO_STATUS_BUCKETS.length;
}
