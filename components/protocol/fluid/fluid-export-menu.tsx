// The export shapes for a Fluid position on the position card's ⋮ (Copy
// Position, View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu`; the Markdown is the Fluid serializer, mirroring
// components/protocol/moonwell/moonwell-export-menu.tsx.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import { fluidPositionToMarkdown, type FluidPositionMarkdownArgs } from "@/lib/fluid/position-to-markdown";

export function fluidExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  ...markdownArgs
}: Omit<FluidPositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way — they are
   *  seeded from the opening balance — but the per-event rows are the window,
   *  and the menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => fluidPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    csvFilename,
    scopeNote,
  };
}
