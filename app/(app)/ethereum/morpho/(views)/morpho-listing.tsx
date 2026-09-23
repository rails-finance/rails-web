"use client";

// Morpho Blue L1 listing — client half. The presentation config plus the
// server-driven strategy, handed to the shared ChainTruthListingPage driver with
// the SSR first-paint data from page.tsx.
//
// It used to be the in-memory tier: one 500-row fetch of a 46,815-position
// index, filtered in the browser, with the Market / Loan / Collateral menus
// derived from whichever markets were in those 500 rows. A reader searching for
// "reUSD" got 29 of that market's 215 positions and an unsearchable 135-entry
// Market list, with nothing on the page to say either number was partial. The
// driver now pages against rails-server, and the facets come from the market
// ROSTER — every market the index holds, fetched once per view.
//
// The roster is external state in the driver's sense (the seam Aave V4 opened
// for its asset universe): the dimension registry is a function of it, and
// `reconcile` prunes a selection the roster does not carry.
//
// The same listing, with `market` set, is the positions section of one
// market's page: the market rides every fetch, only Status is offered, no
// roster is fetched, and the URL it keeps in sync is that page's own
// (lib/morpho/list-filter-dimensions.tsx, "fixed to one market").

import { useEffect, useState } from "react";
import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import { fetchMorphoMarketRoster } from "@/lib/api/fetch-morpho-market-roster";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MorphoPositionCard, viewFromSummary } from "@/components/protocol/morpho/morpho-position-card";
import { MorphoMarketPageLine } from "@/components/protocol/morpho/morpho-market-link";
import {
  morphoListDimensions,
  morphoFiltersToFetchParams,
  morphoMarketDimensions,
  morphoMarketFetchParams,
  morphoSearchTarget,
  morphoSearchTruncation,
  morphoSelectionNeedsRoster,
  reconcileMorphoFacets,
  MORPHO_ITEMS_PER_PAGE,
  MORPHO_LIST_DEFAULTS,
  MORPHO_ROSTER_LOADING,
  MORPHO_SORT_OPTIONS,
  type MorphoListFilters,
  type MorphoRosterState,
} from "@/lib/morpho/list-filter-dimensions";

export interface MorphoListingProps {
  initialItems?: MorphoPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** Fix the listing to one market — its id and the path of the market page
   *  it is drawn on. */
  market?: { id: string; path: string };
}

// One roster fetch per browser session, shared by everything that needs it: the
// dimensions hook (which renders the options) and the page fetch (which maps a
// selection onto the backend's params). Module scope rather than component
// state because those two are reached by different paths and must never see
// different rosters — a page fetch built from a half-loaded roster would ask a
// narrower question than the chips claim. Client-only: this file is a client
// component, page.tsx fetches its own copy per request, so this is never a
// cross-request cache. The promise never rejects; a failure settles as
// "unavailable", which the registry reads as "offer no market facets".
let rosterState: MorphoRosterState = MORPHO_ROSTER_LOADING;
let rosterPromise: Promise<MorphoRosterState> | null = null;

function ensureRoster(): Promise<MorphoRosterState> {
  rosterPromise ??= fetchMorphoMarketRoster()
    .then((roster): MorphoRosterState => (rosterState = { status: "ready", roster }))
    .catch((): MorphoRosterState => (rosterState = { status: "unavailable", roster: null }));
  return rosterPromise;
}

/** The roster as render state. Safe to call from more than one place — every
 *  caller subscribes to the same single fetch. `enabled` false (a listing fixed
 *  to one market, which needs no roster) fetches nothing. */
function useMorphoRoster(enabled = true): MorphoRosterState {
  const [state, setState] = useState<MorphoRosterState>(rosterState);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ensureRoster().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}

/** The roster as the driver's external state. */
function useListingRoster(): MorphoRosterState {
  return useMorphoRoster();
}

