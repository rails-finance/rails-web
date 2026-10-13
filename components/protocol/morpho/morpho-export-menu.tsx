// The export shapes for a Morpho position on the position card's ⋮ (Copy
// Position, View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu`; the Markdown is the Morpho serializer, shared by Morpho Blue
// on Ethereum and on Base.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import { morphoPositionToMarkdown, type MorphoPositionMarkdownArgs } from "@/lib/morpho/position-to-markdown";

export function morphoExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  ...markdownArgs
}: Omit<MorphoPositionMarkdownArgs, "generatedAt"> & {
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
}): PositionCardExports {
  return {
    buildMarkdown: () => morphoPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    csvFilename,
    scopeNote,
  };
}
