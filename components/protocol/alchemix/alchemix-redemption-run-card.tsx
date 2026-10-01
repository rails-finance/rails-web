"use client";

// Alchemix redemption run — one row standing in for a streak of consecutive
// line-scope redemptions on a position's timeline.
//
// WHY NOT THE SHARED `RedemptionRunCard`. That card states two summed legs,
// both taken from each member's own per-Trove operation. An Alchemix redemption
// names no position, so both legs here mean something the shared card cannot
// say: what a member cleared and took is a DIFFERENCE OF TWO READINGS, and a
// member whose readings are missing leaves the total short. Those two facts — a stated zero that must
// still draw, and a total that must say when it covers part of the run — are
// the card, so the vocabulary is its own and the mechanics stay shared
// (`TimelineRunCard`: folder register, date range, in-place expansion, dotted
// caution spine, color-grammar.md §5).
//
// THE TOTAL IS A SUM OF FLOWS, which is what makes it summable at all: each
// member's figure is debt cleared between two blocks. Nothing else on this
// protocol's timeline may be added across a run, and an earmarked figure never
// may — it is stateable at the block it was read at and nowhere else.

import { formatExact } from "@/lib/utils/format";
import { ExactTip } from "@/components/shared/amount-text";
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
  /** The vault share ticker the collateral is counted in. */
  mytSymbol: string;
  /** What the run took from this position's collateral, summed the same way.
   *  Null where not every member with a debt figure has one. */
  taken: { value: number; exact: string; prov: Provenance } | null;
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
  mytSymbol,
  taken,
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
  // `fmtHeaderMagnitude` now states a genuine zero as "0" (rails-ops
  // TO-DO-ui-jobs item 74), so this reads a run of stated zeros correctly
  // without a local zero check.
  const shown = (
    <ExactTip
      text={fmtHeaderMagnitude(totalCleared, syntheticSymbol)}
      exact={formatExact(totalCleared)}
      symbol={syntheticSymbol}
    />
  );

  const figure =
    statedCount > 0 ? (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className="text-caution-600 dark:text-caution-400">Cleared</span>
        <Prov value={totalClearedExact} symbol={syntheticSymbol} info={prov}>
          <span className="font-bold text-foreground">{shown}</span>
        </Prov>
        <TokenChipIcon symbol={syntheticSymbol} size={16} />
        {taken && taken.value > 0 ? (
          <>
            <span className="ml-1 text-caution-600 dark:text-caution-400">Took</span>
            <Prov value={taken.exact} symbol={mytSymbol} info={taken.prov}>
              <span className="font-bold text-foreground">
                <ExactTip
                  text={fmtHeaderMagnitude(taken.value, mytSymbol)}
                  exact={formatExact(taken.value)}
                  symbol={mytSymbol}
                />
              </span>
            </Prov>
            <TokenChipIcon symbol={mytSymbol} size={16} />
          </>
        ) : null}
      </span>
    ) : null;

  const shortfall =
    statedCount < count ? (
      <span className="text-[11px] leading-relaxed text-rb-500">
        {statedCount > 0
          ? `part of the run: ${statedCount} of the ${count} could be read for this position`
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
