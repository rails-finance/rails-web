"use client";

import type { ReactNode } from "react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary, liveFromTroveState } from "@/lib/liquity/trove-card-view";
import { TroveDetailsBand } from "@/components/trove/TroveDetailsBand";
import type { PositionCardExports, PositionPanelColumns } from "@/components/shared/position-card";
import { useTroveExplanationItems } from "@/components/trove/use-trove-explanation-items";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";

/**
 * V2's adapter onto the shared Liquity-family position card: builds the
 * card's view/live shapes from V2's API types, the panel's rows and the
 * Explanation content, and hands them to <LiquityPositionCard>, which builds
 * the shared card's slots. The home hero renders the SAME stack (fed by a
 * server-side fetch), so there's one component and zero drift between the
 * marketing render and the product.
 */
export function TroveSummaryStack({
  trove,
  liveState,
  prices,
  debtInFront,
  trovesAhead,
  queueDebtTotal = null,
  debtInFrontLoading,
  loadingStatus,
  viewHref,
  surplus,
  exports,
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
  loadingStatus: { message: string | null; snapshotDate?: number };
  /** Copy-this-view control, forwarded straight through to `LiquityPositionCard`
   *  — the trove page's `useTimelineEvents().viewHref`. Absent on the home
   *  hero's server-fed embed, which draws no timeline at all. */
  viewHref?: () => string;
  /** A liquidated trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** The card ⋮'s export shapes (TO-DO-position-card 270). The home hero
   *  passes none and draws no ⋮. */
  exports?: PositionCardExports | null;
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

  const view = viewFromTroveSummary(trove, prices);
  const live = liveFromTroveState(trove, liveState, prices);

  // The panel (TO-DO-position-card 322): the queue on the left, the yearly
  // cost on the right, where the card adds Liquidates at.
  const bandProps = { trove, liveState, debtInFront, trovesAhead, debtInFrontLoading };
  const panel: PositionPanelColumns | undefined =
    trove.status === "open"
      ? [
          [
            {
              id: "debt-in-front",
              label: "Debt in front",
              value: <TroveDetailsBand {...bandProps} part="queue" bare />,
            },
            ...(trovesAhead != null
              ? [
                  {
                    id: "troves-in-front",
                    label: "Troves in front",
                    value: <TroveDetailsBand {...bandProps} part="ahead" bare />,
                  },
                ]
              : []),
          ],
          [{ id: "costs", label: "Costs per year", value: <TroveDetailsBand {...bandProps} part="costs" bare /> }],
        ]
      : undefined;

  const foot: ReactNode = loadingStatus?.message ? (
    <div className="flex justify-end mt-3">
      <div className="text-xs text-rb-500 text-right">
        {loadingStatus.snapshotDate && <div>Snapshot from {formatDate(loadingStatus.snapshotDate)}.</div>}
        <div className="italic">{loadingStatus.message}</div>
      </div>
    </div>
  ) : undefined;

  return (
    <LiquityPositionCard
      protocol="liquity-v2"
      surface="detail"
      v={view}
      live={live}
      explanation={items.length > 0 || lead != null ? <ProseExplainer paragraph={lead} items={items} /> : undefined}
      viewHref={viewHref}
      surplus={surplus}
      panel={panel}
      exports={exports}
      foot={foot}
    />
  );
}
