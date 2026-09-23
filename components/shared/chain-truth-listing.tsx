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

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ChainTruthListLoadingSkeleton } from "@/components/shared/chain-truth-list-loading-skeleton";
import { markNavStart } from "@/lib/perf/settle-marks";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { BookmarkScope } from "@/lib/shared/sessions";
import type { ProtocolEntry } from "@/lib/shared/protocols";
import { RailHeader } from "@/components/shared/rail-header";

// Entrance cascade — a staggered fade + rise for the row column, done in CSS
// (see `.ct-row` in globals.css), NOT framer-motion. This tier (unlike the
// paginated flagships) can render the whole set — hundreds of rows — and driving
// that many per-node JS animations choked the main thread on mount: rows sat
// mid-fade with hover/clicks unresponsive for seconds. A compositor-driven CSS
// animation costs the main thread nothing, so rows are interactive immediately
// while they settle. Two properties preserved from the old framer version:
//   • No exit animation. The column is re-keyed by `viewKey`, so React swaps it
//     outright on a facet/sort/page change and the fresh mount replays the
//     entrance — nothing to hang or stack.
//   • Capped stagger. A per-row 0.045s step over 500 rows would cascade for 20s+;
//     the per-row `--ct-i` index is clamped to STAGGER_CAP so only the top rows
//     visibly stagger and the tail settles together.
const STAGGER_CAP = 12;

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
  /** When set, the toolbar's search box gains this protocol's bookmarks
   *  dropdown; picking a wallet runs `onPick` (used to filter the listing). */
  bookmarks?: { protocol: BookmarkScope; onPick: (wallet: string) => void };
}

/** The default failure state — rendered when a listing fetch rejected and the
 *  config supplied no bespoke `renderError`. Distinct from the empty state on
 *  purpose: a down backend (e.g. mid-deploy on the box) used to collapse to
 *  "No {noun} captured yet.", which reads as a truth claim about the index when
 *  it's actually a service interruption. Same quiet styling as the empty state,
 *  plus a retry that re-runs the fetch in place. */
export function ListingUnavailable({ noun, onRetry }: { noun: string; onRetry?: () => void }) {
  return (
    <div className="text-sm text-rb-500">
      <p>
        The live index isn&apos;t reachable right now, so no {noun} could be loaded — a service interruption, not an
        empty index.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-rb-300 px-3 py-1 text-foreground/80 transition-colors hover:border-blue-500 hover:text-foreground dark:border-rb-700"
        >
          Retry
        </button>
      )}
    </div>
  );
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
   *  and replays the entrance cascade — so a facet/sort/page change animates.
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
  /** Opt-in slot ABOVE the row column and about the rows themselves — the
   *  holder strip a wallet search draws over its own positions. Rendered
   *  inside the dimmed column, because it states figures summed from the rows
   *  under it and must dim with them while a refetch is in flight; and
   *  OUTSIDE the `viewKey`-keyed rows div, so a page / sort / facet change
   *  re-staggers the cards without re-staggering a band that did not change.
   *  Drawn only when there are rows — a summary of nothing is nothing. */
  above?: ReactNode;
  /** Roster entry for the listing's protocol — renders the shared
   *  `RailHeader` (identity + sub-nav tabs, this listing's tab active) in
   *  place of a visible heading; `title` then lives in an sr-only h1. Omit
   *  and the full title stands alone as the visible h1, with no tabs. */
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
  above,
  protocol,
  identity,
  titleHidden = false,
  titleAs: Title = "h1",
}: ChainTruthListingProps<T, F>) {
  // Entrance cascade plays on a view CHANGE (filter/sort/page) — never on the
  // first paint. The initial rows arrive from SSR and must be visible + clickable
  // immediately, with no dependency on the compositor actually advancing an
  // animation: a listing opened in a background tab holds `.ct-row`'s opening
  // `opacity: 0` (fill-mode: both) until focused, so gating first paint on it
  // would render invisible rows. A view change only happens while the user is
  // looking at the tab, so the cascade there is safe — and reads as feedback that
  // the list changed. `prevViewKey` is undefined on first render (→ no animation);
  // once the key changes, the re-keyed column remounts with the cascade applied.
  const prevViewKeyRef = useRef<string | undefined>(undefined);
  const animateEntrance = prevViewKeyRef.current !== undefined && prevViewKeyRef.current !== viewKey;
  useEffect(() => {
    prevViewKeyRef.current = viewKey;
  }, [viewKey]);

  return (
    <div className="py-8">
      {/* The rail header carries the whole visible heading duty: identity +
          recency stamp (decision 0006 — the chain head the page reads
          against) on the left, the sub-nav on the right with this listing's
          tab active. The intro prose lives on the rail's /info page (the (i)
          in the sub-nav), so nothing stacks underneath. The page keeps a real
          h1 for readers that need one — the full title, sr-only.
          Without a roster entry there is no protocol rail to draw, and what
          stands in its place is the caller's `identity`: a section that hands
          over its own rail header takes the same deal (`titleHidden`, so the
          h1 goes sr-only), while a bare identity line keeps the full title as
          the visible h1 beneath it. */}
      <div className="mb-6">
        {protocol ? (
          <>
            <RailHeader session={protocol.session} venue="listing" stamp />
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
      {headerExtra != null && <div data-skel-section="listing-header-extra">{headerExtra}</div>}
      {filter ? (
        <ListToolbar
          dimensions={filter.dimensions}
          filters={filter.filters}
          onChange={filter.onChange}
          sortOptions={filter.sortOptions}
          searchPlaceholder={filter.searchPlaceholder}
          bookmarks={filter.bookmarks}
        />
      ) : (
        toolbar
      )}
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
                outside the keyed div below so it does not re-stagger. */}
            {items.length > 0 && above}
            {items.length > 0 ? (
              // Keyed by `viewKey`: a facet/sort/page change swaps the key, React
              // re-mounts the column, and the fresh mount replays the CSS entrance
              // cascade (`.ct-row`). Search text is excluded from the key upstream,
              // so typing filters in place without re-staggering.
              <div key={viewKey ?? "list"} className="flex flex-col gap-3">
                {items.map((item, i) => (
                  <div
                    key={keyFor(item)}
                    className={animateEntrance ? "ct-row" : undefined}
                    style={animateEntrance ? ({ "--ct-i": Math.min(i, STAGGER_CAP) } as CSSProperties) : undefined}
                  >
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
                    {/* group/listing-row: <PositionCardShell> keys its blue navigation
                          hover border off this group, so shell-based cards match the
                          bare-content cards (V2/V4) whose configs own the row surface.
                          Detail pages render the same cards outside any row Link, so
                          the hover state never fires there. */}
                    <Link
                      href={hrefFor(item)}
                      prefetch={true}
                      className="group/listing-row block"
                      onClick={() => markNavStart(hrefFor(item))}
                    >
                      {renderCard(item)}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-rb-500">
                {pagination ? `No ${noun} match these filters.` : `No ${noun} captured yet.`}
              </div>
            )}
          </div>
          {pagination && (
            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              itemsPerPage={pagination.itemsPerPage}
              onPageChange={pagination.onPageChange}
              noun={noun}
            />
          )}
        </>
      )}
    </div>
  );
}
