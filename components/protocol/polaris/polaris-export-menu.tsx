// The export shapes on the Polaris CDP's card ⋮ (and on the event route's
// Tools): the Polaris Markdown serializer and the activity CSV, handed to the
// shared <ExportMenu>.

import type { PositionCardExports } from "@/components/shared/position-card";
import { polarisPositionToMarkdown, type PolarisPositionMarkdownArgs } from "@/lib/polaris/position-to-markdown";

export function polarisExports({
  csvFilename,
  ...markdownArgs
}: Omit<PolarisPositionMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
}): PositionCardExports {
  return {
    buildMarkdown: () => polarisPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: markdownArgs.events,
    csvFilename,
  };
}
