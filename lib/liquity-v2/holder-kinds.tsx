// Liquity V2's position kinds for a wallet search (components/shared/holder-kinds.tsx):
// Troves and Stability Pool deposits, each read from its listing route. Each
// listing draws its own kind's cards with these renders and passes the other
// kind to the shared sections.

import { holderKind } from "@/components/shared/holder-kinds";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { fetchTroves } from "@/lib/api/fetch-troves";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import { LIQUITY_V2_LIST_DEFAULTS, liquityV2FiltersToFetchParams } from "./list-filter-dimensions";
import { fetchSpPage, SP_LIST_DEFAULTS } from "./sp-listing";
import { LIQUITY_V2_SP_PATH, liquityV2DepositHref } from "./sp-routes";

const BASE_PATH = "/ethereum/liquity-v2";

export const liquityV2TroveCard = (t: TroveSummary, prices: OraclePricesData | null) => (
  <LiquityPositionCard protocol="liquity-v2" surface="listing" v={viewFromTroveSummary(t, prices)} compact />
);
export const liquityV2TroveHref = (t: TroveSummary) => `${BASE_PATH}/trove/${t.collateralType}/${t.id}`;
export const liquityV2TroveKey = (t: TroveSummary) => `${t.collateralType}-${t.id}`;
export const liquityV2DepositListingCard = (r: LiquityV2DepositRow) => (
  <LiquityV2DepositCard row={r} surface="listing" />
);

/** The Troves kind; its cards carry USD at the branch prices. */
export const liquityV2TroveKind = (prices: OraclePricesData | null) =>
  holderKind<TroveSummary>({
    id: "trove",
    heading: "Troves",
    listingPath: BASE_PATH,
    // The Trove listing's own params for a wallet search: every status, newest first.
    read: (wallet, signal) =>
      fetchTroves({ ...liquityV2FiltersToFetchParams({ ...LIQUITY_V2_LIST_DEFAULTS, q: wallet }, 1), signal }).then(
        (r) => ({ rows: r.data, total: r.pagination.total, passedOn: r.pagination.passedOn ?? 0 }),
      ),
    renderCard: (t) => liquityV2TroveCard(t, prices),
    hrefFor: liquityV2TroveHref,
    keyFor: liquityV2TroveKey,
  });

export const LIQUITY_V2_DEPOSITS = holderKind<LiquityV2DepositRow>({
  id: "deposit",
  heading: "Stability Pool deposits",
  listingPath: LIQUITY_V2_SP_PATH,
  // An address names a depositor, so the page is every status, newest first.
  read: (wallet, signal) =>
    fetchSpPage({ ...SP_LIST_DEFAULTS, q: wallet }, 1, { signal }).then((r) => ({ rows: r.data, total: r.total })),
  renderCard: liquityV2DepositListingCard,
  hrefFor: (r) => liquityV2DepositHref(r.collateral_type, r.depositor),
  keyFor: (r) => `${r.collateral_type}:${r.depositor}`,
});
