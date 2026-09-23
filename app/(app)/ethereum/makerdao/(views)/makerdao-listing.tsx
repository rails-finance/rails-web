"use client";

// MakerDAO listing — client half. The presentation config plus the server-driven
// strategy, handed to the shared ChainTruthListingPage driver with the SSR
// first-paint data from page.tsx.
//
// It used to be the in-memory tier: one 500-row fetch of a 31,750-vault index,
// filtered in the browser, with the Collateral type menu derived from whichever
// ilks were in those 500 rows. Sorted by collateral USD, that slice reached 13
// of the index's 42 collateral types and 1.6% of its vaults, and nothing on the
// page said so. The driver now pages against rails-server, and the ilk facet
// comes from the ilk ROSTER — every collateral type the index holds.
//
// The roster is external state in the driver's sense (the seam Aave V4 opened
// for its asset universe): the dimension registry is a function of it, and
// `reconcile` prunes a selection the roster does not carry.

import { useEffect, useState } from "react";

import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import { fetchMakerIlkRoster } from "@/lib/api/fetch-makerdao-ilk-roster";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MakerVaultCard, viewFromSummary } from "@/components/protocol/makerdao/makerdao-vault-card";
import { fetchMakerVaultPage } from "@/lib/makerdao/list-fetch";
import {
  makerListDimensions,
  makerSelectionNeedsRoster,
  reconcileMakerIlks,
  MAKER_ITEMS_PER_PAGE,
  MAKER_LIST_DEFAULTS,
  MAKER_ROSTER_LOADING,
  MAKER_SORT_OPTIONS,
  type MakerListFilters,
  type MakerRosterState,
} from "@/lib/makerdao/list-filter-dimensions";

export interface MakerDAOListingProps {
  initialItems?: MakerVaultSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

// One roster fetch per browser session, shared by everything that needs it: the
// dimensions hook (which renders the options) and the page fetch (which maps a
// typed name onto the backend's `ilks` param). Module scope rather than
// component state because those two are reached by different paths and must
// never see different rosters — a page fetch built from a half-loaded roster
// would ask a narrower question than the chips claim. Client-only: this file is
// a client component, page.tsx fetches its own copy per request, so this is
// never a cross-request cache. The promise never rejects; a failure settles as
// "unavailable", which the registry reads as "offer no collateral facets".
let rosterState: MakerRosterState = MAKER_ROSTER_LOADING;
let rosterPromise: Promise<MakerRosterState> | null = null;

function ensureRoster(): Promise<MakerRosterState> {
  rosterPromise ??= fetchMakerIlkRoster()
    .then((roster): MakerRosterState => (rosterState = { status: "ready", roster }))
    .catch((): MakerRosterState => (rosterState = { status: "unavailable", roster: null }));
  return rosterPromise;
}

/** The roster as render state. Safe to call from more than one place — every
 *  caller subscribes to the same single fetch. */
function useMakerRoster(): MakerRosterState {
  const [state, setState] = useState<MakerRosterState>(rosterState);
  useEffect(() => {
    let cancelled = false;
    ensureRoster().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function MakerDAOListing({ initialItems, initialTotal, initialKey, initialSearch }: MakerDAOListingProps) {
  // The live selection, mirrored out of the driver so the header can state what
  // this view could not carry.
  const [filters, setFilters] = useState<MakerListFilters>(MAKER_LIST_DEFAULTS);
  const roster = useMakerRoster();
  // The roster route is absent until the backend half is deployed, and a typed
  // collateral-type name cannot be turned into a filter without it. That search
  // resolves to an empty result rather than to an unfiltered page — so the
  // reason is stated, else "No vaults match these filters." would read as a fact
  // about the index instead of a fact about this deployment.
  const rosterMissing = roster.status === "unavailable" && makerSelectionNeedsRoster(filters);

  return (
    <ChainTruthListingPage<MakerVaultSummary, MakerListFilters, MakerRosterState>
      title="MakerDAO Vaults"
      // Sits here rather than inside the intro disclosure, which rests
      // collapsed: a reader who cannot see what was left off has no way to tell
      // a capped answer from a complete one.
      headerExtra={
        rosterMissing ? (
          <p className="mb-4 text-sm text-rb-500">
            The collateral-type roster is not reachable, so collateral types cannot be searched by name or filtered
            here. A wallet address or a vault number still resolves.
          </p>
        ) : undefined
      }
      noun="vaults"
      basePath="/ethereum/makerdao"
      bookmarksProtocol="makerdao"
      defaults={MAKER_LIST_DEFAULTS}
      sortOptions={MAKER_SORT_OPTIONS}
      searchPlaceholder="Search wallet, vault #, or collateral type"
      renderCard={(v) => <MakerVaultCard v={viewFromSummary(v)} />}
      hrefFor={(v) => `/ethereum/makerdao/${v.cdpId ?? v.urn}`}
      keyFor={(v) => v.urn}
      strategy={serverStrategy<MakerVaultSummary, MakerListFilters, MakerRosterState>({
        dimensions: (f, state) => makerListDimensions(f, state),
        useExternalState: useMakerRoster,
        reconcile: reconcileMakerIlks,
        itemsPerPage: MAKER_ITEMS_PER_PAGE,
        // Wait for the roster rather than read whatever has landed: a typed name
        // maps onto `ilks` through it, and asking early would ask a different
        // question than the chips show.
        fetchPage: async (f, page) => fetchMakerVaultPage(f, page, await ensureRoster()),
      })}
      onFilters={setFilters}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
