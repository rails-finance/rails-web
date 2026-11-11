"use client";

// A receipts scope for a server-rendered Arc page's figures (a wallet's
// position rows), so the inspector has a row for each.

import type { ReactNode } from "react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";

export function MorphoAtBlockReceipts({ scopeId, children }: { scopeId: string; children: ReactNode }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry} scopeId={scopeId}>
      {children}
    </ProvReceiptsScope>
  );
}
