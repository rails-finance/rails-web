// The export shapes for a MakerDAO vault on the position card's ⋮ (Copy
// Position, View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu`; the Markdown is the Maker serializer. The event route, which
// draws no card, passes the same shapes to the wallet row's Tools.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import { makerVaultToMarkdown, type MakerVaultMarkdownArgs } from "@/lib/makerdao/position-to-markdown";

export function makerdaoExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  ...markdownArgs
}: Omit<MakerVaultMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Loads the vault's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way, but the
   *  per-event rows are the window, and the menu says so rather than handing
   *  over a short spreadsheet. */
  scopeNote?: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => makerVaultToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    csvFilename,
    scopeNote,
  };
}
