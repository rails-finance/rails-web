// Visibility resolution for the Polaris CDP listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, now the roster rule):
// the bare directory shows the CDPs that are still open; a search that names a
// holder (address or ENS) or a CDP number shows every status. The two views
// answer different questions. Someone browsing /sepolia/polaris is looking at
// the protocol as it stands, and the ended CDPs bury the live ones. Someone who
// types their own address is asking about positions they know about, and the
// closed one is exactly what they came for — filtering it away answers "nothing
// here", which is not true.
//
// Status is a MULTI-SELECT over the API's whole lifecycle vocabulary — open /
// closed / liquidated. (Liquidation history is the orthogonal axis and has its
// own facet; this one is the lifecycle.) The selection is serialized as a single
// comma-separated `status` URL param, e.g. `?status=open,closed`.
//
// `status` on the filter object carries RAW user intent:
//   - []             → "no opinion": resolve to the contextual default
//   - a concrete set → an explicit choice
//
// Keeping an untouched filter empty keeps the default out of the filter object:
// the default is never written in, only applied here at read time, so clearing a
// selection always resolves back to whatever the current context rests on — and
// typing an address into the search box relaxes the resting view to everything
// without the holder touching the Status facet. Because the default is
// contextual rather than a selection, it draws NO chip and NO Reset link (the
// shared driver hides a dimension sitting on its `defaultValues`), and the bare
// directory URL stays clean.
//
// Both the URL <-> API serialization and the filter chips resolve effective
// values through this module (via the shared listing driver's dimension
// registry) so the two halves can never drift.

import { namesIdentity } from "@/lib/polaris/search";

/** The three lifecycle buckets the Status filter exposes — the API's own
 *  vocabulary, sent verbatim on the wire. */
export type PolarisStatusBucket = "open" | "closed" | "liquidated";

/** Canonical order — used for stable URL/chip serialization and set compares. */
export const ALL_POLARIS_STATUS_BUCKETS: PolarisStatusBucket[] = ["open", "closed", "liquidated"];

export function isPolarisStatusBucket(v: string): v is PolarisStatusBucket {
  return (ALL_POLARIS_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): PolarisStatusBucket[] {
  const set = new Set(values.filter(isPolarisStatusBucket));
  return ALL_POLARIS_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: PolarisStatusBucket[], b: PolarisStatusBucket[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's
 *  PolarisListFilters satisfies it without an import cycle. `q` is the listing's
 *  one search box; the identity lookup rides it, so the contextual default
 *  parses it here rather than reading fields of its own. */
export interface PolarisVisibilityInput {
  status?: string[];
  q?: string;
}

/** The contextual default selection: the open CDPs while the search box names no
 *  identity, every status once it does. The bare `/sepolia/polaris` view
 *  therefore opens on live CDPs with a clean URL and no chip, and a holder /
 *  CDP-number search surfaces the closed and liquidated ones alongside. */
export function defaultStatuses(f: PolarisVisibilityInput): PolarisStatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_POLARIS_STATUS_BUCKETS] : ["open"];
}

/** The selection actually in effect: an explicit non-empty choice wins; an empty
 *  selection resolves to the contextual default (zero buckets is not a view —
 *  clearing returns to the default). */
export function effectiveStatuses(f: PolarisVisibilityInput): PolarisStatusBucket[] {
  const sel = canonicalStatuses(f.status ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}

/** True when the effective selection is the full set — i.e. "show everything",
 *  which maps to NO server-side status filter. */
export function isAllStatuses(f: PolarisVisibilityInput): boolean {
  return effectiveStatuses(f).length === ALL_POLARIS_STATUS_BUCKETS.length;
}
