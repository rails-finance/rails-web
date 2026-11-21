"use client";

// One protocol's listing on the wallet page (ui-jobs 738): with Liquity V2
// chosen, `/wallet/<address>?protocol=liquity-v2` is the Trove listing with
// the wallet in place of the search. It reads what the listing reads for a
// wallet search (/api/troves?ownerAddress=…, the branch prices), draws the
// listing's pills and sort after the Protocol pill (W8), and its summary is
// the listing's holder band (N7) with its receipts open in the page's
// inspector; the wallet's Stability Pool deposits follow the rows (N7.3) and
// count in the band, as on the listing. Clearing or changing the Protocol
// pill opens that view.

import { useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { PositionCardEdgeContext, type PositionCardEdge } from "@/components/shared/position-card-edge";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { LIQUITY_V2_DEPOSITS } from "@/lib/liquity-v2/holder-kinds";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { useLiquityV2Prices } from "@/hooks/useLiquityV2Prices";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { WalletHeader } from "@/components/wallet/wallet-header";
import { fetchTroves } from "@/lib/api/fetch-troves";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import { branchMcr } from "@/lib/liquity/event-safety";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { isAllStatuses } from "@/lib/liquity-v2/listing-visibility";
import {
  LIQUITY_V2_COLLATERAL_TYPES,
  LIQUITY_V2_ITEMS_PER_PAGE,
  LIQUITY_V2_SORT_OPTIONS,
} from "@/lib/liquity-v2/list-filter-dimensions";
import {
  walletLiquityV2Dimensions,
  walletLiquityV2FetchParams,
  WALLET_LIQUITY_V2_DEFAULTS,
  type WalletLiquityV2Filters,
} from "@/lib/wallet/liquity-v2-on-wallet";
import { walletHref, type WalletProtocolCount } from "@/lib/wallet/wallet-filters";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PROTOCOLS } from "@/lib/shared/protocols";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";

const PROTOCOL = "liquity-v2";
const OTHER_KINDS = [LIQUITY_V2_DEPOSITS];
/** The roster id, the glyph key. */
const ROSTER_ID = PROTOCOLS.find((e) => e.chainId === MAINNET_CHAIN_ID && e.slug === PROTOCOL)?.id ?? PROTOCOL;

/** Past the branch's minimum collateral ratio at the listing's price read. */
function troveAtRisk(t: TroveSummary, prices: OraclePricesData | null): boolean {
  if (t.status !== "open" || !prices || t.debt.current <= 0) return false;
  const price = prices[t.collateralType.toLowerCase() as keyof OraclePricesData];
  const mcr = branchMcr(t.collateralType);
  if (price == null || mcr == null) return false;
  return (t.collateral.amount * price) / t.debt.current < mcr;
}

export function WalletProtocolListing({
  address,
  ensName,
  held,
  initialItems,
  initialTotal,
  initialPassedOn = 0,
  initialKey,
  initialSearch,
}: {
  address: string;
  ensName: string | null;
  held: WalletProtocolCount[];
  initialItems?: TroveSummary[];
  initialTotal?: number;
  initialPassedOn?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  const router = useRouter();
  // A protocol change reads the page again: the page stays and dims meanwhile.
  const [reading, startReading] = useTransition();
  const registry = useReceiptRegistry();

  // The branch prices, the listing's one side-fetch.
  const prices = useLiquityV2Prices();

  const collateralOptions = useMemo<FilterOptionDef[]>(
    () =>
      LIQUITY_V2_COLLATERAL_TYPES.map((type) => ({
        value: type,
        label: type,
        icon: <TokenChipIcon symbol={type} size={20} filterable={false} />,
      })),
    [],
  );
  const passedOn = useRef(initialPassedOn);
  // The wallet's deposits, under the rows and counted in the band.
  const { wallet, reads } = useHolderKinds(OTHER_KINDS, address);
  const deposits = reads[LIQUITY_V2_DEPOSITS.id];

  const edge = (t: TroveSummary): PositionCardEdge => ({
    surface: "wallet",
    protocol: { id: ROSTER_ID, name: "Liquity V2" },
    chain: { id: MAINNET_CHAIN_ID, name: "Ethereum" },
    atRisk: troveAtRisk(t, prices),
  });

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        data-wallet-view={address}
        data-wallet-protocol={PROTOCOL}
        aria-busy={reading || undefined}
        data-wallet-reading={reading ? "" : undefined}
        className={`transition-opacity ${reading ? "pointer-events-none opacity-50" : ""}`}
      >
        <ChainTruthListingPage<TroveSummary, WalletLiquityV2Filters>
          title={`Liquity V2 Troves of ${ensName ?? address}`}
          titleHidden
          titleAs="h2"
          identity={
            <div className="mb-1">
              <WalletHeader address={address} ensName={ensName} />
            </div>
          }
          noun="Troves"
          basePath={`/wallet/${address}`}
          defaults={WALLET_LIQUITY_V2_DEFAULTS}
          sortOptions={LIQUITY_V2_SORT_OPTIONS}
          search={false}
          renderCard={(t) => (
            <PositionCardEdgeContext.Provider value={edge(t)}>
              <LiquityPositionCard
                protocol="liquity-v2"
                surface="listing"
                v={viewFromTroveSummary(t, prices)}
                compact
              />
            </PositionCardEdgeContext.Provider>
          )}
          hrefFor={(t) => `/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`}
          keyFor={(t) => `${t.collateralType}-${t.id}`}
          strategy={serverStrategy<TroveSummary, WalletLiquityV2Filters>({
            dimensions: walletLiquityV2Dimensions(address, held, collateralOptions),
            itemsPerPage: LIQUITY_V2_ITEMS_PER_PAGE,
            fetchPage: (filters, page) =>
              fetchTroves(walletLiquityV2FetchParams(address, filters, page)).then((r) => {
                passedOn.current = r.pagination.passedOn ?? 0;
                return { data: r.data, total: r.pagination.total };
              }),
          })}
          onFilters={(f) => {
            // The Protocol pill changed: the page for that protocol, or for
            // every protocol, which reads differently.
            if (f.protocol !== PROTOCOL)
              startReading(() => router.replace(walletHref(address, f.protocol), { scroll: false }));
          }}
          renderAbove={({ items, total, filters }) =>
            // The band states the wallet's whole set: no pill narrowing it.
            isAllStatuses({ ...filters, q: address }) &&
            !filters.collateralTypes?.length &&
            filters.hasRedemptions == null &&
            !filters.batchOnly &&
            !filters.individualOnly &&
            !filters.debt.length &&
            !filters.coll.length &&
            !filters.tx.length &&
            prices &&
            deposits !== undefined ? (
              <HolderStrip
                scoped
                {...liquityV2HolderStrip(
                  items,
                  total,
                  prices,
                  LIQUITY_V2_ITEMS_PER_PAGE,
                  passedOn.current,
                  undefined,
                  deposits === "failed" ? undefined : (deposits as HolderKindPage<LiquityV2DepositRow>),
                )}
              />
            ) : null
          }
          renderBelow={() => <HolderKinds kinds={OTHER_KINDS} reads={reads} wallet={wallet} />}
          initialItems={initialItems}
          initialTotal={initialTotal}
          initialKey={initialKey}
          initialSearch={initialSearch}
        />
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
