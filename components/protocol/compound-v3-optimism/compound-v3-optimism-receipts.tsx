"use client";

// A receipts scope for a server-rendered Compound V3 Optimism page's figures (the
// wallet's Comet rows), so the inspector has a row for each.

import type { ReactNode } from "react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";

export function CompoundV3OptimismReceipts({ scopeId, children }: { scopeId: string; children: ReactNode }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry} scopeId={scopeId}>
      {children}
    </ProvReceiptsScope>
  );
}
