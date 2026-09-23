// V2's adapter onto the Liquity-family position card — the one place V2's own
// API types (TroveSummary / TroveStateData / OraclePricesData) meet the shared
// card's contract (components/protocol/liquity-family/types.ts). V2 is the
// design benchmark, so this mapping is close to a relabelling; a fork's own
// adapter lives beside its own types and settles onto the same contract.

import type { TroveSummary } from "@/types/api/trove";
import type { TroveStateData } from "@/types/api/troveState";
import type { OraclePricesData } from "@/types/api/oracle";
import type { LiquityTroveLive, LiquityTroveView } from "@/components/protocol/liquity-family/types";
import { getBatchManagerByAddress, getBatchManagerDeprecation } from "@/lib/services/batch-manager-service";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";

function priceFor(collateralType: string, prices?: OraclePricesData | null): number | null {
  if (!prices) return null;
  return prices[collateralType.toLowerCase() as keyof OraclePricesData] ?? null;
}

/** Builds the card's view from a trove's indexed summary row — the listing's
 *  only source, and the detail page's floor before a live read lands. */
export function viewFromTroveSummary(t: TroveSummary, prices?: OraclePricesData | null): LiquityTroveView {
  const price = priceFor(t.collateralType, prices);
  const collateralUsd = price ? t.collateral.amount * price : null;
  const collateralRatioPct = collateralUsd && t.debt.current > 0 ? (collateralUsd / t.debt.current) * 100 : null;

  return {
    id: t.id,
    status: t.status,
    isZombie: t.isZombie,
    collateralType: t.collateralType,
    collateral: t.collateral.amount,
    debt: t.debt.current,
    peakCollateral: t.collateral.peakAmount,
    peakDebt: t.debt.peak,
    interestRate: t.metrics.interestRate,
    isBatched: t.batch.isMember,
    batch: {
      managerAddress: t.batch.manager,
      managerName: getBatchManagerByAddress(t.batch.manager)?.name ?? null,
      managementFee: t.batch.managementFee,
      deprecation: getBatchManagerDeprecation(t.batch.manager),
    },
    lastActivityAt: t.activity.lastActivityAt,
    // The trove's OWN transactions — redemptions are other BOLD holders'
    // actions against the trove, not the owner's, so they're excluded here
    // (V2's long-standing rule; the redemption count rides its own slot).
    txCount: t.activity.transactionCount - t.activity.redemptionCount,
    liquidationCount: 0,
    redemptionCount: t.activity.redemptionCount,
    owner: t.owner,
    lastOwner: t.lastOwner,
    ownerEns: t.ownerEns,
    nftUrl: getTroveNftUrl(t.collateralType, t.id),
    priceUsd: price,
    priceStale: false,
    pricePending: prices == null,
    collateralUsd,
    collateralRatioPct,
  };
}

/** Builds the detail page's live override from a TroveManager read at head.
 *  Null when the live read hasn't resolved — the card then shows the view's
 *  indexed figures instead. */
export function liveFromTroveState(
  t: TroveSummary,
  liveState: TroveStateData | undefined,
  prices?: OraclePricesData | null,
): LiquityTroveLive | null {
  if (!liveState) return null;
  const price = priceFor(t.collateralType, prices);
  const entireColl = liveState.collateral.entire;
  const entireDebt = liveState.debt.entire;
  const icrPct = price && entireDebt > 0 ? ((entireColl * price) / entireDebt) * 100 : null;

  return {
    entireColl,
    entireDebt,
    annualInterestRatePct: liveState.rates.annualInterestRate,
    entireCollRaw: liveState.collateral.entireRaw,
    entireDebtRaw: liveState.debt.entireRaw,
    annualInterestRateRaw: liveState.rates.annualInterestRateRaw,
    priceUsd: price ?? null,
    icrPct,
    status: t.isZombie ? "zombie" : "active",
  };
}
