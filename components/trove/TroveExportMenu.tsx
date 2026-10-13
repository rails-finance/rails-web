// The Liquity V2 Trove's export shapes for the position card's ⋮ (Copy
// Position, View as Markdown, Download CSV): the shared card draws them with
// `ExportMenu` (components/shared/export-menu.tsx); the Trove's Markdown is
// lib/liquity/trove-to-markdown.ts.

import type { PositionCardExports } from "@/components/shared/position-card";
import { troveToMarkdown, type TroveMarkdownArgs } from "@/lib/liquity/trove-to-markdown";

export function troveExports({
  csvFilename,
  ...markdownArgs
}: Omit<TroveMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => troveToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    csvFilename,
    ariaLabel: "Export this Trove",
  };
}
