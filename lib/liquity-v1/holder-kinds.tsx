// Liquity V1's position kinds for a wallet search (components/shared/holder-kinds.tsx):
// Troves and the Stability Pool deposit, each read from its listing route.
// Each listing draws its own kind's cards with these renders and passes the
// other kind to the shared sections.

import { holderKind } from "@/components/shared/holder-kinds";
import { LiquityV1PositionCard, viewFromSummary } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { LiquityV1DepositCard } from "@/components/protocol/liquity/v1-sp-deposit-card";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import { LIQUITY_V1_ITEMS_PER_PAGE } from "./list-filter-dimensions";
import { fetchSpPage, SP_LIST_DEFAULTS } from "./sp-listing";
import { LIQUITY_V1_BASE_PATH, LIQUITY_V1_SP_PATH, liquityV1DepositHref } from "./sp-routes";

export const liquityV1TroveCard = (p: LiquityV1PositionSummary) => (
  <LiquityV1PositionCard
    v={viewFromSummary(p)}
    surface="listing"
    endedBy={p.closedByRedemption ? "redemption" : null}
  />
);
export const liquityV1TroveHref = (p: LiquityV1PositionSummary) =>
  `${LIQUITY_V1_BASE_PATH}/${p.wallet}?epoch=${p.epoch}`;
export const liquityV1TroveKey = (p: LiquityV1PositionSummary) => `${p.wallet}-${p.epoch}`;
export const liquityV1DepositListingCard = (r: LiquityV1DepositRow) => (
  <LiquityV1DepositCard row={r} surface="listing" />
);

export const LIQUITY_V1_TROVES = holderKind<LiquityV1PositionSummary>({
  id: "trove",
  heading: "Troves",
  listingPath: LIQUITY_V1_BASE_PATH,
  read: (wallet, signal) =>
    fetchLiquityV1Positions({
      wallet,
      sortBy: "recent",
      sortOrder: "desc",
      limit: LIQUITY_V1_ITEMS_PER_PAGE,
      offset: 0,
      signal,
    }).then((r) => ({ rows: r.data, total: r.pagination.total })),
  renderCard: liquityV1TroveCard,
  hrefFor: liquityV1TroveHref,
  keyFor: liquityV1TroveKey,
});

export const LIQUITY_V1_DEPOSITS = holderKind<LiquityV1DepositRow>({
  id: "deposit",
  heading: "Stability Pool deposits",
  listingPath: LIQUITY_V1_SP_PATH,
  // An address names a depositor, so the page is every status, newest first.
  read: (wallet, signal) =>
    fetchSpPage({ ...SP_LIST_DEFAULTS, q: wallet }, 1, { signal }).then((r) => ({ rows: r.data, total: r.total })),
  renderCard: liquityV1DepositListingCard,
  hrefFor: (r) => liquityV1DepositHref(r.depositor),
  keyFor: (r) => r.depositor,
});
