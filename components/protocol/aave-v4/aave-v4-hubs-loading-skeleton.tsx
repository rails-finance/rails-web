"use client";

// Loading placeholder for /aave-v4/hubs. The header (breadcrumb, title, intro)
// is rendered live by the page, so this stands in for the data region below it
// only — one solid block (see components/shared/skeleton-card.tsx for the
// block grammar), sized from the measured `page-table` default and this
// route's remembered height.

import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

export function AaveV4HubsLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="animate-pulse">
      <SkeletonBlock height={sizes["page-table"]} />
    </div>
  );
}
