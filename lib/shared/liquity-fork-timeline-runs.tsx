// Timeline run specs shared by the Liquity V2 fork explorers (Ebisu,
// Asymmetry, Basedollar) — the ChainTruthTimeline `runs` seam, keyed by the
// fork's own event guard and debt symbol so the three trove pages carry one
// definition instead of three verbatim copies.
//
// The flat answer (`?folders=0`) collapses redemptions here. A batch manager's
// rate changes reach the fork timelines as rows since server mig 342 (one per
// member Trove, the Liquity V2 batch_manager rule); the index groups three or
// more back to back as the `batch_rate` folder, the V2 delegate-adjust run, and
// the register below draws it.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { RedemptionRunCard } from "@/components/shared/redemption-run-card";
import { renderRunFolders, EXTERNAL_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { forkDebtMove } from "@/lib/shared/liquity-fork-ops";
import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";
import { OWNER_RUN_KIND, ownerRunEntry } from "@/lib/shared/owner-run-folders";
import { Percent } from "lucide-react";

/** Runs shorter than this stay as individual cards (the V2 trove threshold). */
export const MIN_REDEMPTION_RUN = 4;

/** The slice of a fork event's context the run needs — identical across the
 *  three fork contexts (EbisuContext / AsymmetryContext / BasedollarContext). */
interface ForkRunContext {
  eventType: string;
  collDelta: string;
  debtDelta: string;
  collateralSymbol: string;
  operation?: { debtFromOperation: string };
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
          // Collateral is after − before over the emitted absolutes; debt is
          // what each redemption cancelled (TroveOperation), which leaves out
          // the interest accrued between touches. The folder sums magnitudes. A trove page is one
          // branch, so the collateral symbol is constant across the run.
          let totalColl = 0;
          let totalDebt = 0;
          let collSym = "";
          for (const e of events) {
            if (!is(e)) continue;
            totalColl += Math.abs(Number(e.context.data.collDelta) || 0);
            totalDebt += Math.abs(forkDebtMove(e.context.data).value);
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

// ── Folders the INDEX served ────────────────────────────────────────────────
//
// The three fork trove pages read their history as ROWS (decision 0019's
// evening amendment): rails-server transcribes the spec above as the
// `redemption` kind and adds the owner run (decision 0021, 2026-09-24) as
// `owner_run`, in `api/src/services/liquity-fork-timeline-folders.ts`. This
// register is how those two kinds draw; the spec above stays for the flat
// answer (`?folders=0`).

/** The redemption card's register (`RedemptionRunCard`), for a served folder. */
const REDEMPTION_FOLDER: FolderRegisterEntry = {
  memberNoun: "redemption",
  tone: "external",
  warningLabel: "Redemptions",
  folderBadge: EXTERNAL_FOLDER_BADGE,
};

/** One member of an owner run, by the action it repeats. */
const OWNER_RUN_NOUN: Record<string, string> = {
  adjustTrove: "adjustment",
  adjustTrove_noChange: "unchanged adjustment",
  adjustTroveInterestRate: "rate change",
};

/** A batch manager's rate or fee changes (server mig 342), the V2 delegate
 *  run's register: the pink percent mark its folder wears. Its one leg is the
 *  premature-adjustment fees the Trove carried. */
const BATCH_RATE_FOLDER: FolderRegisterEntry = {
  memberNoun: "batch rate change",
  tone: "neutral",
  folderBadge: <Percent size={10} strokeWidth={2.5} className="text-pink-500" />,
};

export const LIQUITY_FORK_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry =>
  folder.kind === OWNER_RUN_KIND
    ? ownerRunEntry(folder, (a) => OWNER_RUN_NOUN[a] ?? "event")
    : folder.kind === "batch_rate"
      ? BATCH_RATE_FOLDER
      : REDEMPTION_FOLDER;
