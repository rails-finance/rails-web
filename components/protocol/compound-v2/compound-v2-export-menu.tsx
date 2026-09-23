"use client";

// Export control for the Compound V2 position detail page — a thin wrapper
// over the shared <ExportMenu> that supplies the Compound V2 Markdown
// serializer, mirroring components/protocol/moonwell/moonwell-export-menu.tsx.
// The wrapper exists so the page can lazy-load the whole export path (dropdown
// UX + serializer + CSV builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import {
  compoundV2PositionToMarkdown,
  type CompoundV2PositionMarkdownArgs,
} from "@/lib/compound-v2/position-to-markdown";

type Props = Omit<CompoundV2PositionMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Loads the wallet's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** The queued export, for a history too large to build in the browser
   *  (rails-ops decision 0029). */
  queued?: QueuedExportRequest;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way — they are
   *  seeded from the opening balance — but the per-event rows are the window,
   *  and the menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
};

export function CompoundV2ExportMenu({ csvFilename, scopeNote, fetchAllEvents, queued, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => compoundV2PositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      queued={queued}
      csvFilename={csvFilename}
      scopeNote={scopeNote}
    />
  );
}
