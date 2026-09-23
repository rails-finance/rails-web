"use client";

// Export control for the Maple position detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the Maple Markdown serializer, mirroring
// components/protocol/fx/fx-export-menu.tsx. The wrapper exists so the page can
// lazy-load the whole export path (dropdown UX + serializer + CSV builder) as
// one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import { maplePositionToMarkdown, type MaplePositionMarkdownArgs } from "@/lib/maple/position-to-markdown";

type Props = Omit<MaplePositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** The queued export, for a history too large to build in the browser
   *  (rails-ops decision 0029). */
  queued?: QueuedExportRequest;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way — they are
   *  seeded from the opening balance — but the per-event rows are the window,
   *  and the menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
};

export function MapleExportMenu({ csvFilename, scopeNote, fetchAllEvents, queued, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => maplePositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      queued={queued}
      csvFilename={csvFilename}
      scopeNote={scopeNote}
    />
  );
}
