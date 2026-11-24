"use client";

// Cold-load placeholder for the chain-state listing column, in the loading
// grammar (skeleton-card.tsx): a stack of framed row placeholders, each with
// the lozenge (C20) and the card's frame, matching the real column's flex/gap
// at chain-truth-listing.tsx and sized from the measured `listing-row` height
// (remembered per route by useSkeletonSizes). Inside each frame the bars stand
// on the listing card's lines (position-card.tsx): the heading line (status
// tag, name, address; below md the address takes a second line and the chain
// glyph a third), then two headlines on the open grid's columns, each a label,
// a figure and its USD line, and the counters at the bottom right. Offsets
// measured on settled Compound V3, Aave V3 and Liquity V2 listings, 24 Nov
// 2026, at 1440 and 390. No filter row: the shell above draws that.

import { SkeletonBar, SkeletonBlock } from "@/components/shared/skeleton-card";
import { LozengeRow } from "@/components/shared/detail-body-skeleton";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

const ROWS = 4;

/** One headline: the label (16px line), the figure (32px below sm, 36px
 *  from sm) and its USD line, as PositionCardRow draws them. */
const HEAD = (
  <div className="flex flex-col">
    <SkeletonBar width={56} height={16} wait={false} />
    <SkeletonBar width="40%" figure height={36} wait={false} className="mt-2 max-sm:!h-8" />
    <SkeletonBar width="28%" height={16} wait={false} className="mt-0.5" />
  </div>
);

const ROW_BARS = (
  <div className="relative h-full">
    <div className="flex flex-col gap-1.5 max-md:h-[66px]">
      <div className="flex h-5 items-center gap-2">
        <SkeletonBar width={51} wait={false} />
        <SkeletonBar width={56} wait={false} />
        <SkeletonBar width={80} height={20} wait={false} className="max-md:hidden" />
      </div>
      <SkeletonBar width={80} height={16} wait={false} className="md:hidden" />
    </div>
    {/* The open grid's columns (OPEN_GRID): two cells of four from lg. */}
    <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {HEAD}
      {HEAD}
    </div>
    <div className="absolute bottom-0 right-0 flex h-4 items-center gap-2">
      <SkeletonBar width={52} wait={false} />
      <SkeletonBar width={20} wait={false} />
    </div>
  </div>
);

export function ChainTruthListLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: ROWS }, (_, i) => (
        <LozengeRow key={i}>
          {/* The real body carries a 1px transparent border inside its frame. */}
          <SkeletonBlock height={sizes["listing-row"]} bars={ROW_BARS} className="border border-transparent" />
        </LozengeRow>
      ))}
    </div>
  );
}
