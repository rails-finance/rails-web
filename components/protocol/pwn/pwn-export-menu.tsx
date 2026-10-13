// The export shapes for a PWN loan on the position card's ⋮ (Copy Position,
// View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu`; the Markdown is the PWN serializer, mirroring
// components/protocol/fluid/fluid-export-menu.tsx.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import { pwnPositionToMarkdown, type PwnPositionMarkdownArgs } from "@/lib/pwn/position-to-markdown";

export function pwnExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  ...markdownArgs
}: Omit<PwnPositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Set once this wallet's timeline is windowed and its opening balance has
   *  landed — see the checkpoint model in lib/shared/timeline-opening-balance.ts.
   *  Absent on the no-op path, which is every PWN wallet in the index today. */
  scopeNote?: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => pwnPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    csvFilename,
    ariaLabel: "Export this loan",
    scopeNote,
  };
}
