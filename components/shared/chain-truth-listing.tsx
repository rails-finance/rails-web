"use client";

// Shared scaffold for the "chain-state tier" position listings (Morpho +
// MakerDAO): the pared-down explorers whose listing page is just a titled
// column of position cards. The page shell — the heading + blurb, the
// loading / map / empty states, and the row Link wrapper — lives here, once,
// so the two protocols can't drift apart. Each protocol supplies items + a
// card renderer + an href builder; this file owns the look.
//
// The richer listings (Liquity V2 / Aave V4 / V3) keep their own page bodies —
// filters, pagination, motion — this tier is deliberately the minimal one.

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import { PaginationControls, ResultCountLine } from "@/components/shared/pagination-controls";
import { ChainTruthListLoadingSkeleton } from "@/components/shared/chain-truth-list-loading-skeleton";
import { markNavStart } from "@/lib/perf/settle-marks";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { ProtocolEntry } from "@/lib/shared/protocols";
import { RailHeader } from "@/components/shared/rail-header";
import { IndexNotice } from "@/components/shared/index-notice";

// Row entrance: the rows enter as one 120 ms opacity fade (`.ct-row` in
// globals.css, the loading grammar's `.reveal-in`), in CSS so the hundreds of
// rows this tier can render cost the main thread nothing on mount. No exit
// animation: the column is re-keyed by `viewKey`, so React swaps it outright on
// a facet/sort/page change and the fresh mount replays the fade.

/** First-class filter surface: pass the protocol's dimension registry + the
 *  URL-backed param object and the shell renders the shared <ListToolbar> itself.
 *  A protocol graduates its listing by authoring a registry, not by re-wiring the
 *  toolbar into its page — so the shared search/facets/sort can't silently go
 *  "missing" the way an omitted `toolbar` node could. */
export interface ChainTruthListingFilter<F extends BaseListFilters> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  sortOptions: SortOption[];
  searchPlaceholder?: string;
  /** False: no search box (the wallet page names its subject). */
  search?: boolean;
  /** Draw the ⋮ that saves this view (N1.7, ui-jobs 521). */
  viewMenu?: boolean;
  /** The count a staged selection in that sheet would give. */
  countFor?: (draft: F) => number | Promise<number>;
  /** The noun for a staged selection in that sheet. */
  nounFor?: (draft: F) => string;
  /** A locked chip drawn first in the chip row (AIM's, ui-jobs 557). */
  chipsLead?: ReactNode;
  /** In place of the result count, a count line the page writes. */
  countNode?: ReactNode;
}

/** The default failure state: a listing fetch rejected and the config
 *  supplied no bespoke `renderError`. Distinct from the empty state, which is
 *  for a read that answered with no rows (ui-jobs 461). */
export function ListingUnavailable({ onRetry }: { onRetry?: () => void }) {
  return <IndexNotice onRetry={onRetry} />;
}

/** Server-driven paging surface: for the larger listings that page against the
 *  backend (offset/total) rather than filter a fully-fetched set in memory. When
 *  given, the shell renders <PaginationControls> below the column. */
export interface ChainTruthListingPagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** The count line's noun where the selection narrows it ("open positions"). */
  countNoun?: string;
  /** Said after the count, e.g. where the rest of the set sits. */
  countNote?: string;
}

