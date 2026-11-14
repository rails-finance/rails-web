"use client";

// Aave V4 markets on Ethereum (/ethereum/aave-v4/markets): a panel per spoke
// (anatomy M4), from lib/aave-v4/product.tsx.

import { AaveV4Markets } from "@/lib/aave-v4/product";
import { V4_ETHEREUM } from "@/lib/aave-v4/markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export default function Page() {
  return (
    <>
      <AaveV4Markets d={V4_ETHEREUM} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
