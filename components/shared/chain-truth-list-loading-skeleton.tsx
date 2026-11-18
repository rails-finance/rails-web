"use client";

// Cold-load placeholder for the chain-state listing column, in the loading
// grammar (skeleton-card.tsx): a stack of framed row placeholders, each with
// the lozenge (C20) and the card's frame, matching the real column's flex/gap
// at chain-truth-listing.tsx and sized from the measured `listing-row` height
// (remembered per route by useSkeletonSizes). Inside each frame, bars where
// the heading line and the headline figures go. No filter row — the shell
// renders the real <ListToolbar> above this.

import { SkeletonBar, SkeletonBlock } from "@/components/shared/skeleton-card";
import { LozengeRow } from "@/components/shared/detail-body-skeleton";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

const ROWS = 4;

const ROW_BARS = (
  <div className="flex flex-col gap-5">
    <SkeletonBar width={120} wait={false} />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <SkeletonBar width={56} wait={false} />
          <SkeletonBar width={i < 2 ? "60%" : "35%"} figure wait={false} />
        </div>
      ))}
    </div>
  </div>
);

export function ChainTruthListLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: ROWS }, (_, i) => (
        <LozengeRow key={i}>
          <SkeletonBlock height={sizes["listing-row"]} bars={ROW_BARS} />
        </LozengeRow>
      ))}
    </div>
  );
}
