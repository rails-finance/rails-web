// list-filter — the client-side half of the listing filter system. The registry
// in components/shared/filter-bar/types.ts declares how a dimension reads/writes
// the URL param object and renders its chip; this adds the two things needed to
// run the filter in the browser over an already-fetched row set:
//
//   • `matches(row, values)` — the per-dimension predicate.
//   • a generic URL codec driven by each dimension's `param` + get/set, so a
//     listing page serializes its whole selection to a shareable URL without
//     hand-writing buildSearchParams.
//
// Filtering happens in-memory over the rows the listing already pulled (one
// indexed query, no pagination on the chain-state tier), so adding facets costs
// nothing at the data layer — see the data-source notes.

import type { FilterDimension } from "@/components/shared/filter-bar/types";

/** Fields every listing param object carries beyond its facet selections. */
export interface BaseListFilters {
  /** Free-text search (wallet / id substring). */
  q: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/** A registry dimension that also knows its URL param — enough to serialize a
 *  selection to a shareable link. The server-driven tier (which pages against the
 *  backend) uses exactly this: it maps the decoded selection onto fetch params,
 *  so it needs no in-memory `matches`. The in-memory tier extends it below. */
export interface SerializableDimension<F> extends FilterDimension<F> {
  /** URL param name this dimension serializes to. */
  param: string;
  /** Older param names for the same selection (the pre-0016 site's
   *  `collateralType`). Read when `param` is absent; never written. */
  aliases?: readonly string[];
}

/** Older names for the free-text query. The pre-0016 site linked its wallet
 *  filter as `?ownerAddress=` / `?ownerEns=` (Liquity V2) and `?wallet=` (Aave
 *  V4); next.config.ts forwards those to `?q=`, and this reads them for any link
 *  that reaches the page without the hop. */
const LEGACY_QUERY_PARAMS = ["ownerAddress", "ownerEns", "wallet"] as const;

/** The listing's free-text query: `q`, or the first legacy name present. */
export function readListQuery(sp: URLSearchParams): string {
  const q = sp.get("q");
  if (q != null) return q;
  for (const key of LEGACY_QUERY_PARAMS) {
    const v = sp.get(key);
    if (v != null) return v;
  }
  return "";
}

/** A serializable dimension plus the predicate needed to apply it in memory. */
export interface ListDimension<F, Row> extends SerializableDimension<F> {
  /** Client-side predicate: does `row` pass the selected `values`? `values` is
   *  never empty here (an inactive dimension is skipped before this is called). */
  matches: (row: Row, values: string[]) => boolean;
}

export interface ApplyConfig<Row> {
  /** Match a row against the free-text query (already lowercased, non-empty). */
  search: (row: Row, q: string) => boolean;
  /** Sort accessors keyed by sortBy value; ascending natural order. */
  sort: Record<string, (row: Row) => number | string>;
}

/** Filter + sort `rows` by the current `filters`, entirely in memory. */
export function applyListFilter<F extends BaseListFilters, Row>(
  rows: Row[],
  dims: ListDimension<F, Row>[],
  filters: F,
  cfg: ApplyConfig<Row>,
): Row[] {
  const q = filters.q.trim().toLowerCase();
  let out = rows.filter((row) => {
    for (const dim of dims) {
      const values = dim.get(filters);
      // Only an EMPTY selection is inactive. A dimension declaring
      // `defaultValues` resolves an empty intent to a contextual default that is
      // a real constraint — PWN's status rests on the open loans — so `get` never
      // hands back an empty list there and the default must be applied, not
      // skipped. A dimension without one writes its default into the filters
      // instead, and equalling it is the same no-op as selecting everything.
      if (values.length === 0) continue;
      if (!dim.matches(row, values)) return false;
    }
    return q ? cfg.search(row, q) : true;
  });

  const accessor = cfg.sort[filters.sortBy];
  if (accessor) {
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  } else if (filters.sortOrder === "asc") {
    // No accessor = the "recency" default, which rides the fetch order (newest
    // first). There's no timestamp on the row to re-sort by, so the flip just
    // reverses the served order: desc = newest first, asc = oldest first.
    out = [...out].reverse();
  }
  return out;
}

/** Serialize a filter selection to URL params (only non-default values written,
 *  so directory URLs stay clean). */
export function encodeListFilters<F extends BaseListFilters>(
  dims: SerializableDimension<F>[],
  filters: F,
  defaults: F,
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.sortBy !== defaults.sortBy) p.set("sortBy", filters.sortBy);
  if (filters.sortOrder !== defaults.sortOrder) p.set("sortOrder", filters.sortOrder);
  for (const dim of dims) {
    const values = dim.get(filters);
    // Omit a dimension's param exactly when the current selection equals the
    // default an ABSENT param decodes back to — which is what keeps encode/decode
    // a true round-trip. There are two kinds of default, and the round-trip is
    // against a different one in each case:
    //
    //   • A dimension with `defaultValues` declares a CONTEXTUAL default — one
    //     that reads the rest of the filters (Polaris and Liquity V2 status relax
    //     to every status once the search names a holder; Aave V4's is the full
    //     set outright). An absent param decodes to `[]`, and `get` resolves `[]`
    //     through that same contextual rule — so the round-trip is against
    //     `dim.defaultValues(filters)`, not the page-level default. Comparing
    //     against `dim.get(defaults)` here is what wrote the noise on a wallet
    //     search: the page-level default is the bare directory's "open only",
    //     the wallet view rests on all three, the two disagree, and the URL
    //     picked up a `status=open,closed,liquidated` that says nothing the
    //     absent param did not already say.
    //
    //   • A dimension WITHOUT `defaultValues` (Spark, Liquity V1 and the other
    //     open-only explorers resting on `status:["open"]`, a clearable chip)
    //     round-trips against the PAGE-LEVEL default, `dim.get(defaults)`.
    //     Clearing status → [] must still be persisted, so it writes an explicit
    //     empty `param=` (which decodes back to []) rather than dropping it and
    //     letting the absent param snap back to ["open"]. That empty param is the
    //     only reachable URL for the "all statuses" reset state.
    const def = dim.defaultValues ? dim.defaultValues(filters) : dim.get(defaults);
    const isDefault = values.length === def.length && values.every((v) => def.includes(v));
    if (!isDefault) p.set(dim.param, values.join(","));
  }
  return p;
}

/** Deterministic key for a listing view (selection + page). Server (SSR) and
 *  client derive it identically from the same encoder, so the client can compare
 *  its mount URL against the SSR'd key and skip a redundant first fetch when the
 *  server already rendered exactly this view. */
export function listKey<F extends BaseListFilters>(
  dims: SerializableDimension<F>[],
  filters: F,
  defaults: F,
  page: number,
): string {
  return `${encodeListFilters(dims, filters, defaults).toString()}|p${page}`;
}

/** Read a filter selection out of URL params, falling back to `defaults`. */
export function decodeListFilters<F extends BaseListFilters>(
  dims: SerializableDimension<F>[],
  sp: URLSearchParams,
  defaults: F,
): F {
  let f: F = {
    ...defaults,
    q: readListQuery(sp),
    sortBy: sp.get("sortBy") ?? defaults.sortBy,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : sp.get("sortOrder") === "desc" ? "desc" : defaults.sortOrder,
  };
  for (const dim of dims) {
    const raw = sp.get(dim.param) ?? dim.aliases?.map((a) => sp.get(a)).find((v) => v != null) ?? null;
    if (raw != null) {
      const values = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      f = dim.set(f, values);
    }
  }
  return f;
}
