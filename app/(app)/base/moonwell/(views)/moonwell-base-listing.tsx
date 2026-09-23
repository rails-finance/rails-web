"use client";

// Moonwell Base listing — client half. The shared Moonwell listing driver
// pointed at the Base route, the shared Moonwell card bound to the Base lane
// (session, sweep receipts, no replay peaks), and the one thing the Ethereum
// listing never has to say: how complete the lane is.
//
// A row is one wallet's standing across every market under the one
// Comptroller, as on Ethereum: every balance a chain read at the block the row
// names, every dollar the Comptroller's own oracle at that block.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MoonwellPositionSummary } from "@/lib/sources/api/moonwell-positions";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import {
  fetchMoonwellBaseMarkets,
  MOONWELL_BASE_ROSTER_LOADING,
  MOONWELL_BASE_ROSTER_UNAVAILABLE,
  type MoonwellBaseRosterState,
} from "@/lib/api/fetch-moonwell-base-markets";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MoonwellPositionCard, viewFromSummary } from "@/components/protocol/moonwell/moonwell-position-card";
import { MoonwellDeploymentProvider } from "@/lib/moonwell/deployment-context";
import { makeListedMoonwellIdentity } from "@/lib/moonwell/swept-card-provenance";
import {
  MOONWELL_BASE_COMPTROLLER,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import {
  moonwellBaseListDimensions,
  moonwellBaseFiltersToFetchParams,
  MOONWELL_BASE_LIST_DEFAULTS,
  MOONWELL_BASE_POSITIONS_ROUTE,
  MOONWELL_BASE_SORT_OPTIONS,
} from "@/lib/moonwell-base/list-filter-dimensions";
import { MOONWELL_ITEMS_PER_PAGE, type MoonwellListFilters } from "@/lib/moonwell/list-filter-dimensions";

export interface MoonwellBaseListingProps {
  initialItems?: MoonwellPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** The facet roster the server render resolved, if it did. */
  initialRoster?: MoonwellBaseRosterState;
}

/** The lane every card on this page cites: the Base Comptroller, the Base
 *  sweep, this route. Module-level, so the provider value is stable. */
const DEPLOYMENT = makeListedMoonwellIdentity({
  session: "moonwell-base",
  comptroller: { name: "Comptroller (Base)", address: MOONWELL_BASE_COMPTROLLER },
  positionRoute: "/api/chain/moonwell-base/position",
  positionsRoute: MOONWELL_BASE_POSITIONS_ROUTE,
  router: MOONWELL_BASE_WETH_ROUTER,
  deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
});

// One roster fetch per browser session — the option universe behind the
// Supplying / Borrowing facets. Module scope rather than component state so a
// remount does not re-ask for a membership list that shifts on governance
// timescales. The promise never rejects; a failure settles as "unavailable",
// which the registry reads as "offer no asset facets" — and costs the listing
// nothing else, because a chip already carries the mToken address the backend
// filters on. Client-only: page.tsx fetches its own copy per request, so this
// is never a cross-request cache.
let rosterState: MoonwellBaseRosterState = MOONWELL_BASE_ROSTER_LOADING;
let rosterPromise: Promise<MoonwellBaseRosterState> | null = null;

function ensureRoster(): Promise<MoonwellBaseRosterState> {
  rosterPromise ??= fetchMoonwellBaseMarkets()
    .then((r): MoonwellBaseRosterState => (rosterState = { status: "ready", markets: r.markets }))
    .catch((): MoonwellBaseRosterState => (rosterState = MOONWELL_BASE_ROSTER_UNAVAILABLE));
  return rosterPromise;
}

/** The roster as render state, seeded from the server render when it resolved
 *  one — so a chip restored from a shared URL reads "USDC" on first paint
 *  rather than an address. */
function useMoonwellBaseRoster(initial?: MoonwellBaseRosterState): MoonwellBaseRosterState {
  if (initial?.status === "ready" && rosterState.status !== "ready") {
    rosterState = initial;
    rosterPromise = Promise.resolve(initial);
  }
  const [state, setState] = useState<MoonwellBaseRosterState>(rosterState);
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

export function MoonwellBaseListing({
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
  initialRoster,
}: MoonwellBaseListingProps) {
  const roster = useMoonwellBaseRoster(initialRoster);
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: MoonwellListFilters) => {
      const q = f.q.trim().toLowerCase();
      const wallet = /^0x[a-f0-9]{40}$/.test(q) ? q : "";
      if (lastIdentityRef.current === wallet) return;
      lastIdentityRef.current = wallet;
      if (wallet) setWallets([wallet], { [wallet]: null });
    },
    [setWallets],
  );

  return (
    <MoonwellDeploymentProvider value={DEPLOYMENT}>
      <ChainTruthListingPage<MoonwellPositionSummary, MoonwellListFilters, MoonwellBaseRosterState>
        title="Moonwell Positions"
        noun="positions"
        basePath="/base/moonwell"
        bookmarksProtocol="moonwell-base"
        defaults={MOONWELL_BASE_LIST_DEFAULTS}
        sortOptions={MOONWELL_BASE_SORT_OPTIONS}
        searchPlaceholder="Search wallet address"
        renderCard={(p) => <MoonwellPositionCard v={viewFromSummary(p)} peaks={false} />}
        hrefFor={(p) => `/base/moonwell/${p.wallet}`}
        keyFor={(p) => p.wallet}
        strategy={serverStrategy<MoonwellPositionSummary, MoonwellListFilters, MoonwellBaseRosterState>({
          // Only the asset facets' OPTIONS vary with the roster — the codec
          // (param / get / set) is identical either way.
          dimensions: (filters, r) => moonwellBaseListDimensions(filters, r),
          useExternalState: () => roster,
          itemsPerPage: MOONWELL_ITEMS_PER_PAGE,
          fetchPage: (filters, page) =>
            fetchMoonwellPositions(moonwellBaseFiltersToFetchParams(filters, page)).then((r) => ({
              data: r.data,
              total: r.pagination.total,
            })),
        })}
        onFilters={onFilters}
        initialItems={initialItems}
        initialTotal={initialTotal}
        initialKey={initialKey}
        initialSearch={initialSearch}
      />
    </MoonwellDeploymentProvider>
  );
}
