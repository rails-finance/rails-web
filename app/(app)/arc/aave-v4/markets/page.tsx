"use client";

// Aave V4 markets on Arc (/arc/aave-v4/markets): a panel per spoke (anatomy
// M4), from lib/aave-v4/product.tsx, read at the head when the page opens.

import { AaveV4Markets } from "@/lib/aave-v4/product";
import { V4_ARC } from "@/lib/aave-v4/markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export default function Page() {
  return (
    <>
      <AaveV4Markets d={V4_ARC} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
