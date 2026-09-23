"use client";

// Liquity V2 Trove listing — client half. Holds the presentation config (card / href) + the server-driven strategy and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from page.tsx.
// The driver owns the toolbar, pagination, debounced search, URL and the fetch
// lifecycle; this file is just the V2-specific config plus the two pieces of
// interpretation the driver models through opt-in seams:
//   • the oracle-price side-fetch (USD on the open cards) → passed into renderCard,
//   • the wallet-view dispatch (search a wallet ⇒ header pill + recents) → the
//     driver's onFilters seam, resolving ENS the same way the old body did.
//
// Graduated from the old bespoke TrovesPageContent (decision 0009): the framer
// cascade, hand-rolled URL encode/decode, manual pagination and direct
// next/navigation useSearchParams (the hidden-dup hydration source) are all gone —
// the shared driver + useUrlSearchParams replace them, and this now SSR-first-paints
// like the rest of the tier.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import { TroveListError } from "@/components/troves/components/TroveListError";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { fetchTroves } from "@/lib/api/fetch-troves";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { HolderStrip } from "@/components/shared/holder-strip";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { namesHolder, parseTroveSearch } from "@/lib/liquity-v2/search";
import { isAllStatuses } from "@/lib/liquity-v2/listing-visibility";
import {
  liquityV2ListDimensions,
  liquityV2FiltersToFetchParams,
  LIQUITY_V2_LIST_DEFAULTS,
  LIQUITY_V2_SORT_OPTIONS,
  LIQUITY_V2_ITEMS_PER_PAGE,
  LIQUITY_V2_COLLATERAL_TYPES,
  type LiquityV2ListFilters,
} from "@/lib/liquity-v2/list-filter-dimensions";

export interface LiquityV2ListingProps {
  initialItems?: TroveSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function LiquityV2Listing({ initialItems, initialTotal, initialKey, initialSearch }: LiquityV2ListingProps) {
  // Oracle prices — a one-time side-fetch (USD on the open cards is an interpreted
  // layer). When it lands the config re-renders and renderCard closes over the new
  // value; it's outside the driver's fetch lifecycle, so it never triggers a
  // listing refetch. Best-effort: the cards render without USD until it resolves.
  const [prices, setPrices] = useState<OraclePricesData | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/oracle/liquity-v2");
        if (!res.ok) return;
        const json = (await res.json()) as OraclePricesResponse;
        if (!cancelled && json.success && json.data) setPrices(json.data);
      } catch {
        /* prices are an optional enhancement — the listing still loads */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Collateral facet options carry the token-icon chip (matches the position view).
  const collateralOptions = useMemo<FilterOptionDef[]>(
    () =>
      LIQUITY_V2_COLLATERAL_TYPES.map((type) => ({
        value: type,
        label: type,
        icon: <TokenChipIcon symbol={type} size={20} filterable={false} />,
      })),
    [],
  );

  // Wallet-view dispatch: when the search resolves to an identity, surface it in
  // the header pill + recents (the listing doubles as the wallet view). ENS is
  // forward-resolved for the pill; the /api/troves proxy resolves independently
  // for the query itself. Guarded by the last identity so a page/sort change (which
  // re-fires onFilters with the same q) doesn't re-dispatch or re-resolve.
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: LiquityV2ListFilters) => {
      const { ownerAddress, ownerEns } = parseTroveSearch(f.q);
      const key = (ownerAddress ?? ownerEns ?? "").toLowerCase();
      if (lastIdentityRef.current === key) return;
      lastIdentityRef.current = key;
      if (ownerAddress) {
        const lower = ownerAddress.toLowerCase();
        setWallets([lower], { [lower]: null });
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
    <ChainTruthListingPage<TroveSummary, LiquityV2ListFilters>
      title="Liquity V2 Troves"
      noun="Troves"
      basePath="/ethereum/liquity-v2"
      bookmarksProtocol="liquity-v2"
      defaults={LIQUITY_V2_LIST_DEFAULTS}
      sortOptions={LIQUITY_V2_SORT_OPTIONS}
      searchPlaceholder="Address, ENS, or ID"
      renderCard={(t) => <LiquityPositionCard protocol="liquity-v2" v={viewFromTroveSummary(t, prices)} compact />}
      hrefFor={(t) => `/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={serverStrategy<TroveSummary, LiquityV2ListFilters>({
        dimensions: liquityV2ListDimensions(collateralOptions),
        itemsPerPage: LIQUITY_V2_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchTroves(liquityV2FiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
      })}
      onFilters={onFilters}
      renderAbove={({ items, total, filters }) =>
        // The strip is a statement about a WALLET, so it mounts only where the
        // page IS that wallet's own set: the search names a holder, the status
        // selection is the relaxed default a holder search rests on, and no
        // facet has narrowed the rows further. Tick a facet and the page is a
        // subset of the wallet — counts of the subset said as the wallet's — so
        // the band goes rather than misstate what it is about. It also needs
        // the oracle read: three branches hold three different tokens, and
        // without a price there is no sum of them to state.
        namesHolder(filters.q) &&
        isAllStatuses(filters) &&
        !filters.collateralTypes?.length &&
        !filters.hasRedemptions &&
        !filters.batchOnly &&
        !filters.individualOnly &&
        prices ? (
          <HolderStrip {...liquityV2HolderStrip(items, total, prices, LIQUITY_V2_ITEMS_PER_PAGE)} />
        ) : null
      }
      renderError={(err) => <TroveListError message={err instanceof Error ? err.message : "Failed to load troves"} />}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
