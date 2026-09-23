"use client";

// Export control for the Polaris CDP detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the Polaris Markdown serializer, so the
// page can lazy-load the whole export path as one chunk off the initial
// bundle.

import { ExportMenu } from "@/components/shared/export-menu";
import { polarisPositionToMarkdown, type PolarisPositionMarkdownArgs } from "@/lib/polaris/position-to-markdown";

type Props = Omit<PolarisPositionMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
};

export function PolarisExportMenu({ csvFilename, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => polarisPositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      csvFilename={csvFilename}
    />
  );
}
