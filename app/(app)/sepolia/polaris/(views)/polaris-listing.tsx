"use client";

// Polaris listing — client half. Holds the presentation config (card / href)
// + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Polaris-specific config.
//
// hrefFor is TWO segments — /sepolia/polaris/<market>/<id> — because the same
// id exists in both markets; keyFor is the same pair.
//
// The search box is tri-modal (address / ENS / CDP number, parsed in
// lib/polaris/search.ts). Naming a holder or a CDP number also relaxes the
// resting status default to every status (lib/polaris/listing-visibility.ts),
// and a holder search dispatches the wallet view — the header pill + recents —
// through the driver's onFilters seam, as Liquity V2 does.
//
// The one interpretation this listing adds is the market board: a SINGLE
// side-fetch of /api/chain/polaris/markets on mount (Liquity V2's own pattern
// — liquity-v2-listing.tsx), which carries both markets' price legs, MCRs,
// mode and rate at one head block. Every row's approximate ratio, floor,
// liquidation price and rate is computed from that one read; nothing is read
// per CDP, so the roster's size is irrelevant and decision 0018 (no scheduled
// per-wallet sweep, risk lives on the position page) is untouched. It sits
// outside the driver's fetch lifecycle, so a page/sort/filter change never
// refetches it — the config simply re-renders when it lands. A `chainStale`
// answer is kept as null: the cards stay dashes rather than state a ratio at
// a price that failed to read.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { PolarisPositionCard, viewFromSummary } from "@/components/protocol/polaris/polaris-position-card";
import { HolderStrip } from "@/components/shared/holder-strip";
import { fetchPolarisListingPage } from "@/lib/polaris/listing-fetch";
import { polarisHolderStrip } from "@/lib/polaris/holder-strip";
import { namesHolder, parsePolarisSearch } from "@/lib/polaris/search";
import { isAllStatuses } from "@/lib/polaris/listing-visibility";
import {
  polarisListDimensions,
  polarisSortOptions,
  POLARIS_LIST_DEFAULTS,
  POLARIS_ITEMS_PER_PAGE,
  type PolarisListFilters,
} from "@/lib/polaris/list-filter-dimensions";
import { POLARIS_BASE_PATH, polarisPositionHref } from "@/lib/polaris/routes";

export interface PolarisListingProps {
  initialItems?: PolarisPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function PolarisListing({ initialItems, initialTotal, initialKey, initialSearch }: PolarisListingProps) {
  const [markets, setMarkets] = useState<PolarisMarketsChainResponse | null>(null);
  const [marketsSettled, setMarketsSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chain/polaris/markets");
        if (res.ok) {
          const json = (await res.json()) as PolarisMarketsChainResponse;
          if (!cancelled && !json.chainStale) setMarkets(json);
        }
      } catch {
        /* the board is an enhancement — the listing still lists */
      } finally {
        if (!cancelled) setMarketsSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Market facet options carry the stable's token glyph (matches the card's own
  // chip); the SSR half decodes with the bare options and derives the same key.
  const marketOptions = useMemo<FilterOptionDef[]>(
    () =>
      Object.values(POLARIS_MARKET_CONFIG).map((cfg) => ({
        value: cfg.key,
        label: cfg.stable.symbol,
        icon: <TokenChipIcon symbol={cfg.stable.symbol} address={cfg.stable.address} size={20} filterable={false} />,
      })),
    [],
  );

  // Wallet-view dispatch: when the search names a holder, surface it in the
  // header pill + recents (the listing doubles as the wallet view). ENS is
  // forward-resolved for the pill; listing-fetch.ts resolves it again for the
  // query itself. Guarded by the last identity so a page/sort change (which
  // re-fires onFilters with the same q) doesn't re-dispatch or re-resolve.
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: PolarisListFilters) => {
      const { ownerAddress, ownerEns } = parsePolarisSearch(f.q);
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
            /* best-effort — the listing still loads */
          }
        })();
      }
    },
    [setWallets],
  );

  return (
    <ChainTruthListingPage<PolarisPositionSummary, PolarisListFilters>
      title="Polaris CDPs"
      noun="CDPs"
      basePath={POLARIS_BASE_PATH}
      bookmarksProtocol="polaris"
      defaults={POLARIS_LIST_DEFAULTS}
      sortOptions={polarisSortOptions}
      searchPlaceholder="Address, ENS, or CDP number"
      renderCard={(p) => <PolarisPositionCard v={viewFromSummary(p, markets, !marketsSettled)} surface="listing" />}
      hrefFor={(p) => polarisPositionHref(p.market, p.cdpId)}
      keyFor={(p) => `${p.market}:${p.cdpId}`}
      strategy={serverStrategy<PolarisPositionSummary, PolarisListFilters>({
        dimensions: polarisListDimensions(marketOptions),
        itemsPerPage: POLARIS_ITEMS_PER_PAGE,
        fetchPage: (filters, page) => fetchPolarisListingPage(filters, page),
      })}
      onFilters={onFilters}
      renderAbove={({ items, total, filters }) =>
        // The strip is a statement about a WALLET, so it mounts only where the
        // page IS that wallet's own set: the search names a holder, the status
        // selection is the relaxed default the middle path gives a holder
        // search, and no facet has narrowed the rows further. Tick a facet and
        // the page becomes a subset of the wallet — the counts under it would
        // then be counts of the subset, said as if they were the wallet's — so
        // the band goes rather than misstate what it is about. It also needs
        // the board read: without a price nothing here can be summed across
        // the two markets, and a stale board is kept as no board at all.
        namesHolder(filters.q) &&
        isAllStatuses(filters) &&
        filters.market.length === 0 &&
        filters.debt.length === 0 &&
        markets ? (
          <HolderStrip {...polarisHolderStrip(items, total, markets, POLARIS_ITEMS_PER_PAGE)} />
        ) : null
      }
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
