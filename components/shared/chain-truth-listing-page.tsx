"use client";

// ChainTruthListingPage — the single driver for EVERY chain-state position
// listing. A protocol's page.tsx becomes a config: the presentation (title /
// card / href) plus one `strategy` that says how the data is filtered:
//
//   • memoryStrategy — fetch the whole set once, filter + sort in the browser
//     (applyListFilter). Right for the small protocols (Morpho / Maker / PWN /
//     Liquity V1) where one indexed query returns everything.
//   • serverStrategy — page against the backend: the URL-backed selection maps
//     onto fetch params and rails-server does the filter / sort / offset. Right
//     for the large ones (Spark / Compound / Aave V3).
//
// Both render the same <ChainTruthListing> shell + <ListToolbar>, so the whole
// tier is one shape. The URL is the source of truth (shareable); this owns the
// decode / encode, the fetch lifecycle, the debounced search, and — for the
// server strategy — pagination. There is exactly ONE copy of this wiring, so the
// facets, sort and search can't drift or go missing per protocol.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChainTruthListing, ListingUnavailable } from "@/components/shared/chain-truth-listing";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import {
  applyListFilter,
  decodeListFilters,
  encodeListFilters,
  listKey,
  type ApplyConfig,
  type BaseListFilters,
  type ListDimension,
  type SerializableDimension,
} from "@/lib/shared/list-filter";
import type { BookmarkScope } from "@/lib/shared/sessions";
import { protocolForHref } from "@/lib/shared/protocols";
import { useUrlSearchParams, notifyUrlChanged } from "@/lib/shared/use-url-search-params";

/** In-memory strategy: fetch everything once, filter + sort client-side. */
export interface MemoryStrategy<T, F extends BaseListFilters> {
  kind: "memory";
  /** Pull the full set (one indexed query). */
  fetchAll: () => Promise<T[]>;
  /** Registry, keyed off the fetched rows (asset facets derive their options). */
  dimensions: (rows: T[]) => ListDimension<F, T>[];
  /** Search predicate + sort accessors. */
  apply: ApplyConfig<T>;
}

/** Server strategy: page against the backend on every selection / page change.
 *  `Ext` is the optional async external state (default none) — see the dynamic
 *  dimensions seam below; a static listing leaves it `undefined`. */
export interface ServerStrategy<T, F extends BaseListFilters, Ext = undefined> {
  kind: "server";
  /** Registry. Static array for a fixed-column listing; or a function of the
   *  live `(filters, ext)` for a listing whose facet OPTIONS depend on the
   *  selection or on external state (e.g. Aave V4: spoke options scoped to the
   *  chosen hubs, supply/borrow options from the fetched asset universe). Only a
   *  dimension's `options` may vary — its `param` / `get` / `set` (the URL codec)
   *  must not, so decode / encode / keying stay well-defined. */
  dimensions: SerializableDimension<F>[] | ((filters: F, ext: Ext) => SerializableDimension<F>[]);
  /** Map the selection + page onto a backend fetch; returns the slice + total. */
  fetchPage: (filters: F, page: number) => Promise<{ data: T[]; total: number }>;
  itemsPerPage: number;
  /** Opt-in async external state, keyed off the filters — the driver calls this
   *  as a hook (unconditionally, so it must obey the rules of hooks). Aave V4
   *  uses it to fetch the asset universe scoped to the selected market. Omit for
   *  a static-dimension listing (the whole Tier-1 roster does). */
  useExternalState?: (filters: F) => Ext;
  /** Opt-in prune hook: given the live filters + external state, return a pruned
   *  filter set when a selection has fallen out of scope (e.g. a supply asset
   *  that isn't in the loaded universe for the selected market), else null. The
   *  driver pushes the pruned filters (resetting to page 1). Omit for none. */
  reconcile?: (filters: F, ext: Ext) => F | null;
}

export type ListingStrategy<T, F extends BaseListFilters, Ext = undefined> =
  | MemoryStrategy<T, F>
  | ServerStrategy<T, F, Ext>;

/** A hook returning no external state — the driver calls this in place of a
 *  strategy's `useExternalState` when none is supplied, so the hook count stays
 *  constant across renders (rules of hooks) for the static-dimension listings. */
function useNoExternalState(): undefined {
  return undefined;
}

