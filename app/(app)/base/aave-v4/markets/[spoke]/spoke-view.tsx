"use client";

// An Aave V4 spoke's page. Focus (ui-jobs 557): the spoke is held behind its
// AimGate when none of its reserves is in focus, and its table keeps the
// reserves that are (components/shared/product/market-page.tsx).

import { AaveV4SpokePage } from "@/lib/aave-v4/product";
import { v4Deployment } from "@/lib/aave-v4/markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export function AaveV4SpokeView({ chain, slug }: { chain: string; slug: string }) {
  return (
    <>
      <AaveV4SpokePage d={v4Deployment(chain)} slug={slug} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
