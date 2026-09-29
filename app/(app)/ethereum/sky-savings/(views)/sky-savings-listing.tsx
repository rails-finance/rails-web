"use client";

// Sky Savings listing — client half: the card, the href and the server
// strategy, handed to the shared listing driver. A wallet search (address or
// ENS) names the holder in the header pill, as the other listings do.

import { useCallback, useRef } from "react";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { ListingUnavailable } from "@/components/shared/chain-truth-listing";
import { SkySavingsPositionCard } from "@/components/protocol/sky-savings/sky-savings-position-card";
import { SkyGateStatement } from "@/components/protocol/sky-savings/sky-savings-gate-refusal";
import {
  fetchSkyListingPage,
  parseSkySearch,
  SKY_ITEMS_PER_PAGE,
  SKY_LIST_DEFAULTS,
  SkyGateError,
  skyListDimensions,
  skySortOptions,
  type SkyListFilters,
  type SkyListRow,
} from "@/lib/sky-savings/listing";
import { SKY_BASE_PATH, skyPositionHref } from "@/lib/sky-savings/constants";

export interface SkySavingsListingProps {
  initialItems?: SkyListRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function SkySavingsListing({ initialItems, initialTotal, initialKey, initialSearch }: SkySavingsListingProps) {
  const { setWallets } = useWalletContext();
  const last = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: SkyListFilters) => {
      const { address, ens } = parseSkySearch(f.q);
      const key = address ?? ens?.toLowerCase() ?? "";
      if (last.current === key) return;
      last.current = key;
      if (address) {
        setWallets([address], { [address]: null });
        return;
      }
      if (ens) {
        (async () => {
          try {
            const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(ens)}`);
            if (!res.ok) return;
            const { address: a } = (await res.json()) as { address: string | null };
            if (a) setWallets([a.toLowerCase()], { [a.toLowerCase()]: ens });
          } catch {
            /* the listing still loads */
          }
        })();
      }
    },
    [setWallets],
  );

  return (
    <ChainTruthListingPage<SkyListRow, SkyListFilters>
      title="Sky Savings positions"
      noun="positions"
      basePath={SKY_BASE_PATH}
      bookmarksProtocol="sky-savings"
      defaults={SKY_LIST_DEFAULTS}
      sortOptions={skySortOptions}
      searchPlaceholder="Address or ENS"
      renderCard={(p) => <SkySavingsPositionCard p={p} asOf={p.asOf} surface="listing" />}
      renderAbove={({ items }) => {
        const c = items[0]?.counts;
        if (!c) return null;
        const n = (v: number) => v.toLocaleString("en-US");
        return (
          <p className="mb-3 text-xs leading-relaxed text-rb-500">
            An open position is an address that holds sUSDS now; a closed one held some and holds none. At block{" "}
            {n(c.block)}, {n(c.holdersEver)} addresses had held sUSDS and {n(c.holdersOpen)} held some.
            {c.excluded > 0
              ? ` The list leaves out ${n(c.excluded)} contracts that hold sUSDS for others (${c.excludedWords}); they open by address.`
              : ""}{" "}
            The last check against the contract ran at block {n(c.gateBlock)}.
          </p>
        );
      }}
      hrefFor={(p) => skyPositionHref(p.holder)}
      keyFor={(p) => p.holder}
      strategy={serverStrategy<SkyListRow, SkyListFilters>({
        dimensions: skyListDimensions(),
        itemsPerPage: SKY_ITEMS_PER_PAGE,
        fetchPage: (filters, page) => fetchSkyListingPage(filters, page),
      })}
      onFilters={onFilters}
      renderError={(err) =>
        err instanceof SkyGateError ? (
          <SkyGateStatement reason={err.reason} gate={null} />
        ) : (
          <ListingUnavailable noun="positions" />
        )
      }
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
