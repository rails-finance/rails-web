"use client";

import type { ReactNode } from "react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary, liveFromTroveState, priceFor } from "@/lib/liquity/trove-card-view";
import { TroveDetailsBand } from "@/components/trove/TroveDetailsBand";
import type { PositionCardExports, PositionPanelColumns, PositionPanelRow } from "@/components/shared/position-card";
import { useTroveExplanationItems } from "@/components/trove/use-trove-explanation-items";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
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
  redeemedFirst = null,
  debtInFrontLoading,
  priceFailed = false,
  loadingStatus,
  surplus,
  exports,
  shutdown,
  branchNotice,
  still = false,
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
  /** A dormant Trove is the branch's lastZombieTroveId (the next redemption takes it first);
   *  null where the pointer is unread. */
  redeemedFirst?: boolean | null;
  debtInFrontLoading: boolean;
  /** The price read has ended without a price: the card says so in the
   *  slots that need it. */
  priceFailed?: boolean;
  loadingStatus: { message: string | null; snapshotDate?: number };
  /** A liquidated trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** The card ⋮'s export shapes (TO-DO-position-card 270). The home hero
   *  passes none and draws no ⋮. */
  exports?: PositionCardExports | null;
  /** The branch's shutdown (ui-jobs 612); absent on the home hero. */
  shutdown?: BranchShutdownState | null;
  /** The branch's Safety Mode notice (ui-jobs 747); absent on the home hero. */
  branchNotice?: ReactNode;
  /** The home page's picture of the page (TroveBody's `still`). */
  still?: boolean;
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
    redeemedFirst,
    surplus,
    debtAtClose,
    shutdown,
  });

  // Unavailable once the read has ended, or once a response has come back
  // without this branch's feed; pending only while no response has come.
  const priceMissing = priceFor(trove.collateralType, prices) == null;
  const priceUnavailable = priceMissing && (priceFailed || prices != null);
  const view = {
    ...viewFromTroveSummary(trove, prices),
    pricePending: priceMissing && !priceUnavailable,
    priceUnavailable,
  };
  const live = liveFromTroveState(trove, liveState, prices);

  // The panel (TO-DO-position-card 322): the queue on the left, the yearly
  // cost on the right, where the card adds Liquidates at.
  const bandProps = { trove, liveState, debtInFront, trovesAhead, debtInFrontLoading };
  // A dormant Trove sits outside the branch's rate-sorted list. The next redemption takes it first
  // when it is the branch's lastZombieTroveId; no redemption reaches any other.
  const zombieDebt = liveState?.debt.entire ?? trove.debt.current;
  const queueRows: PositionPanelRow[] = trove.isZombie
    ? [
        {
          id: "redemption",
          label: "Redemption",
          value:
            redeemedFirst === true
              ? "Redeemed first"
              : redeemedFirst === false || zombieDebt <= 0
                ? "Not redeemable"
                : "Outside the rate queue",
        },
      ]
    : [
        {
          id: "debt-in-front",
          label: "Debt in front",
          value: <TroveDetailsBand {...bandProps} part="queue" bare />,
          pending: debtInFrontLoading,
        },
        // Held from first paint: a bar while the queue is read, so the
        // columns after it never move (the loading grammar). The home
        // picture leaves out a count it has not read.
        ...(still && trovesAhead == null
          ? []
          : [
              {
                id: "troves-in-front",
                label: "Troves in front",
                value: <TroveDetailsBand {...bandProps} part="ahead" bare />,
                pending: debtInFrontLoading,
              },
            ]),
      ];
  const panel: PositionPanelColumns | undefined =
    trove.status === "open"
      ? [
          queueRows,
          [{ id: "costs", label: "Costs per year", value: <TroveDetailsBand {...bandProps} part="costs" bare /> }],
        ]
      : undefined;

  // The snapshot and loading status, on one line in the card's (i) row, which
  // stands whether or not it does: the card keeps its height as it goes.
  const status: ReactNode = loadingStatus?.message ? (
    <>
      {loadingStatus.snapshotDate && <>Snapshot from {formatDate(loadingStatus.snapshotDate)}. </>}
      <span className="italic">{loadingStatus.message}</span>
    </>
  ) : undefined;

  return (
    <LiquityPositionCard
      protocol="liquity-v2"
      surface="detail"
      v={view}
      live={live}
      explanation={items.length > 0 || lead != null ? <ProseExplainer paragraph={lead} items={items} /> : undefined}
      surplus={surplus}
      panel={panel}
      exports={exports}
      status={status}
      shutdown={shutdown}
      branchNotice={branchNotice}
    />
  );
}
