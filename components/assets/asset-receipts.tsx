"use client";

// The receipts scope of a protocol's asset page (ui-jobs 818): its headline
// price, prices now and gaps register here, and the page mounts the
// inspector, so each figure's receipt opens.

import type { ReactNode } from "react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export function AssetReceipts({ children }: { children: ReactNode }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      {children}
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
