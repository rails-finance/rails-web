// Timeline run specs shared by the Liquity V2 fork explorers (Ebisu,
// Asymmetry, Basedollar) — the ChainTruthTimeline `runs` seam, keyed by the
// fork's own event guard and debt symbol so the three trove pages carry one
// definition instead of three verbatim copies.
//
// Only the redemption run exists here. The V2 trove page also collapses
// delegate rate adjusts (setBatchManagerAnnualInterestRate), but the fork
// lanes carry no such row: a batched Trove's rate moves on its BATCH, and the
// fork event MVs record per-Trove operations only — adjustTroveInterestRate and
// removeFromBatch are never batched (see liquity-fork-event-header.tsx). There
// is nothing to collapse until a fork lane captures BatchUpdated per Trove.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { RedemptionRunCard } from "@/components/shared/redemption-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";

/** Runs shorter than this stay as individual cards (the V2 trove threshold). */
export const MIN_REDEMPTION_RUN = 4;

/** The slice of a fork event's context the run needs — identical across the
 *  three fork contexts (EbisuContext / AsymmetryContext / BasedollarContext). */
interface ForkRunContext {
  eventType: string;
  collDelta: string;
  debtDelta: string;
  collateralSymbol: string;
}

type ForkRunEvent = BaseActivityEvent & { context: { data: ForkRunContext } };

/** Consecutive redemption touches collapse into one expandable run row — the
 *  V2 trove treatment. A heavily redeemed fork trove sitting low in its
 *  branch's redemption queue collects redemptions back to back (one showed
 *  328); owner actions and liquidations always stand as their own rows.
 *  Call at module scope so the timeline's row memo keeps a stable id. */
export function liquityForkTimelineRuns<E extends ForkRunEvent>(opts: {
  is: (e: BaseActivityEvent) => e is E;
  debtSymbol: string;
}): TimelineRunSpec[] {
  const { is, debtSymbol } = opts;
  return [
    {
      match: (e) => is(e) && e.context.data.eventType === "redeemCollateral",
      min: MIN_REDEMPTION_RUN,
      render: (run, meta) =>
        renderRunFolders(run, meta, MIN_REDEMPTION_RUN, (events, folder) => {
          // Each member's delta is after − before over the emitted absolutes;
          // the folder carries the summed magnitudes. A trove page is one
          // branch, so the collateral symbol is constant across the run.
          let totalColl = 0;
          let totalDebt = 0;
          let collSym = "";
          for (const e of events) {
            if (!is(e)) continue;
            totalColl += Math.abs(Number(e.context.data.collDelta) || 0);
            totalDebt += Math.abs(Number(e.context.data.debtDelta) || 0);
            collSym = e.context.data.collateralSymbol;
          }
          return (
            <RedemptionRunCard
              key={folder.key}
              count={events.length}
              totalColl={totalColl}
              totalDebt={totalDebt}
              collateralSymbol={collSym}
              debtSymbol={debtSymbol}
              firstTimestamp={events[0].timestamp}
              lastTimestamp={events[events.length - 1].timestamp}
              isFirst={folder.isFirst}
              isLast={folder.isLast}
            >
              {folder.children}
            </RedemptionRunCard>
          );
        }),
    },
  ];
}
