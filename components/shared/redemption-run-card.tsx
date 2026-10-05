"use client";

import type { ReactNode } from "react";

import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { CAUTION_FOLDER_BADGE } from "@/lib/shared/run-folders";

/**
 * Redemption run card — one row standing in for a stretch of consecutive
 * redemption touches. The mechanics (summed header pairs with their Σ receipt,
 * date range, in-place expansion to the member cards, dotted caution spine)
 * live in the shared `TimelineRunCard`; this is the redemption vocabulary for
 * it: caution tone (color-grammar.md §5), "REDEMPTIONS" pill, "redemption" as the member noun the
 * Σ receipt and the aria label pluralise, and the two pairs a redemption
 * moves. Liquity V2 names them debt first, "Cleared" BOLD then "Took" the
 * collateral (`debtFirst`); Liquity V1 and the forks keep collateral
 * "Cleared", debt "Reduced", as their event headers do. Every redemption run draws in the
 * folder register
 * (TimelineRunCard's `folder`) — one folder per chronological chunk of the
 * run, sliced by the caller via `renderRunFolders`.
 *
 * Shared: Liquity V2 (the origin grammar, hand-wired in the trove page) and
 * Liquity V1 / the forks (via ChainTruthTimeline's `runs` seam) render the same
 * card — V1 redemptions deliberately borrow the V2 grammar, so the run row does
 * too.
 */
export interface RedemptionRunCardProps {
  count: number;
  /** Σ |per-event collateral delta| across the run — collateral sent to redeemers. */
  totalColl: number;
  /** Σ |debtChangeFromOperation| across the run — debt cleared. */
  totalDebt: number;
  collateralSymbol: string;
  debtSymbol: string;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
  isFirst?: boolean;
  isLast?: boolean;
  /** The run's member cards, rendered when expanded. */
  children: ReactNode;
  /** Liquity V2's wording: "Cleared" the debt, then "Took" the collateral. */
  debtFirst?: boolean;
}

export function RedemptionRunCard({
  count,
  totalColl,
  totalDebt,
  collateralSymbol,
  debtSymbol,
  firstTimestamp,
  lastTimestamp,
  isFirst,
  isLast,
  children,
  debtFirst,
}: RedemptionRunCardProps) {
  return (
    <TimelineRunCard
      count={count}
      memberNoun="redemption"
      tone="caution"
      warningLabel="Redemptions"
      folder
      folderBadge={CAUTION_FOLDER_BADGE}
      aggregates={
        debtFirst
          ? [
              { verb: "Cleared", value: totalDebt, symbol: debtSymbol, provWhat: "Debt cleared" },
              { verb: "Took", value: totalColl, symbol: collateralSymbol, provWhat: "Collateral sent to redeemers" },
            ]
          : [
              { verb: "Cleared", value: totalColl, symbol: collateralSymbol, provWhat: "Collateral sent to redeemers" },
              { verb: "Reduced", value: totalDebt, symbol: debtSymbol, provWhat: "Debt cleared" },
            ]
      }
      firstTimestamp={firstTimestamp}
      lastTimestamp={lastTimestamp}
      isFirst={isFirst}
      isLast={isLast}
    >
      {children}
    </TimelineRunCard>
  );
}
