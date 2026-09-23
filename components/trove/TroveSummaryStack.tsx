"use client";

import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary, liveFromTroveState } from "@/lib/liquity/trove-card-view";
import { TroveDetailsBand } from "@/components/trove/TroveDetailsBand";
import { troveQueueShareProv } from "@/lib/liquity/trove-queue-provenance";
import { useTroveExplanationItems } from "@/components/trove/use-trove-explanation-items";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { PriceRunway } from "@/components/shared/price-runway";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import { troveLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { formatDate } from "@/lib/date";

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
  summaryExplanationOpen,
  onToggleSummaryExplanation,
  loadingStatus,
  viewHref,
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
  summaryExplanationOpen: boolean;
  onToggleSummaryExplanation: (isOpen: boolean) => void;
  loadingStatus: { message: string | null; snapshotDate?: number };
  /** Copy-this-view control, forwarded straight through to `LiquityPositionCard`
   *  — the trove page's `useTimelineEvents().viewHref`. Absent on the home
   *  hero's server-fed embed, which draws no timeline at all. */
  viewHref?: () => string;
}) {
  const { lead, items } = useTroveExplanationItems({
    trove,
    liveState,
    prices,
    debtInFront,
    trovesAhead,
    queueDebtTotal,
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

  const rowExtra =
    showBand || (showRunway && liqPrice && collPrice) ? (
      // The shared risk-footer strip: the heading-buttons anchor the left
      // edge, the figures the right, one row when the card is wide enough
      // and a right-aligned stacked column the moment it isn't (the strip's
      // own container-query rule — see risk-footer-strip.tsx).
      <RiskFooterStrip>
        {showBand && (
          <TroveDetailsBand
            trove={trove}
            liveState={liveState}
            debtInFront={debtInFront}
            trovesAhead={trovesAhead}
            debtInFrontLoading={debtInFrontLoading}
          />
        )}
        {showRedemptionRunway && (
          <RiskMeter>
            <RedemptionRunway
              debtInFront={debtInFront as number}
              queueDebtTotal={queueDebtTotal as number}
              shareProv={troveQueueShareProv(trove.collateralType)}
              markerTitle="This trove's place in the branch's redemption queue — everything left of the marker is redeemed first"
            />
          </RiskMeter>
        )}
        {showRunway && liqPrice && collPrice && (
          <RiskMeter>
            <PriceRunway compact currentPrice={collPrice} liqPrice={liqPrice} />
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
      explanationDefaultOpen={summaryExplanationOpen}
      onExplanationToggle={onToggleSummaryExplanation}
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