/** Brand an in-memory strategy (keeps the call site's inference tidy). */
export function memoryStrategy<T, F extends BaseListFilters>(
  s: Omit<MemoryStrategy<T, F>, "kind">,
): MemoryStrategy<T, F> {
  return { kind: "memory", ...s };
}

/** Brand a server-driven strategy. */
export function serverStrategy<T, F extends BaseListFilters, Ext = undefined>(
  s: Omit<ServerStrategy<T, F, Ext>, "kind">,
): ServerStrategy<T, F, Ext> {
  return { kind: "server", ...s };
}

export interface ChainTruthListingPageProps<T, F extends BaseListFilters, Ext = undefined> {
  /** Page heading, e.g. "SparkLend Positions". */
  title: string;
  /** Noun for the loading / empty / pagination states, e.g. "positions". */
  noun: string;
  /** Route this listing lives at, e.g. "/ethereum/spark" — URL updates push here. */
  basePath: string;
  /** The clean (no-chip) default selection. */
  defaults: F;
  /** Static menu, or a function of the live filters when the offered sorts
   *  depend on the selection (e.g. Morpho Base: Debt/Collateral only appear
   *  once the loan-token facet has narrowed to one address). */
  sortOptions: SortOption[] | ((f: F) => SortOption[]);
  searchPlaceholder?: string;
  renderCard: (item: T) => ReactNode;
  hrefFor: (item: T) => string;
  keyFor: (item: T) => string;
  /** How the data is filtered — memory (client-side) or server (paged). */
  strategy: ListingStrategy<T, F, Ext>;
  /** SSR first paint: the rows the server rendered (memory = the full set; server
   *  = the page slice). When present, the client seeds from them instead of
   *  showing a skeleton + fetching. Omit for a pure client-fetch listing. */
  initialItems?: T[];
  /** SSR total for the server tier (ignored by the memory tier). */
  initialTotal?: number;
  /** listKey() of the URL the server rendered `initialItems` for. On the server
   *  tier, the client skips its first fetch when the mount URL's key matches. */
  initialKey?: string;
  /** The URL query string the server rendered with (e.g. `sp.toString()`), seeding
   *  the first paint so SSR + hydration agree before the client syncs to the live
   *  URL. Omit for a client-only listing (first paint reads no filters). */
  initialSearch?: string;
  /** When set, the search box gains this protocol's bookmarks dropdown; picking
   *  a wallet sets the search query to that address (filters the listing). The
   *  same protocol keys the star on each card. Omit to skip bookmarks. */
  bookmarksProtocol?: BookmarkScope;
  /** Render a bespoke failure state when a fetch rejects; the shell renders the
   *  returned node in place of the row column. Omit (every Tier-1 config does)
   *  for the shared default — <ListingUnavailable> with a retry — so a down
   *  backend never masquerades as "no {noun} captured yet.". */
  renderError?: (error: unknown) => ReactNode;
  /** Fired (in an effect) whenever the decoded selection changes, with the live
   *  filters. Lets a config run identity side effects — e.g. push the searched
   *  wallet into the wallet context (+ resolve its ENS for the header pill) —
   *  without re-implementing the URL decode the driver already owns. Read via a
   *  ref, so an inline closure won't re-fire it. Omit (every Tier-1 config does)
   *  for no side effect. */
  onFilters?: (filters: F) => void;
  /** Opt-in slot rendered between the header block and the toolbar — e.g. a
   *  protocol-level stats band. Passed through to the presentation shell. */
  headerExtra?: ReactNode;
  /** Opt-in slot rendered ABOVE the row column, fed with the rows the page is
   *  showing — the holder strip a wallet search draws over its own positions
   *  (`components/shared/holder-strip.tsx`). Called with the displayed rows,
   *  the result-set total and the decoded selection, so the config can decide
   *  whether this view is a holder's whole set at all; return null for every
   *  other view. The shell draws it inside the dimmed column (it states
   *  figures summed from the rows) and outside their `viewKey` re-mount (a
   *  page or sort change must not re-stagger a band that did not change).
   *  Every other listing passes nothing. */
  renderAbove?: (ctx: { items: T[]; total: number; filters: F }) => ReactNode;
  /** A section listing's identity line (mark + word) above the h1 — for a
   *  route with no roster entry, where no RailHeader can be derived. Passed
   *  through to the presentation shell. */
  identity?: ReactNode;
  /** Send `title` to an sr-only h1 the way a protocol listing's is, for a
   *  section whose `identity` is a whole rail header rather than an eyebrow.
   *  Passed through to the presentation shell; ignored without `identity`. */
  titleHidden?: boolean;
  /** The title's heading level — "h2" under another page's h1. Passed through
   *  to the presentation shell. */
  titleAs?: "h1" | "h2";
}

