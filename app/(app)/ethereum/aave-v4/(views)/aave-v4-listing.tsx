"use client";

// Aave V4 landing — client half. Holds the presentation config (card / href) + the server-driven strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx. The
// driver owns the toolbar, pagination, debounced search, URL and the fetch
// lifecycle; this file is the V4-specific config plus the interpretation the
// driver models through opt-in seams:
//   • dynamic dimensions — the facet OPTIONS depend on the selected market: spoke
//     options scope to the chosen hubs, and Supplying / Borrowing options come
//     from the asset universe fetched for that market (the `useExternalState` hook
//     below). `aaveV4ListDimensions(filters, universe)` is the dynamic builder.
//   • reconcile — once the (market-scoped) universe loads, prune any supply/borrow
//     asset selection that isn't offered there (`reconcileAaveV4Assets`).
//   • wallet-dispatch — search a wallet ⇒ header pill + recents (the `onFilters`
//     seam, resolving ENS the same way the old body did).
//
// Graduated from the old bespoke AaveV4ListingClient (decision 0009): the framer
// cascade, hand-rolled URL encode/decode + list-query, manual pagination and the
// inline asset-universe/prune effects are all gone — the shared driver + the two
// seams replace them.

import { useCallback, useEffect, useRef, useState } from "react";
import { AaveV4PositionListingCard } from "@/components/aave-v4/AaveV4PositionListingCard";
import { AaveV4ListError } from "@/components/aave-v4/components/AaveV4ListError";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { fetchAaveV4SpokePositions, type AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { fetchAaveV4AssetUniverse, type AaveV4AssetUniverseEntry } from "@/lib/api/fetch-aave-v4-asset-universe";
import { slugifySpoke } from "@/lib/aave-v4/spoke-meta";
import {
  aaveV4ListDimensions,
  aaveV4FiltersToFetchParams,
  reconcileAaveV4Assets,
  AAVE_V4_LIST_DEFAULTS,
  AAVE_V4_SORT_OPTIONS,
  AAVE_V4_ITEMS_PER_PAGE,
  type AaveV4ListFilters,
} from "@/lib/aave-v4/list-filter-dimensions";
import { parseAaveV4Search } from "@/lib/aave-v4/search";

export interface AaveV4ListingProps {
  initialItems?: AaveV4SpokePositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

/** The asset universe scoped to the selected market — the driver's external-state
 *  hook. Refetched whenever the selected spokes/hubs change; with a market
 *  selected the response carries config-truthful availability so the pills list
 *  only the assets that market actually offers. Empty until the call returns;
 *  failure is non-fatal (the asset dimensions just stay empty). */
function useAaveV4AssetUniverse(filters: AaveV4ListFilters): AaveV4AssetUniverseEntry[] {
  const [universe, setUniverse] = useState<AaveV4AssetUniverseEntry[]>([]);
  // Stable primitive deps so the effect only refires on actual market changes.
  const spokesKey = filters.spokes.join(",");
  const hubsKey = filters.hubs.join(",");
  useEffect(() => {
    let cancelled = false;
    fetchAaveV4AssetUniverse({
      spokes: spokesKey ? spokesKey.split(",") : [],
      hubs: hubsKey ? hubsKey.split(",") : [],
    })
      .then((r) => {
        if (!cancelled) setUniverse(r.assets);
      })
      .catch(() => {
        /* non-fatal — leave the asset dimensions empty */
      });
    return () => {
      cancelled = true;
    };
  }, [spokesKey, hubsKey]);
  return universe;
}

export function AaveV4Listing({ initialItems, initialTotal, initialKey, initialSearch }: AaveV4ListingProps) {
  // Wallet-view dispatch: surface the searched wallet in the header pill + recents.
  // Guarded by the last identity so a page/sort change doesn't re-dispatch/re-resolve.
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: AaveV4ListFilters) => {
      const { wallet, ownerEns } = parseAaveV4Search(f.q);
      const key = wallet ?? ownerEns ?? "";
      if (lastIdentityRef.current === key) return;
      lastIdentityRef.current = key;
      if (wallet) {
        setWallets([wallet], { [wallet]: null });
        return;
      }
      if (ownerEns) {
        (async () => {
          try {
            const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(ownerEns)}`);
            if (!res.ok) return;
            const { address } = (await res.json()) as { address: string | null };
            if (!address) return;
            const lower = address.toLowerCase();
            setWallets([lower], { [lower]: ownerEns });
          } catch {
            /* best-effort — the listing still loads via the proxy */
          }
        })();
      }
    },
    [setWallets],
  );

  return (
    <ChainTruthListingPage<AaveV4SpokePositionRow, AaveV4ListFilters, AaveV4AssetUniverseEntry[]>
      title="Aave V4 Positions"
      noun="positions"
      basePath="/ethereum/aave-v4"
      bookmarksProtocol="aave-v4"
      defaults={AAVE_V4_LIST_DEFAULTS}
      sortOptions={AAVE_V4_SORT_OPTIONS}
      searchPlaceholder="Address or ENS"
      renderCard={(row) => <AaveV4PositionListingCard row={row} />}
      hrefFor={(row) =>
        `/ethereum/aave-v4/spoke/${slugifySpoke(row.spokeName) ?? encodeURIComponent(row.spokeName)}/${row.wallet}`
      }
      keyFor={(row) => `${row.wallet}:${row.spoke}`}
      strategy={serverStrategy<AaveV4SpokePositionRow, AaveV4ListFilters, AaveV4AssetUniverseEntry[]>({
        dimensions: (filters, universe) => aaveV4ListDimensions(filters, universe),
        useExternalState: useAaveV4AssetUniverse,
        reconcile: reconcileAaveV4Assets,
        itemsPerPage: AAVE_V4_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchAaveV4SpokePositions(aaveV4FiltersToFetchParams(filters, page)).then((r) => ({
            data: r.rows,
            total: r.total,
          })),
      })}
      onFilters={onFilters}
      renderError={(err) => (
        <AaveV4ListError message={err instanceof Error ? err.message : "Failed to load positions"} />
      )}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
