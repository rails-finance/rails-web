"use client";

// Export control for the Morpho position detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the Morpho Markdown serializer, mirroring
// components/protocol/spark/spark-export-menu.tsx. The wrapper exists so the
// page can lazy-load the whole export path (dropdown UX + serializer + CSV
// builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import { morphoPositionToMarkdown, type MorphoPositionMarkdownArgs } from "@/lib/morpho/position-to-markdown";

type Props = Omit<MorphoPositionMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way — they are
   *  seeded from the opening balance — but the per-event rows are the window,
   *  and the menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
};

export function MorphoExportMenu({ csvFilename, scopeNote, fetchAllEvents, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => morphoPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      csvFilename={csvFilename}
      scopeNote={scopeNote}
    />
  );
}