export function ChainTruthListingPage<T, F extends BaseListFilters, Ext = undefined>({
  title,
  noun,
  basePath,
  defaults,
  sortOptions,
  searchPlaceholder,
  renderCard,
  hrefFor,
  keyFor,
  strategy,
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
  bookmarksProtocol,
  renderError,
  onFilters,
  headerExtra,
  renderAbove,
  identity,
  titleHidden,
  titleAs,
}: ChainTruthListingPageProps<T, F, Ext>) {
  const searchParams = useUrlSearchParams(initialSearch ?? "");

  // The strategy object is rebuilt each render at the call site; keep a ref so the
  // fetch effects can read the latest without churning on its identity.
  const strategyRef = useRef(strategy);
  strategyRef.current = strategy;

  // Rows the strategy produced: the full set (memory) or the current page slice
  // (server). Server dimensions are static, so cache them once; memory dimensions
  // derive their options from the fetched rows, so recompute when those change.
  // Seed from the SSR first paint when present, so there's no skeleton + refetch.
  const seeded = initialItems != null;
  const [fetched, setFetched] = useState<T[]>(initialItems ?? []);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [loading, setLoading] = useState(!seeded);
  const [refreshing, setRefreshing] = useState(false);
  // Last fetch rejection — surfaced as <ListingUnavailable> (or the config's
  // `renderError`) in place of the row column, so a down backend never reads as
  // an empty index. Cleared when a fetch is (re)attempted and when one lands, so
  // it tracks the current view — a recovered refetch drops it and shows rows.
  const [error, setError] = useState<unknown>(null);
  // Bumped by the failure state's Retry — both fetch effects key on it, so a
  // bump re-runs whichever fetch this listing's tier uses, in place.
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  // Identity of the currently-DISPLAYED result set, keyed to drive the shell's
  // entrance cascade (it re-plays whenever this changes). The memory tier re-keys
  // synchronously off the selection (data is already in the browser); the server
  // tier re-keys only once its fetch lands, so the cascade tracks real rows and
  // not the in-flight click. Search text is excluded so live typing filters in
  // place rather than re-staggering the whole column each keystroke.
  const [serverViewKey, setServerViewKey] = useState<string>(initialKey ?? "");

  // First-mount skips: the SSR data already covers this URL, so don't re-fetch it.
  // Memory: seeded = the whole set is here, never re-fetch on mount. Server: skip
  // only when the mount URL's key matches what the server rendered.
  const skipInitialFetchAll = useRef(strategy.kind === "memory" && seeded);
  const skipFirstServerFetch = useRef(strategy.kind === "server" && seeded);

  // Codec dims — the param / get / set the URL round-trips through. Deliberately
  // options-INDEPENDENT: a dynamic strategy's options may vary with the selection
  // or external state, but the codec fields must not, so decode / encode / listKey
  // all use these. Static server array → itself; dynamic fn → evaluated once with
  // the defaults + no external state (its codec is identical to any other input).
  // Server codec dims are cached in a ref so their identity stays STABLE across
  // page fetches: a dynamic builder returns a fresh array each call, and if `dims`
  // re-derived on every `setFetched` then `filters` would re-derive too and the
  // fetch effect (keyed on `filters`) would loop. Memory tier derives from rows.
  const serverCodecDimsRef = useRef<SerializableDimension<F>[] | null>(null);
  const dims = useMemo<SerializableDimension<F>[]>(() => {
    const s = strategyRef.current;
    if (s.kind === "memory") return s.dimensions(fetched);
    if (serverCodecDimsRef.current === null) {
      serverCodecDimsRef.current =
        typeof s.dimensions === "function" ? s.dimensions(defaults, undefined as Ext) : s.dimensions;
    }
    return serverCodecDimsRef.current;
  }, [fetched, defaults]);

  const filters = useMemo(
    () => decodeListFilters(dims, new URLSearchParams(searchParams.toString()), defaults),
    [dims, searchParams, defaults],
  );
  const page = useMemo(() => Math.max(1, Number(searchParams.get("page")) || 1), [searchParams]);

  // External state seam (opt-in, server tier): a config-supplied hook, keyed off
  // the filters (Aave V4's asset universe scoped to the selected market). Called
  // via a stable no-op default so the hook count never changes across renders —
  // a given listing always has, or always lacks, this hook.
  const externalHook =
    strategy.kind === "server" && strategy.useExternalState ? strategy.useExternalState : useNoExternalState;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- externalHook is invariant per listing (see above)
  const externalState = externalHook(filters) as Ext;

  // Render dims — the same codec, but with OPTIONS resolved against the live
  // filters + external state (hub→spoke scoping, the asset universe). Equal to
  // `dims` for a static listing; only the toolbar/chips read these.
  const renderDims = useMemo<SerializableDimension<F>[]>(() => {
    const s = strategyRef.current;
    if (s.kind === "memory") return s.dimensions(fetched);
    return typeof s.dimensions === "function" ? s.dimensions(filters, externalState) : s.dimensions;
  }, [fetched, filters, externalState]);

  // Identity side-effect seam (opt-in). Fire the config's callback with the live
  // filters whenever the selection changes — via a ref so an inline closure at
  // the call site doesn't re-fire it every render (only a real filter change
  // does). Tier-1 configs pass nothing, so this is a no-op there.
  const onFiltersRef = useRef(onFilters);
  onFiltersRef.current = onFilters;
  useEffect(() => {
    onFiltersRef.current?.(filters);
  }, [filters]);

  // Memory: fetch the full set once (unless SSR already seeded it).
  useEffect(() => {
    if (strategyRef.current.kind !== "memory") return;
    if (skipInitialFetchAll.current) {
      skipInitialFetchAll.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    strategyRef.current
      .fetchAll()
      .then((all) => {
        if (!cancelled) setFetched(all);
      })
      .catch((err) => {
        if (!cancelled) {
          setFetched([]);
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [strategy.kind, retryTick]);

  // Server: fetch the current slice on every selection / page change. Skip the
  // very first fetch when the SSR'd rows already cover this URL (key match).
  useEffect(() => {
    if (strategyRef.current.kind !== "server") return;
    if (skipFirstServerFetch.current) {
      skipFirstServerFetch.current = false;
      if (initialKey != null && listKey(dims, filters, defaults, page) === initialKey) return;
    }
    let cancelled = false;
    setRefreshing(true);
    setError(null);
    strategyRef.current
      .fetchPage(filters, page)
      .then((res) => {
        if (cancelled) return;
        setFetched(res.data);
        setTotal(res.total);
        setServerViewKey(listKey(dims, filters, defaults, page));
      })
      .catch((err) => {
        if (cancelled) return;
        setFetched([]);
        setTotal(0);
        setError(err);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [strategy.kind, filters, page, retryTick]);

  const pushFilters = useCallback(
    (next: F, nextPage: number) => {
      const qs = encodeListFilters(dims, next, defaults);
      if (nextPage > 1) qs.set("page", String(nextPage));
      const s = qs.toString().replace(/%2C/gi, ",");
      const url = s ? `${basePath}?${s}` : basePath;
      // Update the URL on the CLIENT (History API) instead of router.push. The
      // browser already holds the data — the memory tier re-filters in place and
      // the server tier re-fetches via the effect below — so a soft navigation
      // would only re-run this route's `force-dynamic` server fetch on every
      // toggle: the long "nothing is happening" pause before the list swaps. The
      // History API keeps the URL shareable + back-button-correct (Next syncs
      // useSearchParams to pushState) while staying entirely on the client, so a
      // facet click registers immediately. Dim the server tier the instant it's
      // clicked (its rows re-fetch); the memory tier needs no dim — it re-filters
      // and re-cascades synchronously.
      if (strategyRef.current.kind === "server") setRefreshing(true);
      window.history.pushState(null, "", url);
      // pushState doesn't fire popstate; nudge useUrlSearchParams to re-read.
      notifyUrlChanged();
    },
    [dims, defaults, basePath],
  );

  // Reconcile seam (opt-in, server tier): once the external state resolves, drop
  // any selection that has fallen out of scope (e.g. a supply asset absent from
  // the loaded universe for the chosen market) and push the pruned filters. The
  // hook is idempotent — after the prune lands, the next run returns null — so
  // this converges rather than looping. Reset to page 1 (the pruned view is a new
  // result set). Tier-1 configs supply no `reconcile`, so this is a no-op there.
  useEffect(() => {
    const s = strategyRef.current;
    if (s.kind !== "server" || !s.reconcile) return;
    const pruned = s.reconcile(filters, externalState);
    if (pruned) pushFilters(pruned, 1);
  }, [filters, externalState, pushFilters]);

  // Search draft: on the server tier the query is a fetch param, so debounce the
  // push (no per-keystroke fetch); on the memory tier it's an in-memory predicate,
  // so apply it immediately (the current behaviour).
  const [qDraft, setQDraft] = useState(filters.q);
  useEffect(() => {
    setQDraft(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (strategy.kind !== "server") return;
    if (qDraft === filters.q) return;
    const t = setTimeout(() => pushFilters({ ...filters, q: qDraft }, 1), 300);
    return () => clearTimeout(t);
  }, [qDraft, filters, pushFilters, strategy.kind]);

  const onChange = (next: F) => {
    // The toolbar's current q is the draft (below), so a text change is one where
    // next.q differs from the draft — NOT from the committed filters.q (which may
    // still be catching up mid-debounce). Anything else is a facet / sort change.
    if (next.q !== qDraft) {
      setQDraft(next.q);
      if (strategy.kind === "memory") pushFilters({ ...filters, q: next.q }, 1);
      return; // server: the debounce effect above pushes
    }
    // Facet / sort change: carry the (possibly still-draft) q so a pending search
    // isn't dropped, and land on page 1.
    pushFilters(next, 1);
  };

  const visible = useMemo<T[]>(() => {
    const s = strategyRef.current;
    if (s.kind === "memory") return applyListFilter(fetched, s.dimensions(fetched), filters, s.apply);
    return fetched;
  }, [fetched, filters]);

  // Cascade key. Memory: synchronous off the selection (q stripped so search
  // filters in place). Server: the key set when the last fetch landed.
  const memoryViewKey = useMemo(
    () => listKey(dims, { ...filters, q: "" }, defaults, page),
    [dims, filters, defaults, page],
  );
  const viewKey = strategy.kind === "server" ? serverViewKey : memoryViewKey;

  const pagination =
    strategy.kind === "server"
      ? {
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(total / strategy.itemsPerPage)),
          totalCount: total,
          itemsPerPage: strategy.itemsPerPage,
          onPageChange: (p: number) => {
            pushFilters(filters, p);
            // router.push scrolled to top on navigation; the History API doesn't.
            // Keep that jump for page changes (the new slice reads from the top);
            // a facet toggle deliberately stays put so the list updates in place.
            if (typeof window !== "undefined") window.scrollTo({ top: 0 });
          },
        }
      : undefined;

  // The row-column band (opt-in): the config decides, from the rows + total +
  // selection, whether this view is a holder's own set and what the band says.
  // The memory tier has no server total, so it is handed the row count it
  // rendered — which for that tier IS the whole set.
  const above = renderAbove
    ? renderAbove({ items: visible, total: strategy.kind === "server" ? total : visible.length, filters })
    : undefined;

  // The listing's route already names the protocol — resolve it from `basePath`
  // so the shared header can show its "Protocol information" line without
  // every config having to pass a redundant protocol id.
  const directoryEntry = protocolForHref(basePath);

  return (
    <ChainTruthListing<T, F>
      title={title}
      protocol={directoryEntry}
      headerExtra={headerExtra}
      above={above}
      identity={identity}
      titleHidden={titleHidden}
      titleAs={titleAs}
      items={visible}
      loading={loading}
      refreshing={refreshing}
      viewKey={viewKey}
      pagination={pagination}
      error={
        error != null ? (
          renderError ? (
            renderError(error)
          ) : (
            <ListingUnavailable noun={noun} onRetry={retry} />
          )
        ) : undefined
      }
      renderCard={renderCard}
      hrefFor={hrefFor}
      keyFor={keyFor}
      noun={noun}
      filter={{
        dimensions: renderDims,
        filters: { ...filters, q: qDraft },
        onChange,
        sortOptions: typeof sortOptions === "function" ? sortOptions(filters) : sortOptions,
        searchPlaceholder,
        bookmarks: bookmarksProtocol
          ? {
              protocol: bookmarksProtocol,
              // Picking a bookmark filters the listing to that wallet — reuse
              // the search path (set the draft + push q immediately on both tiers).
              onPick: (address: string) => {
                setQDraft(address);
                pushFilters({ ...filters, q: address }, 1);
              },
            }
          : undefined,
      }}
    />
  );
}
