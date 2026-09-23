"use client";

import { useMemo } from "react";
import { QueuedExportPanel } from "@/components/shared/queued-export-panel";

export function ExportReceiptView({ id, token }: { id: string; token: string }) {
  const receipt = useMemo(() => ({ id, token, fileName: "", requestedAt: "" }), [id, token]);
  return <QueuedExportPanel receipt={receipt} headingId="export-receipt-title" />;
}
