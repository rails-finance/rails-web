"use client";

// Export control for the PWN loan detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the PWN Markdown serializer, mirroring
// components/protocol/fluid/fluid-export-menu.tsx. The wrapper exists so the
// page can lazy-load the whole export path (dropdown UX + serializer + CSV
// builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import { pwnPositionToMarkdown, type PwnPositionMarkdownArgs } from "@/lib/pwn/position-to-markdown";

type Props = Omit<PwnPositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Set once this wallet's timeline is windowed and its opening balance has
   *  landed — see the checkpoint model in lib/shared/timeline-opening-balance.ts.
   *  Absent on the no-op path, which is every PWN wallet in the index today. */
  scopeNote?: string;
};

export function PwnExportMenu({ csvFilename, scopeNote, fetchAllEvents, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => pwnPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      csvFilename={csvFilename}
      ariaLabel="Export this loan"
      scopeNote={scopeNote}
    />
  );
}
