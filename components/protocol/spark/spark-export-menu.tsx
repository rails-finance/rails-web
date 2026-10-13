// SparkLend's export shapes for the position card's ⋮ (Copy Position, View as
// Markdown, Download CSV): the shared <ExportMenu>'s props with the Spark
// Markdown serializer. The event route, which draws no card, hands the same
// object to the wallet row's Tools.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import { sparkPositionToMarkdown, type SparkPositionMarkdownArgs } from "@/lib/spark/position-to-markdown";

type Args = Omit<SparkPositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** The queued export, for a history too large to build in the browser
   *  (rails-ops decision 0029). */
  queued?: QueuedExportRequest;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way (seeded
   *  from the opening balance); the per-event rows are the window, and the
   *  menu says so. */
  scopeNote?: string;
};

export function sparkExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  queued,
  ...markdownArgs
}: Args): PositionCardExports {
  return {
    buildMarkdown: () => sparkPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    queued,
    csvFilename,
    scopeNote,
  };
}
