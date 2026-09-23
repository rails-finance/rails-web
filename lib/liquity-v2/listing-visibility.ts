// Visibility resolution for the Liquity V2 listing.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, now the roster rule):
// the bare directory shows the troves that are still open; a search that names a
// holder (address or ENS) or a trove id shows every status. The two views answer
// different questions. Someone browsing /ethereum/liquity-v2 is looking at the
// protocol as it stands, and the closed and liquidated troves — several times
// the number still open — bury the live ones. Someone who types their own
// address is asking about positions they know about, and the closed one is
// exactly what they came for — filtering it away answers "nothing here", which
// is not true.
//
// Zombie counts as open. A zombie trove is one redeemed down below the minimum
// debt: still on chain, still the holder's, just unredeemable until it is topped
// back up. It belongs in the resting view with the other open troves, so the
// resting default is active + zombie, not active alone.
//
// Status is a MULTI-SELECT over four display buckets — active / zombie / closed
// / liquidated. (Zombie is not a stored status; on the server it's open +
// is_zombie. We expose it as a first-class bucket here and the server resolves
// the four buckets onto (status, is_zombie) predicates.) The selection is
// serialized as a single comma-separated `status` URL param, e.g.
// `?status=active,zombie,liquidated`.
//
// `statuses` on the filter object carries RAW user intent:
//   - undefined / []  → "no opinion": resolve to the contextual default
//   - a concrete set  → an explicit choice
//
// Keeping an untouched filter `undefined` keeps the default out of the filter
// object: the default is never written in, only applied here at read time, so
// clearing a selection always resolves back to whatever the current context
// rests on — and typing an address into the search box relaxes the resting view
// to everything without the user touching the Status facet. Because the default
// is contextual rather than a selection, it draws NO chip and NO Reset link (the
// shared driver hides a dimension sitting on its `defaultValues`), and the bare
// directory URL stays clean.
//
// Both the URL <-> API serialization and the filter chips resolve effective
// values through this module (via the shared listing driver's dimension
// registry) so the two halves can never drift.

import { namesIdentity } from "@/lib/liquity-v2/search";

/** The four display buckets the Status filter exposes. */
export type StatusBucket = "active" | "zombie" | "closed" | "liquidated";

/** Canonical order — used for stable URL/chip serialization and set compares. */
export const ALL_STATUS_BUCKETS: StatusBucket[] = ["active", "zombie", "closed", "liquidated"];

export function isStatusBucket(v: string): v is StatusBucket {
  return (ALL_STATUS_BUCKETS as string[]).includes(v);
}

/** Reduce an arbitrary token list to valid buckets, deduped, in canonical order. */
export function canonicalStatuses(values: string[]): StatusBucket[] {
  const set = new Set(values.filter(isStatusBucket));
  return ALL_STATUS_BUCKETS.filter((b) => set.has(b));
}

/** Order-independent equality of two bucket selections. */
export function sameStatusSet(a: StatusBucket[], b: StatusBucket[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Just the filter fields visibility depends on — structural, so the page's
 *  LiquityV2ListFilters satisfies it without an import cycle. `q` is the
 *  listing's one search param; the identity lookup rides it, so the contextual
 *  default parses it here rather than reading fields of its own. */
export interface ListingVisibilityInput {
  statuses?: StatusBucket[];
  q?: string;
}

/** The contextual default selection: the open troves (active + zombie) while the
 *  search box names no identity, every status once it does. The bare
 *  `/ethereum/liquity-v2` view therefore opens on live troves with a clean URL
 *  and no chip, and a wallet / trove-id search surfaces the holder's closed and
 *  liquidated troves alongside the open ones. */
export function defaultStatuses(f: ListingVisibilityInput): StatusBucket[] {
  return namesIdentity(f.q) ? [...ALL_STATUS_BUCKETS] : ["active", "zombie"];
}

/** The selection actually in effect: an explicit non-empty choice wins; an empty
 *  or absent selection resolves to the contextual default (zero buckets is not a
 *  view — clearing returns to the default). */
export function effectiveStatuses(f: ListingVisibilityInput): StatusBucket[] {
  const sel = canonicalStatuses(f.statuses ?? []);
  return sel.length > 0 ? sel : defaultStatuses(f);
}

/** True when the effective selection is the full set — i.e. "show everything",
 *  which maps to NO server-side status filter. */
export function isAllStatuses(f: ListingVisibilityInput): boolean {
  return effectiveStatuses(f).length === ALL_STATUS_BUCKETS.length;
}
