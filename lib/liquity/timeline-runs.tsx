// Timeline run specs for the Liquity V2 trove page's ChainTruthTimeline — the
// two collapsible run kinds the V2 trove page used to hand-roll: redemption
// touches and delegate rate adjusts. Mirrors lib/shared/liquity-fork-timeline-runs.tsx's
// shape (the fork lanes' shared redemption-only spec); V2 carries a second run
// kind the forks don't, because only V2 captures BatchUpdated per Trove — a
// batched fork Trove's rate moves on its BATCH, and the fork event MVs record
// per-Trove operations only (see liquity-fork-timeline-runs.tsx's own header).

import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { RedemptionRunCard } from "@/components/shared/redemption-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { DelegateAdjustRunCard } from "@/components/protocol/liquity/delegate-adjust-run-card";
import { getBatchManagerName } from "@/lib/liquity/batch-managers";
import { MIN_DELEGATE_ADJUST_RUN, MIN_REDEMPTION_RUN } from "@/lib/liquity/timeline-run-kinds";

/** Consecutive redemption touches collapse into one expandable run row — a
 *  heavily redeemed Trove sitting low in its collateral branch's redemption
 *  queue collects them back to back (100+ in one sitting is common). Per-Trove
 *  deltas come from troveOperation (redemption.* is whole-redemption-wide,
 *  spanning other Troves — same source preference as the explainer's
 *  redemption math). */
const REDEMPTION_RUN: TimelineRunSpec = {
  match: (e) => isLiquityEvent(e) && e.context.data.operation === "redeemCollateral",
  min: MIN_REDEMPTION_RUN,
  render: (run, meta) =>
    renderRunFolders(run, meta, MIN_REDEMPTION_RUN, (events, folder) => {
      let totalColl = 0;
      let totalDebt = 0;
      for (const e of events) {
        if (!isLiquityEvent(e)) continue;
        const op = e.context.data.troveOperation;
        totalColl += Math.abs(op?.collChangeFromOperation ?? 0);
        totalDebt += Math.abs(op?.debtChangeFromOperation ?? 0);
      }
      const first = isLiquityEvent(events[0]) ? events[0].context.data : undefined;
      // The debt across the run, in time order: before the earliest, after the
      // latest.
      const chrono = [...events].sort((a, b) => a.timestamp - b.timestamp);
      const early = chrono[0];
      const late = chrono[chrono.length - 1];
      const debtSpan: [number, number] | undefined =
        isLiquityEvent(early) && isLiquityEvent(late) && early.context.data.stateBefore && late.context.data.stateAfter
          ? [early.context.data.stateBefore.debt, late.context.data.stateAfter.debt]
          : undefined;
      return (
        <RedemptionRunCard
          key={folder.key}
          count={events.length}
          totalColl={totalColl}
          totalDebt={totalDebt}
          collateralSymbol={first?.collateralType ?? ""}
          debtSymbol={first?.assetType ?? "BOLD"}
          firstTimestamp={events[0].timestamp}
          lastTimestamp={events[events.length - 1].timestamp}
          isLast={folder.isLast}
          debtSpan={debtSpan}
        >
          {folder.children}
        </RedemptionRunCard>
      );
    }),
};

/** Consecutive batch-manager rate adjusts (setBatchManagerAnnualInterestRate)
 *  collapse the same way — pure delegate automation, no owner action. The
 *  spine's flank states the rate after the last change, its arrow the way
 *  the members moved it; the spoken label names the delegate when every
 *  member names the same one (always true in practice — a manager change
 *  puts a join/leave row between the runs). */
const DELEGATE_ADJUST_RUN: TimelineRunSpec = {
  match: (e) => isLiquityEvent(e) && e.context.data.operation === "setBatchManagerAnnualInterestRate",
  min: MIN_DELEGATE_ADJUST_RUN,
  render: (run, meta) =>
    renderRunFolders(run, meta, MIN_DELEGATE_ADJUST_RUN, (events, folder) => {
      // Net rate movement is chronological (first adjusted rate → last)
      // whichever way the timeline is sorted — per folder, so a chunked run's
      // folders each state their own slice's movement.
      const chrono = events[0].timestamp <= events[events.length - 1].timestamp ? events : [...events].reverse();
      const chronoFirst = chrono[0];
      const chronoLast = chrono[chrono.length - 1];
      const firstCtx = isLiquityEvent(chronoFirst) ? chronoFirst.context.data : undefined;
      const lastCtx = isLiquityEvent(chronoLast) ? chronoLast.context.data : undefined;
      // Which way the members moved the rate: each change, before → after.
      let up = false;
      let down = false;
      for (const e of events) {
        if (!isLiquityEvent(e)) continue;
        const { stateBefore, stateAfter } = e.context.data;
        if (!stateBefore || !stateAfter || stateBefore.annualInterestRate <= 0) continue;
        const delta = stateAfter.annualInterestRate - stateBefore.annualInterestRate;
        if (Math.abs(delta).toFixed(2) === "0.00") continue;
        if (delta > 0) up = true;
        else down = true;
      }
      // Every change one way points that way; changes both ways, or none
      // that moved the rate, take the neutral double-headed arrow.
      const moves = up && !down ? "up" : down && !up ? "down" : "both";
      const managers = new Set(events.map((e) => (isLiquityEvent(e) ? e.context.data.batchManager : undefined)));
      const manager = managers.size === 1 ? [...managers][0] : undefined;
      return (
        <DelegateAdjustRunCard
          key={folder.key}
          count={events.length}
          fromRate={firstCtx?.stateAfter?.annualInterestRate}
          toRate={lastCtx?.stateAfter?.annualInterestRate}
          moves={moves}
          managerName={manager ? getBatchManagerName(manager) : undefined}
          firstTimestamp={events[0].timestamp}
          lastTimestamp={events[events.length - 1].timestamp}
          isLast={folder.isLast}
        >
          {folder.children}
        </DelegateAdjustRunCard>
      );
    }),
};

/** The collapsible run kinds, in match order — only passive/automated events
 *  collapse; owner actions always stand as their own rows. Module-scope array
 *  so the timeline's row memo keeps a stable id. */
export const LIQUITY_TIMELINE_RUNS: TimelineRunSpec[] = [REDEMPTION_RUN, DELEGATE_ADJUST_RUN];