export interface ChainTruthListingProps<T, F extends BaseListFilters = BaseListFilters> {
  /** Page heading, e.g. "Morpho Blue Positions". */
  title: string;
  /** The position rows to render. */
  items: T[];
  /** True while the first fetch is in flight (no rows yet) — shows the skeleton
   *  text. Distinct from `refreshing`, which keeps the current rows visible. */
  loading: boolean;
  /** True while a filter/sort/page change re-fetches with rows already on screen.
   *  The column is dimmed + made inert rather than blanked, so the toolbar keeps
   *  focus and the list doesn't flash. Only meaningful on the server-driven path. */
  refreshing?: boolean;
  /** Identity of the displayed result set. When it changes the column re-mounts
   *  and replays the entrance fade, so a facet/sort/page change animates.
   *  Excludes live search text so typing filters in place. */
  viewKey?: string;
  /** Server-side pagination. Omit for the in-memory tier (renders every item). */
  pagination?: ChainTruthListingPagination;
  /** Render one row's card body (wrapped in the row Link by the scaffold). */
  renderCard: (item: T) => ReactNode;
  /** Destination route for a row. */
  hrefFor: (item: T) => string;
  /** Stable React key for a row. */
  keyFor: (item: T) => string;
  /** Noun shown in the loading + empty states, e.g. "positions" / "vaults". */
  noun: string;
  /** The shared filter/sort/search surface. When given, the shell renders
   *  <ListToolbar> from the registry — the default path for a filtered listing. */
  filter?: ChainTruthListingFilter<F>;
  /** Escape hatch for a bespoke toolbar node (anything <ListToolbar> can't
   *  express). Prefer `filter`; this is ignored when `filter` is set. */
  toolbar?: ReactNode;
  /** Rendered in place of the row column when the last fetch errored — a real
   *  failure state, distinct from a genuinely empty result. When set it takes
   *  precedence over both the empty and the row branches (but not `loading`).
   *  The shared driver always supplies one on failure (<ListingUnavailable> by
   *  default, the config's `renderError` when given); a bare-shell caller that
   *  omits it keeps the old collapse-to-empty behaviour. */
  error?: ReactNode;
  /** Opt-in slot between the header block and the toolbar — e.g. a
   *  protocol-level stats band. Owns its own bottom margin. */
  headerExtra?: ReactNode;
  /** In place of the rail header's head stamp: a stamp for a listing whose
   *  rows come from a read behind the head (Aave V3's refresh, ui-jobs 806). */
  stamp?: ReactNode;
  /** Opt-in slot ABOVE the row column and about the rows themselves — the
   *  holder strip a wallet search draws over its own positions. Rendered
   *  inside the dimmed column, because it states figures summed from the rows
   *  under it and must dim with them while a refetch is in flight; and
   *  OUTSIDE the `viewKey`-keyed rows div, so a page / sort / facet change
   *  replays the cards' fade without replaying it on a band that did not change.
   *  Drawn only when there are rows — a summary of nothing is nothing. */
  above?: ReactNode;
  /** Opt-in slot under the rows and their pagination: on a listing searched
   *  by wallet, the wallet's positions of the protocol's other kinds
   *  (`components/shared/holder-kinds.tsx`). Drawn whatever the rows, since
   *  a wallet can hold none of this listing's kind and some of another. */
  below?: ReactNode;
  /** Opt-in line under the empty state, for a listing whose search can name
   *  nothing it reads (Alchemix: "Search takes a full address…"). */
  emptyNote?: ReactNode;
  /** Roster entry for the listing's protocol — renders the shared
   *  `RailHeader` (identity + sections menu, naming this listing) in place
   *  of a visible heading; `title` then lives in an sr-only h1. Omit and the
   *  full title stands alone as the visible h1, with no sections menu. */
  protocol?: ProtocolEntry;
  /** For a listing that is a SECTION rather than an explorer (a chain's
   *  Vaults): the identity line drawn above the visible h1 where an explorer
   *  would draw its RailHeader — the section's mark and word. Ignored when
   *  `protocol` is set. */
  identity?: ReactNode;
  /** With `identity` and no `protocol`: the identity node is the whole visible
   *  heading and `title` drops to an sr-only h1, the way a protocol listing's
   *  does under its RailHeader. For a section whose `identity` is its own rail
   *  header — a row that already names the section and the chain — a visible h1
   *  under it would say the same thing twice. */
  titleHidden?: boolean;
  /** "h2" for a listing drawn BELOW another page's own h1 (one Morpho market's
   *  positions, under the market's header): the title is then a section
   *  heading, not the page's. Default "h1". */
  titleAs?: "h1" | "h2";
}

