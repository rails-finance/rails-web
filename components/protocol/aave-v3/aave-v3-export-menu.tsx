// The export shapes for an Aave V3 position (Ethereum, Base, Seamless) on the
// position card's ⋮ (Copy Position, View as Markdown, Download CSV): the
// shared card draws them with `ExportMenu`, and the event route, which draws
// no card, passes the same shapes to the wallet row's Tools. The Markdown is
// the V3 serializer.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { QueuedExportRequest } from "@/lib/shared/queued-export";
import { aaveV3PositionToMarkdown, type AaveV3PositionMarkdownArgs } from "@/lib/aave-v3/position-to-markdown";

export function aaveV3Exports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  queued,
  ...markdownArgs
}: Omit<AaveV3PositionMarkdownArgs, "generatedAt"> & {
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
}): PositionCardExports {
  return {
    buildMarkdown: () => aaveV3PositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    queued,
    csvFilename,
    scopeNote,
  };
}
