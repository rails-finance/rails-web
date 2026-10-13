// The export shapes for a Compound V2 account on the position card's ⋮ (Copy
// Position, View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu`; the Markdown is the Compound V2 serializer. The event route,
// which draws no card, passes the same shapes to the wallet row's Tools.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import {
  compoundV2PositionToMarkdown,
  type CompoundV2PositionMarkdownArgs,
} from "@/lib/compound-v2/position-to-markdown";

export function compoundV2Exports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  queued,
  ...markdownArgs
}: Omit<CompoundV2PositionMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Loads the wallet's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** The queued export, for a history too large to build in the browser
   *  (rails-ops decision 0029). */
  queued?: QueuedExportRequest;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way, but the
   *  per-event rows are the window, and the menu says so rather than handing
   *  over a short spreadsheet. */
  scopeNote?: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => compoundV2PositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    queued,
    csvFilename,
    scopeNote,
  };
}
