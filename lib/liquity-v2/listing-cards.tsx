// Liquity V2's listing cards: the Trove card and the Stability Pool deposit
// card as the listings draw them, and the Trove's href and key. The wallet
// page's Liquity V2 section draws its Troves with the same render
// (components/wallet/wallet-position-card.tsx).

import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";

const BASE_PATH = "/ethereum/liquity-v2";

/** `shutdown`: the branch's state the wallet page's head read hands
 *  (ui-jobs 802); a listing passes none. */
export const liquityV2TroveCard = (
  t: TroveSummary,
  prices: OraclePricesData | null,
  shutdown?: BranchShutdownState | null,
) => (
  <LiquityPositionCard
    protocol="liquity-v2"
    surface="listing"
    v={viewFromTroveSummary(t, prices)}
    compact
    shutdown={shutdown}
  />
);
export const liquityV2TroveHref = (t: TroveSummary) => `${BASE_PATH}/trove/${t.collateralType}/${t.id}`;
export const liquityV2TroveKey = (t: TroveSummary) => `${t.collateralType}-${t.id}`;
export const liquityV2DepositListingCard = (r: LiquityV2DepositRow) => (
  <LiquityV2DepositCard row={r} surface="listing" />
);
