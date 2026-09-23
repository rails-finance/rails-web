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

/** Runs shorter than this stay as individual cards — collapsing two or three
 *  rows would hide meaningful events behind a click for no density win. */
const MIN_REDEMPTION_RUN = 4;
/** Delegate rate adjusts are pure automation, so a shorter streak already
 *  reads as noise; a lone pair still stands as rows. */
const MIN_DELEGATE_ADJUST_RUN = 3;

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
          isFirst={folder.isFirst}
          isLast={folder.isLast}
        >
          {folder.children}
        </RedemptionRunCard>
      );
    }),
};

/** Consecutive batch-manager rate adjusts (setBatchManagerAnnualInterestRate)
 *  collapse the same way — pure delegate automation, no owner action. The
 *  header states the net movement (the chronologically first adjusted rate →
 *  the last) and, when every member names the same delegate (always true in
 *  practice — a manager change puts a join/leave row between the runs), the
 *  delegate's display name. */
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
      const managers = new Set(events.map((e) => (isLiquityEvent(e) ? e.context.data.batchManager : undefined)));
      const manager = managers.size === 1 ? [...managers][0] : undefined;
      return (
        <DelegateAdjustRunCard
          key={folder.key}
          count={events.length}
          fromRate={firstCtx?.stateAfter?.annualInterestRate}
          toRate={lastCtx?.stateAfter?.annualInterestRate}
          managerName={manager ? getBatchManagerName(manager) : undefined}
          firstTimestamp={events[0].timestamp}
          lastTimestamp={events[events.length - 1].timestamp}
          isFirst={folder.isFirst}
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
