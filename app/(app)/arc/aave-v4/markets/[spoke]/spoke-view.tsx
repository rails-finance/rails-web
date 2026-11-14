"use client";

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