export function MorphoListing({ initialItems, initialTotal, initialKey, initialSearch, market }: MorphoListingProps) {
  // The live selection, mirrored out of the driver so the header can state what
  // this view could not carry.
  const [filters, setFilters] = useState<MorphoListFilters>(MORPHO_LIST_DEFAULTS);
  const roster = useMorphoRoster(!market);
  const truncation = market ? null : morphoSearchTruncation(filters, roster);
  // The roster route is absent until the backend half is deployed, and a name
  // search or a token facet cannot be expressed without it. Those selections
  // resolve to an empty result rather than to an unfiltered page — so the reason
  // is stated, else "No positions match these filters." would read as a fact
  // about the index instead of a fact about this deployment.
  const rosterMissing = !market && roster.status === "unavailable" && morphoSelectionNeedsRoster(filters);

  return (
    <ChainTruthListingPage<MorphoPositionSummary, MorphoListFilters, MorphoRosterState>
      title={market ? "Positions in this market" : "Morpho Blue Positions"}
      titleAs={market ? "h2" : undefined}
      // Both notes sit here rather than inside the intro disclosure, which rests
      // collapsed: a reader who cannot see what was left off has no way to tell
      // a capped answer from a complete one.
      headerExtra={
        rosterMissing ? (
          <p className="mb-4 text-sm text-rb-500">
            The market roster is not reachable, so markets cannot be searched by name or filtered by token here. A
            wallet address or a 64-character market id still resolves.
          </p>
        ) : truncation ? (
          <p className="mb-4 text-sm text-rb-500">
            That search names {truncation.matched.toLocaleString("en-US")} markets, more than one request can carry. The{" "}
            {truncation.carried} of them holding the most positions are searched; a narrower search, or a Market chip,
            reaches the rest.
          </p>
        ) : undefined
      }
      noun="positions"
      basePath={market ? market.path : "/ethereum/morpho"}
      bookmarksProtocol="morpho"
      defaults={MORPHO_LIST_DEFAULTS}
      sortOptions={MORPHO_SORT_OPTIONS}
      searchPlaceholder={market ? "Search wallet address" : "Search wallet, market name, or market id"}
      renderCard={(p) => <MorphoPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/morpho/${encodeURIComponent(p.positionId)}`}
      keyFor={(p) => p.positionId}
      strategy={serverStrategy<MorphoPositionSummary, MorphoListFilters, MorphoRosterState>({
        dimensions: (f, state) => (market ? morphoMarketDimensions(f) : morphoListDimensions(f, state)),
        useExternalState: market ? undefined : useListingRoster,
        reconcile: market ? undefined : reconcileMorphoFacets,
        itemsPerPage: MORPHO_ITEMS_PER_PAGE,
        fetchPage: async (f, page) => {
          if (market) {
            const params = morphoMarketFetchParams(f, page, market.id);
            if (!params) return { data: [], total: 0 };
            const r = await fetchMorphoPositions(params);
            return { data: r.data, total: r.pagination.total };
          }
          // Wait for the roster rather than read whatever has landed: the params
          // this selection maps onto depend on it, and asking early would ask a
          // different question than the chips show.
          const params = morphoFiltersToFetchParams(f, page, await ensureRoster());
          // Null = a selection nothing can match (a market name no market
          // carries, a facet this backend cannot express). No request, and the
          // shell's "No positions match these filters." states it accurately.
          if (!params) return { data: [], total: 0 };
          const r = await fetchMorphoPositions(params);
          return { data: r.data, total: r.pagination.total };
        },
      })}
      onFilters={setFilters}
      // A search that is exactly one market id gets that market's page, named
      // from the rows it returned.
      renderAbove={
        market
          ? undefined
          : ({ items, filters: f }) => {
              const id = morphoSearchTarget(f.q).market;
              const row = id ? items.find((p) => p.marketId.toLowerCase().replace(/^0x/, "") === id) : undefined;
              return row ? (
                <MorphoMarketPageLine label={row.marketLabel} marketId={row.marketId} loanToken={row.loanToken} />
              ) : null;
            }
      }
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
