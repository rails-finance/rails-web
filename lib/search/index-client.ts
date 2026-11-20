// The search index in the browser (rails-ops ui-jobs 482): `GET
// /api/search/index`, fetched once per page load on first use and kept. The
// front-door search and the vault comparison's picker (ui-jobs 779) share it.

import { expandIndex, type SearchIndex, type SearchIndexWire } from "@/lib/search/suggest";

let indexPromise: Promise<SearchIndex | null> | null = null;

/** The index; null where the read failed, which is asked again on the next call. */
export function loadSearchIndex(): Promise<SearchIndex | null> {
  indexPromise ??= fetch("/api/search/index")
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndexWire>) : null))
    .then((wire) => (wire?.v === 2 ? expandIndex(wire) : null))
    .catch(() => null)
    .then((index) => {
      if (index == null) indexPromise = null;
      return index;
    });
  return indexPromise;
}
