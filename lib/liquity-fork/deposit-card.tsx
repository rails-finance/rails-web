// A Liquity V2 fork's Stability Pool deposit card as its deposit listing draws
// it, with a shut-down branch's state from the catalog's record. The wallet
// page's fork sections draw the same card (components/wallet/wallet-position-card.tsx).

import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { recordedShutdown } from "@/lib/shared/liquity-family-shutdown";
import { branchShutdownState } from "./shutdown";
import type { SpDeployment } from "@/lib/liquity-v2/sp-deployment";

/** A shut-down branch's state from its catalog record, for a listing card
 *  (the deposit page adds the live read, hooks/useBranchShutdown.ts). */
const recordedBranchShutdown = (dep: SpDeployment, collateralType: string) =>
  branchShutdownState(recordedShutdown(dep.id, collateralType), null);

/** A fork deposit's listing card. */
export const forkDepositListingCard = (dep: SpDeployment) => (r: LiquityV2DepositRow<string>) => (
  <LiquityV2DepositCard row={r} surface="listing" dep={dep} shutdown={recordedBranchShutdown(dep, r.collateral_type)} />
);
