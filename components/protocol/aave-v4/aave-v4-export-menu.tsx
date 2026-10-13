// The export shapes for an Aave V4 spoke position on the position card's ⋮
// (Copy Position, View as Markdown, Download CSV): the shared card draws them
// with `ExportMenu`, and the event route, which draws no card, passes the same
// shapes to the wallet row's Tools. The Markdown is the spoke serializer.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import { spokeToMarkdown, type AaveV4SpokeMarkdownArgs } from "@/lib/aave-v4/spoke-to-markdown";

export function aaveV4Exports({
  csvFilename,
  fetchAllEvents,
  ...markdownArgs
}: Omit<AaveV4SpokeMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** The page's whole-history read for the CSV, since the page draws a window
   *  (rails-ops decisions/0019). Omitted on a position whose window held its
   *  whole life, where `events` is the download. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
}): PositionCardExports {
  return {
    buildMarkdown: () => spokeToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    fetchAllEvents,
    csvFilename,
  };
}
