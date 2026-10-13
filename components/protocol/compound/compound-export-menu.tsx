// The export shapes for a Compound V3 position on the position card's ⋮
// (Copy Position, View as Markdown, Download CSV): the shared card draws them
// with `ExportMenu`, and the event route, which draws no card, hands the same
// shapes to the wallet row's Tools.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import { compoundPositionsToMarkdown, type CompoundPositionsMarkdownArgs } from "@/lib/compound/position-to-markdown";

export function compoundExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  queued,
  ...markdownArgs
}: Omit<CompoundPositionsMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** The queued export, for a history too large to build in the browser
   *  (rails-ops decision 0029). */
  queued?: QueuedExportRequest;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way, but the
   *  per-event rows are the window, and the menu says so. */
  scopeNote?: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => compoundPositionsToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    queued,
    csvFilename,
    scopeNote,
  };
}
