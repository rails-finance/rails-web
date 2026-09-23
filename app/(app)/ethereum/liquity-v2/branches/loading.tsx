"use client";

// Instant skeleton while the force-dynamic branches page runs its live chain
// read on the server. Without this boundary the click into /liquity-v2/branches
// has nothing to paint until the round trip lands — the stall/503 shape the
// aave-v4 hubs route hit. Two solid blocks — the page header and the data
// region — sized from the measured defaults and this route's remembered
// heights (see components/shared/skeleton-card.tsx for the block grammar).

import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

export default function Loading() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="min-h-screen">
      <div className="animate-pulse py-8">
        <SkeletonBlock height={sizes["page-header"]} className="mb-6 rounded-md" />
        <SkeletonBlock height={sizes["page-table"]} />
      </div>
    </div>
  );
}
