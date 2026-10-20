"use client";

// One receipts scope around a holder page's Lifetime flows and timeline, which
// stream in as server slots: their <Prov>s register here and the inspector
// lists them in the order the page draws them.

import { Fragment, type ReactNode } from "react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";

export function HoldingReceiptsScope({ children }: { children: ReactNode }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      {/* Keyed: a streamed server slot is read as a list child. */}
      <Fragment key="history">{children}</Fragment>
    </ProvReceiptsScope>
  );
}
