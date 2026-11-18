"use client";

// Instant skeleton while the force-dynamic markets page runs its live chain
// read on the server. It sits INSIDE the (views) group on purpose: a nested
// loading.tsx is the nearer Suspense boundary for /markets and wins over the
// group's ListingRouteLoading (toolbar + card grid, the wrong shape for a
// two-card page); the [market]/[id] detail route stays outside the group and
// keeps its 404 semantics (components/shared/listing-route-loading.tsx says
// why). Two framed placeholders — the page header and the data region — sized from
// the measured defaults and this route's remembered heights (see
// components/shared/skeleton-card.tsx for the loading grammar).

import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

export default function Loading() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="min-h-screen">
      <div className="py-8" aria-busy="true">
        <SkeletonBlock height={sizes["page-header"]} className="mb-6" />
        <SkeletonBlock height={sizes["page-table"]} />
      </div>
    </div>
  );
}