export function ChainTruthListing<T, F extends BaseListFilters = BaseListFilters>({
  title,
  items,
  loading,
  refreshing,
  viewKey,
  pagination,
  renderCard,
  hrefFor,
  keyFor,
  noun,
  filter,
  toolbar,
  error,
  headerExtra,
  stamp,
  above,
  below,
  emptyNote,
  protocol,
  identity,
  titleHidden = false,
  titleAs: Title = "h1",
}: ChainTruthListingProps<T, F>) {
  // The entrance fade plays on a view CHANGE (filter/sort/page) — never on the
  // first paint. The initial rows arrive from SSR and must be visible + clickable
  // immediately, with no dependency on the compositor actually advancing an
  // animation: a listing opened in a background tab holds `.ct-row`'s opening
  // `opacity: 0` (fill-mode: both) until focused, so gating first paint on it
  // would render invisible rows. A view change only happens while the user is
  // looking at the tab, so the fade there is safe — and reads as feedback that
  // the list changed. `prevViewKey` is undefined on first render (→ no animation);
  // once the key changes, the re-keyed column remounts with the fade applied.
  const prevViewKeyRef = useRef<string | undefined>(undefined);
  const animateEntrance = prevViewKeyRef.current !== undefined && prevViewKeyRef.current !== viewKey;
  useEffect(() => {
    prevViewKeyRef.current = viewKey;
  }, [viewKey]);

  // The result count for the chip row: the server total, or the rows the
  // in-memory tier holds after filtering. The last settled number stays while
  // a fetch is in flight, so the count does not flash.
  const liveCount = pagination ? pagination.totalCount : items.length;
  const settledCountRef = useRef<number | null>(null);
  if (!loading && !refreshing && !error) settledCountRef.current = liveCount;
  const countTotal = error ? null : settledCountRef.current;
  const count = countTotal == null ? undefined : { total: countTotal, noun: pagination?.countNoun ?? noun };

  return (
    <div className="py-8">
      {/* The rail header carries the whole visible heading duty: identity,
          the sections menu naming this listing, and the recency stamp under
          them (decision 0006 — the chain head the page reads against). The
          intro prose lives on the rail's /info page (About in the sections
          menu), so nothing stacks underneath. The page keeps a real
          h1 for readers that need one — the full title, sr-only.
          Without a roster entry there is no protocol rail to draw, and what
          stands in its place is the caller's `identity`: a section that hands
          over its own rail header takes the same deal (`titleHidden`, so the
          h1 goes sr-only), while a bare identity line keeps the full title as
          the visible h1 beneath it. */}
      <div className="mb-6">
        {protocol ? (
          <>
            <RailHeader session={protocol.session} venue="listing" stamp={stamp ?? true} />
            <h1 className="sr-only">{title}</h1>
          </>
        ) : (
          <>
            {identity}
            <Title
              className={titleHidden ? "sr-only" : Title === "h2" ? "text-lg font-semibold" : "text-2xl font-semibold"}
            >
              {title}
            </Title>
          </>
        )}
      </div>
      {headerExtra != null && (
        <div data-skel-section="listing-header-extra" data-anatomy="N4">
          {headerExtra}
        </div>
      )}
      {filter ? (
        <ListToolbar
          dimensions={filter.dimensions}
          filters={filter.filters}
          onChange={filter.onChange}
          sortOptions={filter.sortOptions}
          searchPlaceholder={filter.searchPlaceholder}
          search={filter.search}
          count={count}
          countNode={filter.countNode}
          chipsLead={filter.chipsLead}
          viewMenu={filter.viewMenu}
          countPending={loading || refreshing}
          countFor={filter.countFor}
          nounFor={filter.nounFor}
        />
      ) : (
        toolbar
      )}
      {/* What the toolbar narrows, loading, failed or drawn: an open filter
          panel sets this back, dimmed and inert (FilterSheet). */}
      <div data-filters-results="">
        {loading ? (
          <ChainTruthListLoadingSkeleton />
        ) : error ? (
          // A real fetch failure, surfaced by the driver only when the config
          // supplies a renderer. Owns its own styling; replaces the row column
          // (and its pagination) so a failure never masquerades as "no matches".
          error
        ) : (
          <>
            {/* While a server-tier refetch is in flight (the memory tier re-filters
                synchronously, so `refreshing` is never set there), dim the column as
                a hint — but DON'T make it inert. The rows on screen are still valid
                and clickable; a `pointer-events: none` here froze hover + navigation
                for the whole round trip. `aria-busy` carries the state for AT. */}
            <div className={`transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing || undefined}>
              {/* The band about the rows — inside the dimmed column with them,
                outside the keyed div below so it does not replay the fade. */}
              {items.length > 0 && above}
              {items.length > 0 ? (
                // Keyed by `viewKey`: a facet/sort/page change swaps the key, React
                // re-mounts the column, and the fresh mount replays the CSS entrance
                // fade (`.ct-row`). Search text is excluded from the key upstream,
                // so typing filters in place without replaying it.
                <div key={viewKey ?? "list"} className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div key={keyFor(item)} className={animateEntrance ? "ct-row" : undefined}>
                      {/* prefetch={true}: the detail segments are dynamic routes with
                          no loading.tsx boundary, and on Next 15.5 the default prefetch
                          skips those entirely — no RSC payload, no route chunks. That
                          cold start was the dominant leg of detail settle (§3.4 marks:
                          0.9–1.6s to shell-mounted cold vs ~100ms with warm chunks).
                          Still free now that some detail pages render on the server:
                          re-measured against the SSR'd trove and Moonwell-on-Base
                          routes, a full prefetch returns 283–393 bytes of module refs
                          in ~4ms and carries none of the position's figures — Next
                          does not run a dynamic route's data work to answer one. Do
                          not infer that from the code; measure it again if the
                          prefetch semantics move. */}
                      {/* group/listing-row: the position card's frame keys its blue
                          navigation hover border off this group. Detail pages render
                          the same cards outside any row Link, so the hover state never
                          fires there. */}
                      <ListingRowLink href={hrefFor(item)}>{renderCard(item)}</ListingRowLink>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-rb-500">
                  {pagination ? `No ${noun} match these filters.` : `No ${noun} captured yet.`}
                  {emptyNote ? <p className="mt-1">{emptyNote}</p> : null}
                </div>
              )}
            </div>
            {/* A listing filtered in memory has no paging: the count alone,
                where the page writes no count line of its own. */}
            {!pagination && filter != null && filter.countNode == null && (
              <ResultCountLine total={items.length} noun={filter.nounFor?.(filter.filters) ?? noun} />
            )}
            {/* On one page the strip is the count alone, which gives way to a count
                line the page writes (Focus, Morpho's AIM), as the in-memory line does. */}
            {pagination && (pagination.totalPages > 1 || filter?.countNode == null) && (
              <PaginationControls
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalCount={pagination.totalCount}
                itemsPerPage={pagination.itemsPerPage}
                onPageChange={pagination.onPageChange}
                noun={pagination.countNoun ?? noun}
                note={pagination.countNote}
              />
            )}
          </>
        )}
        {!loading && !error && below}
      </div>
    </div>
  );
}

/** One row's link to its position: the listing's rows, and the wallet's
 *  other kinds under them (`components/shared/holder-kinds.tsx`). */
export function ListingRowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={true}
      className="group/listing-row block"
      data-anatomy="N2"
      onClick={() => markNavStart(href)}
    >
      {children}
    </Link>
  );
}
