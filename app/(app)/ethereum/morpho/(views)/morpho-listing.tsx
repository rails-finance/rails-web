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

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { OPEN_SCOPE_PANEL, useAssetScope } from "@/lib/shared/asset-scope";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
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
  MORPHO_MARKET_CSV_CAP,
  morphoAimMarkets,
  withAimMarkets,
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

const n = (v: number) => v.toLocaleString("en-US");

export function MorphoListing({ initialItems, initialTotal, initialKey, initialSearch, market }: MorphoListingProps) {
  // AIM (asset isolation mode, ui-jobs 557) on the directory: positions whose
  // market lends or takes an AIM asset (morphoAimMarkets), under the reader's
  // own facets. A market's page is gated whole (AimGate on that page).
  const scope = useAssetScope();
  const [peek, setPeek] = useState(false);
  const aimKeys = market ? null : scope.keys;
  const aiming = aimKeys != null && !peek;
  const aimRef = useRef<ReadonlySet<string> | null>(null);
  aimRef.current = aiming ? aimKeys : null;
  // The same selection's total without AIM, for "Showing N of M".
  const [unscoped, setUnscoped] = useState<number | null>(null);
  // AIM markets the request could not carry (the market CSV's cap).
  const [aimCut, setAimCut] = useState(0);
  // AIM is not in the URL, so the driver cannot see it change: a new AIM set
  // remounts the listing, which fetches afresh (the SSR rows were read without it).
  const aimView = aiming ? `aim:${[...aimKeys].sort().join(",")}` : "all";

  // The live selection, mirrored out of the driver so the header can state what
  // this view could not carry.
  const [filters, setFilters] = useState<MorphoListFilters>(MORPHO_LIST_DEFAULTS);
  const roster = useMorphoRoster(!market);
  const truncation = market ? null : morphoSearchTruncation(filters, roster);
  // The roster can be unavailable (the backend failed to answer), and a name
  // search or a token facet cannot be expressed without it. Those selections
  // resolve to an empty result rather than to an unfiltered page — so the reason
  // is stated, else "No positions match these filters." would read as a fact
  // about the index instead of a fact about this deployment.
  const rosterMissing = !market && roster.status === "unavailable" && (aiming || morphoSelectionNeedsRoster(filters));
  const aim = useMemo(
    () => (aiming && roster.status === "ready" && roster.roster ? morphoAimMarkets(roster.roster, aimKeys) : null),
    [aiming, aimKeys, roster],
  );

  const aimChip = aiming ? (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SCOPE_PANEL))}
      className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2.5 py-1 text-xs text-teal-700 transition-colors hover:bg-teal-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-400"
      title={aim ? `Loan or collateral in your focus: ${aim.symbols.join(", ") || "none"}` : undefined}
      aria-label={`Focus: ${aim?.symbols.join(", ") || "assets"}. Change focus`}
      data-aim-chip={aim?.symbols.length ?? ""}
    >
      <Lock className="size-3" aria-hidden="true" />
      {aim != null && aim.symbols.length === 0
        ? "No market in your focus"
        : `Focus: ${
            aim == null ? "…" : `${aim.symbols[0]}${aim.symbols.length > 1 ? ` +${aim.symbols.length - 1}` : ""}`
          }`}
    </button>
  ) : undefined;

  const aimCount =
    aimKeys == null
      ? undefined
      : (total: number) => {
          const press = (label: string, v: boolean) => (
            <button
              type="button"
              onClick={() => setPeek(v)}
              className={`font-semibold ${INPLACE_TEXT}`}
              data-scope-peek={v}
            >
              {label}
            </button>
          );
          const word = (v: number) => (v === 1 ? "position" : "positions");
          if (peek)
            return (
              <span data-scope-note="" data-total={total}>
                Showing all {n(total)} {word(total)} · {press("Back to your focus", false)}
              </span>
            );
          return (
            <span data-scope-note="" data-shown={total} data-total={unscoped ?? ""}>
              {unscoped == null
                ? total === 0
                  ? "No position in your focus matches"
                  : `${n(total)} ${word(total)} in your focus`
                : total === 0
                  ? `None of the ${n(unscoped)} ${word(unscoped)} is in your focus`
                  : `Showing ${n(total)} of ${n(unscoped)} ${word(unscoped)}`}{" "}
              · {press("Show all", true)}
            </span>
          );
        };

  /** The fetch with AIM's markets under it; null where it leaves nothing to ask. */
  const aimParams = async (f: MorphoListFilters, page: number) => {
    const state = await ensureRoster();
    const params = morphoFiltersToFetchParams(f, page, state);
    const keys = aimRef.current;
    if (!keys) return { params, all: params, truncated: 0 };
    if (state.status !== "ready" || !state.roster) return { params: null, all: null, truncated: 0 };
    if (!params) return { params: null, all: null, truncated: 0 };
    return { ...withAimMarkets(params, morphoAimMarkets(state.roster, keys).ids), all: params };
  };

  const listing = (
    <ChainTruthListingPage<MorphoPositionSummary, MorphoListFilters, MorphoRosterState>
      key={aimView}
      // Focus is asked of the server here (the market ids), not judged per page.
      focus={false}
      chipsLead={aimChip}
      countNode={aimCount}
      title={market ? "Positions in this market" : "Morpho Blue Positions"}
      titleAs={market ? "h2" : undefined}
      // On a market page the section heading above the listing names it.
      titleHidden={market != null}
      // Both notes sit here rather than inside the intro disclosure, which rests
      // collapsed: a reader who cannot see what was left off has no way to tell
      // a capped answer from a complete one.
      headerExtra={
        aiming && aimCut > 0 ? (
          <p className="mb-4 text-sm text-rb-500">
            AIM reaches more markets than one request can carry. The {n(MORPHO_MARKET_CSV_CAP)} holding the most
            positions are listed; {n(aimCut)} more are left off.
          </p>
        ) : rosterMissing && aiming ? (
          <p className="mb-4 text-sm text-rb-500">
            The market roster is not reachable, so AIM cannot be applied to this list. Show all lists every position.
          </p>
        ) : rosterMissing ? (
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
          // Null = a selection nothing can match (a market name no market
          // carries, a facet this backend cannot express). No request, and the
          // shell's "No positions match these filters." states it accurately.
          const { params, all, truncated } = await aimParams(f, page);
          if (aimRef.current) setAimCut(truncated);
          // Under AIM, the same selection's total without it, one row asked.
          const [r, whole] = await Promise.all([
            params ? fetchMorphoPositions(params) : null,
            aimRef.current && all ? fetchMorphoPositions({ ...all, limit: 1, offset: 0 }) : null,
          ]);
          // Nothing to ask without Focus (the roster unread, or a selection that
          // matches nothing): no figure to set the shown count against.
          if (aimRef.current) setUnscoped(whole ? whole.pagination.total : null);
          return r ? { data: r.data, total: r.pagination.total } : { data: [], total: 0 };
        },
        fetchCount: market
          ? undefined
          : async (f) => {
              const { params } = await aimParams(f, 1);
              return params ? (await fetchMorphoPositions({ ...params, limit: 1, offset: 0 })).pagination.total : 0;
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
      // The SSR rows were read without AIM; under it the listing fetches its own.
      initialItems={aiming ? undefined : initialItems}
      initialTotal={aiming ? undefined : initialTotal}
      initialKey={aiming ? undefined : initialKey}
      initialSearch={initialSearch}
    />
  );
  if (market) return listing;
  // Held hidden until AIM has been read, so the whole list does not draw first.
  return (
    <div data-scope-list="" {...(scope.ready ? { "data-scope-ready": "" } : {})}>
      {listing}
    </div>
  );
}
