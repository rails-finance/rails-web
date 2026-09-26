"use client";

// Alchemix redemption run — one row standing in for a streak of consecutive
// line-scope redemptions on a position's timeline.
//
// WHY NOT THE SHARED `RedemptionRunCard`. That card states two summed legs,
// "Cleared <collateral>" and "Reduced <debt>", both taken from each member's
// own per-Trove operation. An Alchemix redemption names no position and moves
// no collateral this timeline can attribute, so one of those legs has no figure
// here and the other means something the shared card cannot say: what a member
// cleared is a DIFFERENCE OF TWO DEBT READINGS, and a member whose readings are
// missing leaves the total short. Those two facts — a stated zero that must
// still draw, and a total that must say when it covers part of the run — are
// the card, so the vocabulary is its own and the mechanics stay shared
// (`TimelineRunCard`: folder register, date range, in-place expansion, dotted
// caution spine).
//
// THE TOTAL IS A SUM OF FLOWS, which is what makes it summable at all: each
// member's figure is debt cleared between two blocks. Nothing else on this
// protocol's timeline may be added across a run, and an earmarked figure never
// may — it is stateable at the block it was read at and nowhere else.

import type { ReactNode } from "react";

import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { CAUTION_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { fmtHeaderMagnitude } from "@/lib/shared/header-values";

export interface AlchemixRedemptionRunCardProps {
  count: number;
  /** Σ of the members' own cleared figures, over the members that have one. */
  totalCleared: number;
  /** How many of the `count` members carry a figure. Short of `count` means
   *  the total covers part of the run, and the header says so. */
  statedCount: number;
  /** The exact total, digits intact, for the receipt. */
  totalClearedExact: string;
  syntheticSymbol: string;
  prov: Provenance;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
  isFirst?: boolean;
  isLast?: boolean;
  /** The run's member cards, rendered when expanded. */
  children: ReactNode;
}

export function AlchemixRedemptionRunCard({
  count,
  totalCleared,
  statedCount,
  totalClearedExact,
  syntheticSymbol,
  prov,
  firstTimestamp,
  lastTimestamp,
  isFirst,
  isLast,
  children,
}: AlchemixRedemptionRunCardProps) {
  // The figure rides `extraHeader` rather than `aggregates` for one reason:
  // an aggregate pair is hidden at zero, and a run of stated zeros is a real
  // answer here — the position's debt came out the same at every one of them.
  // Drawing it as a bare count would put it in the unavailable case's clothes.
  // `fmtHeaderMagnitude` renders zero as the empty string — a sensible default
  // for a leg an event did not touch, and the wrong one here, where a run of
  // stated zeros is the answer and a blank would read as the unavailable case.
  const shown = totalCleared === 0 ? "0" : fmtHeaderMagnitude(totalCleared);

  const figure =
    statedCount > 0 ? (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className="text-caution-600 dark:text-caution-400">Cleared</span>
        <Prov value={totalClearedExact} symbol={syntheticSymbol} info={prov}>
          <span className="font-bold text-foreground">{shown}</span>
        </Prov>
        <TokenChipIcon symbol={syntheticSymbol} size={16} />
      </span>
    ) : null;

  const shortfall =
    statedCount < count ? (
      <span className="text-[11px] leading-relaxed text-rb-500">
        {statedCount > 0
          ? `part of the run — ${statedCount} of the ${count} could be read for this position`
          : `none of these ${count} could be read for this position`}
      </span>
    ) : null;

  return (
    <TimelineRunCard
      count={count}
      memberNoun="redemption"
      tone="caution"
      warningLabel="Redemptions"
      folder
      folderBadge={CAUTION_FOLDER_BADGE}
      extraHeader={
        figure || shortfall ? (
          <span className="inline-flex items-center gap-2 flex-wrap">
            {figure}
            {shortfall}
          </span>
        ) : undefined
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
