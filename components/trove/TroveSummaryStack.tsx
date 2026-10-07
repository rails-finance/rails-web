"use client";

import type { ReactNode } from "react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary, liveFromTroveState } from "@/lib/liquity/trove-card-view";
import { TroveDetailsBand } from "@/components/trove/TroveDetailsBand";
import { troveQueueShareProv } from "@/lib/liquity/trove-queue-provenance";
import { useTroveExplanationItems } from "@/components/trove/use-trove-explanation-items";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { PriceRunway } from "@/components/shared/price-runway";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import { troveLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { formatDate } from "@/lib/date";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";

/**
 * V2's adapter onto the shared Liquity-family position card: builds the
 * card's view/live shapes from V2's own API types, keeps V2's rowExtra
 * cluster (costs band + redemption/price runway shorthand) and Explanation
 * content, and hands both to <LiquityPositionCard>. The card itself owns the
 * shell, status pill, identity row and stats grid — this stack is only V2's
 * adapter layer. The home hero renders the SAME stack (fed by a server-side
 * fetch), so there's one component and zero drift between the marketing
 * render and the product.
 */
export function TroveSummaryStack({
  trove,
  liveState,
  prices,
  debtInFront,
  trovesAhead,
  queueDebtTotal = null,
  debtInFrontLoading,
  disclosureKey,
  loadingStatus,
  viewHref,
  surplus,
  cardMenu,
}: {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  debtInFront: number | null;
  trovesAhead: number | null;
  /** The branch's entire debt — the redemption runway's denominator. Optional
   *  so server-fed embeds (the home hero) can omit it; the pane then renders
   *  its queue bullets without the branch-debt and queue-share figures. */
  queueDebtTotal?: number | null;
  debtInFrontLoading: boolean;
  /** The trove page's per-Trove key: the card's rows open on their own
   *  chevrons (ui-jobs 209, 295) and the strip below moves into their lines. The home hero
   *  omits it and keeps the strip on the heading row. */
  disclosureKey?: string;
  loadingStatus: { message: string | null; snapshotDate?: number };
  /** Copy-this-view control, forwarded straight through to `LiquityPositionCard`
   *  — the trove page's `useTimelineEvents().viewHref`. Absent on the home
   *  hero's server-fed embed, which draws no timeline at all. */
  viewHref?: () => string;
  /** A liquidated trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** The card's ⋮ menu (ui-jobs 270). With `disclosureKey` the card draws
   *  the header set; the home hero passes neither. */
  cardMenu?: ReactNode;
}) {
  // The close's debt before it ran, from the page's replayed events (the
  // last one is the close); the home hero has no provider and keeps null.
  const focusEvents = useFlowFocus()?.events;
  const closeSide = trove.status === "closed" ? focusEvents?.[focusEvents.length - 1]?.sides?.debt : undefined;
  const debtAtClose = closeSide
    ? closeSide.before > 0.005 || Math.abs(closeSide.amount) > 0.005
      ? closeSide.before
      : 0
    : null;
  const { lead, items } = useTroveExplanationItems({
    trove,
    liveState,
    prices,
    debtInFront,
    trovesAhead,
    queueDebtTotal,
    surplus,
    debtAtClose,
  });
  const showBand = trove.status === "open";

  const view = viewFromTroveSummary(trove, prices);
  const live = liveFromTroveState(trove, liveState, prices);

  // Liquidation/price runway — the current-state risk gauge, rendered in its
  // compact shorthand on the card's context line (the "% from liquidation"
  // figure + inline bar; the liquidation price itself lives in the headline
  // "Liquidates at" stat). Open troves only, needs a live oracle price.
  const collPrice =
    liveState && prices ? prices[trove.collateralType.toLowerCase() as keyof OraclePricesData] : undefined;
  // Entire-debt basis (recorded + accrued interest + redistribution) — the
  // basis Liquity V2's own ICR uses, shared with the headline caption and the
  // pane bullet via troveLiquidationPrice so all three surfaces agree.
  const entireDebt = liveState?.debt.entire ?? trove.debt.current;
  const collAmount = liveState?.collateral.entire ?? trove.collateral.amount;
  const liqPrice =
    showBand && collPrice
      ? troveLiquidationPrice({ debt: entireDebt, collateral: collAmount, collateralType: trove.collateralType })
      : null;
  const showRunway = showBand && !!collPrice && collPrice > 0 && !!liqPrice && liqPrice > 0;

  // Compact redemption mini-bar — the queue-axis sibling of the price runway.
  // Same live figures the Explanation pane's queue bullets state (debt in
  // front ÷ entire branch debt), traced by the same shared receipt.
  const showRedemptionRunway = showBand && debtInFront != null && queueDebtTotal != null && queueDebtTotal > 0;

  const queueRunway = showRedemptionRunway ? (
    <RedemptionRunway
      debtInFront={debtInFront as number}
      queueDebtTotal={queueDebtTotal as number}
      shareProv={troveQueueShareProv(trove.collateralType)}
      markerTitle="This trove's place in the branch's redemption queue — everything left of the marker is redeemed first"
    />
  ) : null;
  const bandProps = { trove, liveState, debtInFront, trovesAhead, debtInFrontLoading };

  // The opened layer (trove page): under Debt, the yearly cost and then the
  // redemption queue, since the rate sets the Trove's place in it; under
  // Collateral ratio, the price bar, whose "Liquidates at" line states the
  // price the bar measures to.
  const debtDetail =
    disclosureKey && showBand ? (
      <>
        <TroveDetailsBand {...bandProps} part="costs" alignStart />
        <div className="mt-1.5 max-w-72 space-y-1">
          {queueRunway}
          <TroveDetailsBand {...bandProps} part="queue" alignStart />
        </div>
      </>
    ) : undefined;
  const riskDetail =
    disclosureKey && showRunway && liqPrice && collPrice ? (
      <div className="mt-1.5 max-w-72 space-y-1">
        <PriceRunway compact barOnly currentPrice={collPrice} liqPrice={liqPrice} asset={trove.collateralType} />
      </div>
    ) : undefined;

  const rowExtra =
    !disclosureKey && (showBand || (showRunway && liqPrice && collPrice)) ? (
      // The shared risk-footer strip: the heading-buttons anchor the left
      // edge, the figures the right, one row when the card is wide enough
      // and a right-aligned stacked column the moment it isn't (the strip's
      // own container-query rule — see risk-footer-strip.tsx).
      <RiskFooterStrip>
        {showBand && <TroveDetailsBand {...bandProps} />}
        {queueRunway && <RiskMeter>{queueRunway}</RiskMeter>}
        {showRunway && liqPrice && collPrice && (
          <RiskMeter>
            <PriceRunway compact currentPrice={collPrice} liqPrice={liqPrice} asset={trove.collateralType} />
          </RiskMeter>
        )}
      </RiskFooterStrip>
    ) : undefined;

  return (
    <LiquityPositionCard
      protocol="liquity-v2"
      v={view}
      live={live}
      receipts
      showActivityMeta="counts"
      explanation={items.length > 0 || lead != null ? <ProseExplainer paragraph={lead} items={items} /> : undefined}
      rowExtra={rowExtra}
      viewHref={viewHref}
      surplus={surplus}
      disclosureKey={disclosureKey}
      headerSet={!!disclosureKey}
      cardMenu={cardMenu}
      debtDetail={debtDetail}
      riskDetail={riskDetail}
      footer={
        loadingStatus?.message ? (
          <div className="flex justify-end mt-3">
            <div className="text-xs text-rb-500 text-right">
              {loadingStatus.snapshotDate && <div>Snapshot from {formatDate(loadingStatus.snapshotDate)}.</div>}
              <div className="italic">{loadingStatus.message}</div>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
