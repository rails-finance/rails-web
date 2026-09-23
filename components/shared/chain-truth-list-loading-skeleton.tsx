"use client";

// Cold-load placeholder for the chain-state listing column: a stack of solid
// row-height blocks (no inner card anatomy — see skeleton-card.tsx), matching
// the real column's flex/gap at chain-truth-listing.tsx and sized from the
// measured `listing-row` height (remembered per route by useSkeletonSizes).
// Depth is conveyed by decaying opacity down the stack. No filter row — the
// shell renders the real <ListToolbar> above this.

import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

const DECAY = [1, 0.7, 0.45, 0.25];

export function ChainTruthListLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="flex animate-pulse flex-col gap-3">
      {DECAY.map((opacity, i) => (
        <div key={i} style={{ opacity }}>
          <SkeletonBlock height={sizes["listing-row"]} />
        </div>
      ))}
    </div>
  );
}
